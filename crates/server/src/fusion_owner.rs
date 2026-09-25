//! Private native-owned resource process. No HTTP listener, relay, scheduler or
//! global cdesktop deployment is started by this module. The cdesktop execution
//! service is created lazily, only for a validated bound task command.
//!
//! The parent authenticates the business owner and performs the backend binding
//! intent/commit/authorize operations. A private inherited pipe is the only input.
//! Creating these records does not mean an agent has executed in the session.
use std::{
    collections::{HashMap, VecDeque},
    io::{BufRead, Write},
    path::Path,
    sync::Arc,
};

use db::{
    DBService,
    models::{
        coding_agent_turn::CodingAgentTurn,
        execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
        repo::Repo,
        session::Session,
        workspace::Workspace,
    },
};
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest,
    },
    executors::BaseCodingAgent,
    profile::{ExecutorConfig, ExecutorProfileId},
};
use local_deployment::{container::LocalContainerService, pty::PtyService};
use serde::{Deserialize, Serialize};
use services::services::{
    approvals::Approvals, config::Config, container::ContainerService, file::FileService,
    queued_message::QueuedMessageService,
};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use tokio::sync::RwLock;
use utils::{
    approvals::{ApprovalOutcome, ApprovalResponse, QuestionAnswer},
    log_msg::LogMsg,
};
use uuid::Uuid;
use workspace_manager::WorkspaceManager;

const MAX_FRAME: u64 = 32 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bootstrap {
    pub protocol: u32,
    pub owner_key: String,
    pub installation_id: String,
    pub generation: String,
    pub runtime_root: std::path::PathBuf,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Provision {
        job_id: String,
        title: String,
    },
    Read {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
    },
    ReadSessionHistory {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
    },
    ReadDiff {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
    },
    StartExecution {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        business_attempt_id: Option<String>,
        prompt: String,
        intent: ExecutionIntent,
    },
    ReadExecution {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
    },
    CancelExecution {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
    },
    ReadApprovals {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
    },
    RespondApproval {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
        approval_id: String,
        response: OwnerApprovalResponse,
    },
    StartTerminal {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        cols: u16,
        rows: u16,
    },
    ReadTerminal {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
        after_sequence: u64,
    },
    WriteTerminal {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
        data_base64: String,
    },
    ResizeTerminal {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
        cols: u16,
        rows: u16,
    },
    CloseTerminal {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
    },
    ListFiles {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        relative_path: String,
    },
    ReadFile {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        relative_path: String,
    },
    ReadPreview {
        preview_id: Uuid,
        sequence: u32,
    },
    BeginImport {
        job_id: String,
        workspace_id: Uuid,
        session_id: Uuid,
        artifact_id: String,
        relative_path: String,
        bytes: u64,
        sha256: String,
        version: u64,
    },
    UploadChunk {
        import_id: Uuid,
        sequence: u32,
        data_base64: String,
    },
    FinishImport {
        import_id: Uuid,
    },
    AbortImport {
        import_id: Uuid,
    },
    Stop,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionIntent {
    TechnicalUser,
}

#[derive(Deserialize)]
#[serde(tag = "decision", rename_all = "snake_case", deny_unknown_fields)]
pub enum OwnerApprovalResponse {
    Approve {},
    Deny { reason: Option<String> },
    Answer { answers: Vec<QuestionAnswer> },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    request_id: Uuid,
    generation: String,
    command: Command,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ResourceReceipt {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub resource_fingerprint: String,
}

fn bounded_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
}

fn bounded_trace_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
}

impl Bootstrap {
    fn validate(&self) -> Result<(), &'static str> {
        if self.protocol != 1
            || self.owner_key.len() != 64
            || !self
                .owner_key
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            || !bounded_id(&self.installation_id)
            || !bounded_id(&self.generation)
        {
            return Err("owner_bootstrap_invalid");
        }
        if !self.runtime_root.is_absolute()
            || self.runtime_root.file_name().and_then(|v| v.to_str()) != Some("owner-runtimes")
        {
            return Err("owner_directory_invalid");
        }
        Ok(())
    }
}

fn read_frame(reader: &mut impl BufRead) -> Result<Option<String>, &'static str> {
    use std::io::Read;
    let mut frame = String::new();
    let count = reader
        .take(MAX_FRAME + 1)
        .read_line(&mut frame)
        .map_err(|_| "owner_pipe_read_failed")?;
    if count == 0 {
        return Ok(None);
    }
    if count as u64 > MAX_FRAME || !frame.ends_with('\n') {
        return Err("owner_frame_invalid");
    }
    Ok(Some(frame))
}

fn write_frame(writer: &mut impl Write, value: &serde_json::Value) -> Result<(), &'static str> {
    let encoded = serde_json::to_vec(value).map_err(|_| "owner_pipe_write_failed")?;
    if encoded.len() + 1 > MAX_FRAME as usize {
        return Err("owner_frame_invalid");
    }
    writer
        .write_all(&encoded)
        .map_err(|_| "owner_pipe_write_failed")?;
    writer
        .write_all(b"\n")
        .map_err(|_| "owner_pipe_write_failed")?;
    writer.flush().map_err(|_| "owner_pipe_write_failed")
}

/// Refuse old or ambiguously owned data. The directory must be a native-derived
/// owner child directory, never a user-supplied arbitrary cdesktop database.
fn claim_directory(path: &Path, bootstrap: &Bootstrap) -> Result<(), &'static str> {
    if !path.is_absolute()
        || path != bootstrap.runtime_root.join(&bootstrap.owner_key)
        || path.components().any(|c| {
            matches!(
                c,
                std::path::Component::ParentDir | std::path::Component::CurDir
            )
        })
    {
        return Err("owner_directory_invalid");
    }
    for ancestor in path.ancestors() {
        match std::fs::symlink_metadata(ancestor) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    return Err("owner_directory_alias");
                }
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if metadata.file_attributes() & 0x400 != 0 {
                        return Err("owner_directory_alias");
                    }
                }
                if !metadata.is_dir() {
                    return Err("owner_directory_invalid");
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("owner_directory_unavailable"),
        }
    }
    std::fs::create_dir_all(path).map_err(|_| "owner_directory_unavailable")?;
    let marker_path = path.join("fusion-owner-v1.json");
    let marker = serde_json::json!({"protocol": 1, "owner_key": bootstrap.owner_key, "installation_id": bootstrap.installation_id});
    if marker_path.exists() {
        let metadata =
            std::fs::symlink_metadata(&marker_path).map_err(|_| "owner_marker_unavailable")?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("owner_marker_invalid");
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err("owner_marker_invalid");
            }
        }
        let mut bytes = Vec::new();
        use std::io::Read;
        std::fs::File::open(&marker_path)
            .map_err(|_| "owner_marker_unavailable")?
            .take(4097)
            .read_to_end(&mut bytes)
            .map_err(|_| "owner_marker_unavailable")?;
        if bytes.len() > 4096 {
            return Err("owner_marker_invalid");
        }
        let existing: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| "owner_marker_invalid")?;
        if existing != marker {
            return Err("owner_marker_mismatch");
        }
    } else {
        // A crash before publishing the marker may leave our incomplete staging
        // file. It is inert, never read as authority, and never silently deleted.
        for entry in std::fs::read_dir(path).map_err(|_| "owner_directory_unavailable")? {
            let entry = entry.map_err(|_| "owner_directory_unavailable")?;
            let name = entry.file_name();
            let pending = name
                .to_str()
                .and_then(|v| v.strip_prefix(".fusion-owner-v1."))
                .and_then(|v| v.strip_suffix(".pending"));
            if pending.and_then(|v| Uuid::parse_str(v).ok()).is_none()
                || !entry
                    .file_type()
                    .map_err(|_| "owner_directory_unavailable")?
                    .is_file()
            {
                return Err("owner_directory_unclaimed");
            }
        }
        let pending = path.join(format!(".fusion-owner-v1.{}.pending", Uuid::new_v4()));
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&pending)
            .map_err(|_| "owner_marker_unavailable")?;
        file.write_all(
            serde_json::to_string(&marker)
                .map_err(|_| "owner_marker_invalid")?
                .as_bytes(),
        )
        .and_then(|_| file.sync_all())
        .map_err(|_| "owner_marker_unavailable")?;
        drop(file);
        // Atomic, no-replace publication. A concurrent initializer cannot replace
        // another owner's final marker. Filesystems without hard links fail closed.
        match std::fs::hard_link(&pending, &marker_path) {
            Ok(()) => {
                let _ = std::fs::remove_file(&pending);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                let _ = std::fs::remove_file(&pending);
                return claim_directory(path, bootstrap);
            }
            Err(_) => return Err("owner_marker_publish_failed"),
        }
    }
    Ok(())
}

async fn initialize(pool: &SqlitePool, bootstrap: &Bootstrap) -> Result<(), &'static str> {
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|_| "owner_database_unavailable")?;
    sqlx::query("CREATE TABLE IF NOT EXISTS fusion_owner_identity_v1 (id INTEGER PRIMARY KEY CHECK(id=1), owner_key TEXT NOT NULL, installation_id TEXT NOT NULL)").execute(&mut *tx).await.map_err(|_| "owner_database_unavailable")?;
    let identity =
        sqlx::query("SELECT owner_key,installation_id FROM fusion_owner_identity_v1 WHERE id=1")
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| "owner_database_unavailable")?;
    if let Some(row) = identity {
        if row.get::<String, _>("owner_key") != bootstrap.owner_key
            || row.get::<String, _>("installation_id") != bootstrap.installation_id
        {
            return Err("owner_database_identity_mismatch");
        }
    } else {
        if sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM workspaces")
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| "owner_database_unavailable")?
            != 0
        {
            return Err("owner_database_unclaimed");
        }
        sqlx::query(
            "INSERT INTO fusion_owner_identity_v1(id,owner_key,installation_id) VALUES(1,?,?)",
        )
        .bind(&bootstrap.owner_key)
        .bind(&bootstrap.installation_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| "owner_database_unavailable")?;
    }
    sqlx::query("CREATE TABLE IF NOT EXISTS fusion_task_resources_v1 (job_id TEXT PRIMARY KEY, workspace_id BLOB NOT NULL UNIQUE REFERENCES workspaces(id), session_id BLOB NOT NULL UNIQUE REFERENCES sessions(id), resource_fingerprint TEXT NOT NULL)").execute(&mut *tx).await.map_err(|_| "owner_database_unavailable")?;
    sqlx::query("CREATE TABLE IF NOT EXISTS fusion_execution_links_v1 (execution_id BLOB PRIMARY KEY REFERENCES execution_processes(id), job_id TEXT NOT NULL REFERENCES fusion_task_resources_v1(job_id), workspace_id BLOB NOT NULL, session_id BLOB NOT NULL, business_attempt_id TEXT, intent TEXT NOT NULL CHECK(intent='technical_user'))").execute(&mut *tx).await.map_err(|_| "owner_database_unavailable")?;
    tx.commit()
        .await
        .map_err(|_| "owner_database_unavailable")?;
    Ok(())
}

fn fingerprint(
    bootstrap: &Bootstrap,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
) -> Result<String, &'static str> {
    let body = serde_json::json!({"protocol":1,"owner_key":bootstrap.owner_key,"installation_id":bootstrap.installation_id,"job_id":job_id,"workspace_id":workspace_id,"session_id":session_id});
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&body).map_err(|_| "owner_resource_invalid")?)
    ))
}

fn verify_receipt(
    bootstrap: &Bootstrap,
    value: ResourceReceipt,
) -> Result<ResourceReceipt, &'static str> {
    if value.resource_fingerprint
        != fingerprint(
            bootstrap,
            &value.job_id,
            value.workspace_id,
            value.session_id,
        )?
    {
        return Err("owner_resource_identity_mismatch");
    }
    Ok(value)
}

fn receipt(row: sqlx::sqlite::SqliteRow) -> Result<ResourceReceipt, sqlx::Error> {
    Ok(ResourceReceipt {
        job_id: row.try_get("job_id")?,
        workspace_id: row.try_get("workspace_id")?,
        session_id: row.try_get("session_id")?,
        resource_fingerprint: row.try_get("resource_fingerprint")?,
    })
}

async fn ensure_workspace_repo(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    bootstrap: &Bootstrap,
    workspace_id: Uuid,
    title: &str,
    target_branch: &str,
) -> Result<(), &'static str> {
    let root = task_files::root_path(bootstrap, workspace_id);
    let rows = sqlx::query(
        "SELECT r.path,wr.target_branch FROM workspace_repos wr JOIN repos r ON r.id=wr.repo_id WHERE wr.workspace_id=?",
    )
    .bind(workspace_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|_| "owner_database_unavailable")?;
    if rows.len() > 1 {
        return Err("owner_resource_invalid");
    }
    if let Some(row) = rows.first() {
        let path: String = row.try_get("path").map_err(|_| "owner_resource_invalid")?;
        let branch: String = row
            .try_get("target_branch")
            .map_err(|_| "owner_resource_invalid")?;
        if path != root.to_string_lossy().as_ref() || branch != target_branch {
            return Err("owner_resource_invalid");
        }
        return Ok(());
    }
    let is_git = git2::Repository::open(&root).is_ok();
    let repo = Repo::find_or_create(&mut **tx, &root, title, is_git)
        .await
        .map_err(|_| "owner_database_unavailable")?;
    sqlx::query(
        "INSERT INTO workspace_repos(id,workspace_id,repo_id,target_branch) VALUES(?,?,?,?)",
    )
    .bind(Uuid::new_v4())
    .bind(workspace_id)
    .bind(repo.id)
    .bind(target_branch)
    .execute(&mut **tx)
    .await
    .map_err(|_| "owner_database_unavailable")?;
    Ok(())
}

async fn provision(
    pool: &SqlitePool,
    bootstrap: &Bootstrap,
    job_id: &str,
    title: &str,
) -> Result<ResourceReceipt, &'static str> {
    if !bounded_id(job_id) || title.trim().is_empty() || title.len() > 1200 {
        return Err("owner_resource_request_invalid");
    }
    // A write reservation serializes same-job creation across child restarts and
    // accidental concurrent parent processes. All three records commit together.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|_| "owner_database_unavailable")?;
    if let Some(row) = sqlx::query("SELECT * FROM fusion_task_resources_v1 WHERE job_id = ?")
        .bind(job_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| "owner_database_unavailable")?
    {
        let value = verify_receipt(
            bootstrap,
            receipt(row).map_err(|_| "owner_resource_invalid")?,
        )?;
        let matched = sqlx::query_scalar::<_,i64>("SELECT COUNT(*) FROM workspaces w JOIN sessions s ON s.workspace_id=w.id WHERE w.id=? AND s.id=?").bind(value.workspace_id).bind(value.session_id).fetch_one(&mut *tx).await.map_err(|_| "owner_database_unavailable")?;
        if matched != 1 {
            return Err("owner_resource_invalid");
        }
        task_files::ensure_root(bootstrap, value.workspace_id)?;
        let branch = format!("chaotang/{job_id}");
        ensure_workspace_repo(&mut tx, bootstrap, value.workspace_id, title, &branch).await?;
        tx.commit()
            .await
            .map_err(|_| "owner_database_unavailable")?;
        return Ok(value);
    }
    let workspace_id = Uuid::new_v4();
    let session_id = Uuid::new_v4();
    let fingerprint = fingerprint(bootstrap, job_id, workspace_id, session_id)?;
    sqlx::query("INSERT INTO workspaces(id,branch,name,use_worktree) VALUES(?,?,?,0)")
        .bind(workspace_id)
        .bind(format!("chaotang/{job_id}"))
        .bind(title)
        .execute(&mut *tx)
        .await
        .map_err(|_| "owner_database_unavailable")?;
    sqlx::query("INSERT INTO sessions(id,workspace_id,name,executor) VALUES(?,?,?,NULL)")
        .bind(session_id)
        .bind(workspace_id)
        .bind(title)
        .execute(&mut *tx)
        .await
        .map_err(|_| "owner_database_unavailable")?;
    sqlx::query("INSERT INTO fusion_task_resources_v1(job_id,workspace_id,session_id,resource_fingerprint) VALUES(?,?,?,?)")
        .bind(job_id).bind(workspace_id).bind(session_id).bind(&fingerprint).execute(&mut *tx).await.map_err(|_| "owner_database_unavailable")?;
    task_files::ensure_root(bootstrap, workspace_id)?;
    ensure_workspace_repo(
        &mut tx,
        bootstrap,
        workspace_id,
        title,
        &format!("chaotang/{job_id}"),
    )
    .await?;
    tx.commit()
        .await
        .map_err(|_| "owner_database_unavailable")?;
    Ok(ResourceReceipt {
        job_id: job_id.into(),
        workspace_id,
        session_id,
        resource_fingerprint: fingerprint,
    })
}

async fn read_resource(
    pool: &SqlitePool,
    bootstrap: &Bootstrap,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
) -> Result<serde_json::Value, &'static str> {
    let row = sqlx::query(
        "SELECT * FROM fusion_task_resources_v1 WHERE job_id=? AND workspace_id=? AND session_id=?",
    )
    .bind(job_id)
    .bind(workspace_id)
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| "owner_database_unavailable")?
    .ok_or("owner_resource_not_found")?;
    let binding = verify_receipt(
        bootstrap,
        receipt(row).map_err(|_| "owner_resource_invalid")?,
    )?;
    let workspace = Workspace::find_by_id(pool, workspace_id)
        .await
        .map_err(|_| "owner_database_unavailable")?
        .ok_or("owner_resource_not_found")?;
    let session = Session::find_by_id(pool, session_id)
        .await
        .map_err(|_| "owner_database_unavailable")?
        .ok_or("owner_resource_not_found")?;
    if session.workspace_id != workspace.id {
        return Err("owner_resource_invalid");
    }
    Ok(
        serde_json::json!({"binding": binding, "workspace": workspace, "session": session, "execution_available": true, "terminal_available": true, "preview_available": true, "files_available":task_files::root_available(bootstrap, workspace_id)?}),
    )
}

async fn read_session_history(
    pool: &SqlitePool,
    bootstrap: &Bootstrap,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
) -> Result<serde_json::Value, &'static str> {
    if !bounded_id(job_id) {
        return Err("owner_resource_request_invalid");
    }
    let row = sqlx::query(
        "SELECT * FROM fusion_task_resources_v1 WHERE job_id=? AND workspace_id=? AND session_id=?",
    )
    .bind(job_id)
    .bind(workspace_id)
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|_| "owner_database_unavailable")?
    .ok_or("owner_resource_not_found")?;
    verify_receipt(
        bootstrap,
        receipt(row).map_err(|_| "owner_resource_invalid")?,
    )?;
    let matched =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sessions WHERE id=? AND workspace_id=?")
            .bind(session_id)
            .bind(workspace_id)
            .fetch_one(pool)
            .await
            .map_err(|_| "owner_database_unavailable")?;
    if matched != 1 {
        return Err("owner_resource_invalid");
    }
    let mut rows = sqlx::query(
        "SELECT id,run_reason,status,exit_code,started_at,completed_at,created_at FROM execution_processes WHERE session_id=? AND dropped=FALSE ORDER BY created_at DESC,id DESC LIMIT 201",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|_| "owner_database_unavailable")?;
    let truncated = rows.len() > 200;
    rows.truncate(200);
    rows.reverse();
    let entries = rows
        .into_iter()
        .map(|row| {
            let event_id: Uuid = row.try_get("id").map_err(|_| "owner_resource_invalid")?;
            let kind: String = row
                .try_get("run_reason")
                .map_err(|_| "owner_resource_invalid")?;
            let state: String = row
                .try_get("status")
                .map_err(|_| "owner_resource_invalid")?;
            if !matches!(
                kind.as_str(),
                "setupscript" | "cleanupscript" | "archivescript" | "codingagent" | "devserver"
            ) || !matches!(
                state.as_str(),
                "running" | "completed" | "failed" | "killed"
            ) {
                return Err("owner_resource_invalid");
            }
            let started_at: sqlx::types::chrono::DateTime<sqlx::types::chrono::Utc> = row
                .try_get("started_at")
                .map_err(|_| "owner_resource_invalid")?;
            let completed_at: Option<sqlx::types::chrono::DateTime<sqlx::types::chrono::Utc>> = row
                .try_get("completed_at")
                .map_err(|_| "owner_resource_invalid")?;
            let created_at: sqlx::types::chrono::DateTime<sqlx::types::chrono::Utc> = row
                .try_get("created_at")
                .map_err(|_| "owner_resource_invalid")?;
            let exit_code: Option<i64> = row
                .try_get("exit_code")
                .map_err(|_| "owner_resource_invalid")?;
            Ok(serde_json::json!({
                "event_id":event_id,
                "kind":kind,
                "state":state,
                "exit_code":exit_code,
                "started_at":started_at.to_rfc3339(),
                "completed_at":completed_at.map(|value| value.to_rfc3339()),
                "created_at":created_at.to_rfc3339()
            }))
        })
        .collect::<Result<Vec<_>, &'static str>>()?;
    Ok(serde_json::json!({
        "job_id":job_id,
        "workspace_id":workspace_id,
        "session_id":session_id,
        "entries":entries,
        "truncated":truncated
    }))
}

async fn read_task_diff(
    pool: &SqlitePool,
    bootstrap: &Bootstrap,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
) -> Result<serde_json::Value, &'static str> {
    read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
    task_diff::read(bootstrap, job_id, workspace_id, session_id)
}

struct OwnerExecutionState {
    container: Option<LocalContainerService>,
}

impl OwnerExecutionState {
    fn new() -> Self {
        Self { container: None }
    }

    async fn container(
        &mut self,
        pool: &SqlitePool,
    ) -> Result<&LocalContainerService, &'static str> {
        if self.container.is_none() {
            let db = DBService { pool: pool.clone() };
            let mut config = Config::default();
            config.analytics_enabled = false;
            config.relay_enabled = false;
            config.executor_profile = ExecutorProfileId::with_variant(
                BaseCodingAgent::Codex,
                "CHAOTANG_SUPERVISED".to_string(),
            );
            let config = Arc::new(RwLock::new(config));
            let workspace_manager = WorkspaceManager::new(db.clone());
            let file = FileService::new(pool.clone()).map_err(|_| "owner_execution_unavailable")?;
            let msg_stores = Arc::new(RwLock::new(HashMap::new()));
            let container = LocalContainerService::new(
                db,
                workspace_manager,
                msg_stores,
                config,
                git::GitService::new(),
                file,
                None,
                Approvals::new(),
                QueuedMessageService::new(),
                None,
            )
            .await;
            container
                .cleanup_orphan_executions()
                .await
                .map_err(|_| "owner_execution_unavailable")?;
            self.container = Some(container);
        }
        self.container.as_ref().ok_or("owner_execution_unavailable")
    }

    async fn start(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        business_attempt_id: Option<String>,
        prompt: String,
        intent: ExecutionIntent,
    ) -> Result<serde_json::Value, &'static str> {
        if prompt.trim().is_empty()
            || prompt.len() > 65_536
            || business_attempt_id
                .as_deref()
                .is_some_and(|value| !bounded_trace_id(value))
        {
            return Err("owner_execution_request_invalid");
        }
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        if ExecutionProcess::has_running_coding_agent_for_session(pool, session_id)
            .await
            .map_err(|_| "owner_database_unavailable")?
        {
            return Err("owner_execution_already_running");
        }
        let workspace = Workspace::find_by_id(pool, workspace_id)
            .await
            .map_err(|_| "owner_database_unavailable")?
            .ok_or("owner_resource_not_found")?;
        let session = Session::find_by_id(pool, session_id)
            .await
            .map_err(|_| "owner_database_unavailable")?
            .ok_or("owner_resource_not_found")?;
        if session.workspace_id != workspace_id
            || workspace.use_worktree
            || session
                .executor
                .as_deref()
                .is_some_and(|value| value != BaseCodingAgent::Codex.to_string())
        {
            return Err("owner_execution_binding_invalid");
        }
        if session.executor.is_none() {
            Session::update_executor(pool, session_id, &BaseCodingAgent::Codex.to_string())
                .await
                .map_err(|_| "owner_database_unavailable")?;
        }
        let executor_config: ExecutorConfig = ExecutorProfileId::with_variant(
            BaseCodingAgent::Codex,
            "CHAOTANG_SUPERVISED".to_string(),
        )
        .into();
        let working_dir = session
            .agent_working_dir
            .as_ref()
            .filter(|value| !value.is_empty())
            .cloned();
        let action_type = match CodingAgentTurn::find_latest_session_info(pool, session_id)
            .await
            .map_err(|_| "owner_database_unavailable")?
        {
            Some(previous) => {
                ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
                    prompt,
                    session_id: previous.session_id,
                    reset_to_message_id: None,
                    executor_config,
                    working_dir,
                })
            }
            None => ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                prompt,
                executor_config,
                working_dir,
            }),
        };
        let action = ExecutorAction::new(action_type, None);
        let container = self.container(pool).await?;
        container
            .ensure_container_exists(&workspace)
            .await
            .map_err(|_| "owner_execution_unavailable")?;
        let process = container
            .start_execution(
                &workspace,
                &session,
                &action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await
            .map_err(|_| "owner_execution_start_failed")?;
        let intent = match intent {
            ExecutionIntent::TechnicalUser => "technical_user",
        };
        if sqlx::query("INSERT INTO fusion_execution_links_v1(execution_id,job_id,workspace_id,session_id,business_attempt_id,intent) VALUES(?,?,?,?,?,?)")
            .bind(process.id)
            .bind(job_id)
            .bind(workspace_id)
            .bind(session_id)
            .bind(&business_attempt_id)
            .bind(intent)
            .execute(pool)
            .await
            .is_err()
        {
            let _ = container
                .stop_execution(&process, ExecutionProcessStatus::Killed)
                .await;
            return Err("owner_execution_link_failed");
        }
        Ok(execution_value(
            &process,
            job_id,
            workspace_id,
            business_attempt_id.as_deref(),
        ))
    }

    async fn read(
        &self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        directory: &Path,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
    ) -> Result<serde_json::Value, &'static str> {
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        let (process, business_attempt_id) =
            bound_execution(pool, job_id, workspace_id, session_id, execution_id).await?;
        let path = utils::execution_logs::process_log_file_path_in_root(
            directory,
            session_id,
            execution_id,
        );
        let mut entries = Vec::new();
        let mut truncated = false;
        match tokio::fs::read(&path).await {
            Ok(bytes) => {
                const MAX_LOG_BYTES: usize = 512 * 1024;
                let start = bytes.len().saturating_sub(MAX_LOG_BYTES);
                truncated = start > 0;
                let text = String::from_utf8_lossy(&bytes[start..]);
                entries = text
                    .lines()
                    .filter_map(|line| serde_json::from_str::<LogMsg>(line).ok())
                    .filter_map(|entry| match entry {
                        LogMsg::Stdout(text) => {
                            Some(serde_json::json!({"kind":"stdout","text":text}))
                        }
                        LogMsg::Stderr(text) => {
                            Some(serde_json::json!({"kind":"stderr","text":text}))
                        }
                        _ => None,
                    })
                    .collect();
                if entries.len() > 200 {
                    entries.drain(..entries.len() - 200);
                    truncated = true;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("owner_execution_log_unavailable"),
        }
        let mut value = execution_value(
            &process,
            job_id,
            workspace_id,
            business_attempt_id.as_deref(),
        );
        value["entries"] = serde_json::Value::Array(entries);
        value["truncated"] = serde_json::Value::Bool(truncated);
        Ok(value)
    }

    async fn cancel(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
    ) -> Result<serde_json::Value, &'static str> {
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        let (process, _) =
            bound_execution(pool, job_id, workspace_id, session_id, execution_id).await?;
        if process.status != ExecutionProcessStatus::Running {
            return Err("owner_execution_not_running");
        }
        self.container(pool)
            .await?
            .stop_execution(&process, ExecutionProcessStatus::Killed)
            .await
            .map_err(|_| "owner_execution_cancel_failed")?;
        let (updated, business_attempt_id) =
            bound_execution(pool, job_id, workspace_id, session_id, execution_id).await?;
        Ok(execution_value(
            &updated,
            job_id,
            workspace_id,
            business_attempt_id.as_deref(),
        ))
    }

    async fn approvals(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
    ) -> Result<serde_json::Value, &'static str> {
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        bound_execution(pool, job_id, workspace_id, session_id, execution_id).await?;
        let entries = self
            .container(pool)
            .await?
            .approvals()
            .pending_infos_for_execution(execution_id);
        Ok(serde_json::json!({
            "job_id":job_id,
            "workspace_id":workspace_id,
            "session_id":session_id,
            "execution_id":execution_id,
            "entries":entries
        }))
    }

    #[allow(clippy::too_many_arguments)]
    async fn respond_approval(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        execution_id: Uuid,
        approval_id: String,
        response: OwnerApprovalResponse,
    ) -> Result<serde_json::Value, &'static str> {
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        bound_execution(pool, job_id, workspace_id, session_id, execution_id).await?;
        if Uuid::parse_str(&approval_id).is_err() {
            return Err("owner_approval_request_invalid");
        }
        let container = self.container(pool).await?;
        let pending = container
            .approvals()
            .pending_infos_for_execution(execution_id)
            .into_iter()
            .find(|info| info.approval_id == approval_id)
            .ok_or("owner_approval_not_found")?;
        let status = match response {
            OwnerApprovalResponse::Approve {} if !pending.is_question => ApprovalOutcome::Approved,
            OwnerApprovalResponse::Deny { reason } if !pending.is_question => {
                if reason.as_ref().is_some_and(|value| value.len() > 1_000) {
                    return Err("owner_approval_request_invalid");
                }
                ApprovalOutcome::Denied { reason }
            }
            OwnerApprovalResponse::Answer { answers } if pending.is_question => {
                if answers.is_empty()
                    || answers.len() > 20
                    || answers.iter().any(|answer| {
                        answer.question.trim().is_empty()
                            || answer.question.len() > 4_096
                            || answer.answer.is_empty()
                            || answer.answer.len() > 20
                            || answer
                                .answer
                                .iter()
                                .any(|value| value.trim().is_empty() || value.len() > 4_096)
                    })
                {
                    return Err("owner_approval_request_invalid");
                }
                ApprovalOutcome::Answered { answers }
            }
            _ => return Err("owner_approval_response_invalid"),
        };
        let (outcome, context) = container
            .approvals()
            .respond(
                &approval_id,
                ApprovalResponse {
                    execution_process_id: execution_id,
                    status,
                },
            )
            .await
            .map_err(|_| "owner_approval_response_failed")?;
        if context.execution_process_id != execution_id {
            return Err("owner_approval_binding_invalid");
        }
        Ok(serde_json::json!({
            "job_id":job_id,
            "workspace_id":workspace_id,
            "session_id":session_id,
            "execution_id":execution_id,
            "approval_id":approval_id,
            "tool_name":context.tool_name,
            "outcome":outcome
        }))
    }

    async fn shutdown(&mut self) {
        if let Some(container) = self.container.take() {
            let _ = container.kill_all_running_processes().await;
        }
    }
}

const TERMINAL_HISTORY_BYTES: usize = 256 * 1024;
const TERMINAL_READ_BYTES: usize = 64 * 1024;
const TERMINAL_INPUT_BYTES: usize = 4 * 1024;

struct OwnerTerminal {
    job_id: String,
    workspace_id: Uuid,
    session_id: Uuid,
    output: tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>,
    history: VecDeque<(u64, Vec<u8>)>,
    history_bytes: usize,
    next_sequence: u64,
    active: bool,
}

struct OwnerTerminalState {
    service: PtyService,
    terminals: HashMap<Uuid, OwnerTerminal>,
}

impl OwnerTerminalState {
    fn new() -> Self {
        Self {
            service: PtyService::new(),
            terminals: HashMap::new(),
        }
    }

    fn dimensions(cols: u16, rows: u16) -> Result<(), &'static str> {
        if !(20..=400).contains(&cols) || !(5..=200).contains(&rows) {
            return Err("owner_terminal_dimensions_invalid");
        }
        Ok(())
    }

    fn bound(
        terminal: &OwnerTerminal,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
    ) -> Result<(), &'static str> {
        if terminal.job_id != job_id
            || terminal.workspace_id != workspace_id
            || terminal.session_id != session_id
        {
            return Err("owner_terminal_binding_invalid");
        }
        Ok(())
    }

    async fn start(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        cols: u16,
        rows: u16,
    ) -> Result<serde_json::Value, &'static str> {
        Self::dimensions(cols, rows)?;
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        if let Some((terminal_id, terminal)) = self.terminals.iter().find(|(_, terminal)| {
            terminal.workspace_id == workspace_id && terminal.session_id == session_id
        }) {
            Self::bound(terminal, job_id, workspace_id, session_id)?;
            return Ok(serde_json::json!({
                "job_id":job_id,
                "workspace_id":workspace_id,
                "session_id":session_id,
                "terminal_id":terminal_id,
                "active":terminal.active,
                "next_sequence":terminal.next_sequence.saturating_sub(1)
            }));
        }
        let root = task_files::locked_root(bootstrap, workspace_id)?;
        let (terminal_id, output) = self
            .service
            .create_session(root.path, cols, rows)
            .await
            .map_err(|_| "owner_terminal_start_failed")?;
        self.terminals.insert(
            terminal_id,
            OwnerTerminal {
                job_id: job_id.to_owned(),
                workspace_id,
                session_id,
                output,
                history: VecDeque::new(),
                history_bytes: 0,
                next_sequence: 1,
                active: true,
            },
        );
        Ok(serde_json::json!({
            "job_id":job_id,
            "workspace_id":workspace_id,
            "session_id":session_id,
            "terminal_id":terminal_id,
            "active":true,
            "next_sequence":0
        }))
    }

    async fn read(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
        after_sequence: u64,
    ) -> Result<serde_json::Value, &'static str> {
        use base64::{Engine, engine::general_purpose::STANDARD};
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        let terminal = self
            .terminals
            .get_mut(&terminal_id)
            .ok_or("owner_terminal_not_found")?;
        Self::bound(terminal, job_id, workspace_id, session_id)?;
        loop {
            match terminal.output.try_recv() {
                Ok(bytes) => {
                    if bytes.is_empty() {
                        continue;
                    }
                    let sequence = terminal.next_sequence;
                    terminal.next_sequence = terminal
                        .next_sequence
                        .checked_add(1)
                        .ok_or("owner_terminal_output_invalid")?;
                    terminal.history_bytes += bytes.len();
                    terminal.history.push_back((sequence, bytes));
                    while terminal.history_bytes > TERMINAL_HISTORY_BYTES {
                        if let Some((_, removed)) = terminal.history.pop_front() {
                            terminal.history_bytes -= removed.len();
                        }
                    }
                }
                Err(tokio::sync::mpsc::error::TryRecvError::Empty) => break,
                Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => {
                    terminal.active = false;
                    break;
                }
            }
        }
        let earliest = terminal
            .history
            .front()
            .map(|(sequence, _)| *sequence)
            .unwrap_or(terminal.next_sequence);
        let mut bytes = 0usize;
        let mut entries = Vec::new();
        for (sequence, data) in terminal
            .history
            .iter()
            .filter(|(sequence, _)| *sequence > after_sequence)
        {
            if bytes + data.len() > TERMINAL_READ_BYTES && !entries.is_empty() {
                break;
            }
            bytes += data.len();
            entries.push(serde_json::json!({
                "sequence":sequence,
                "data_base64":STANDARD.encode(data)
            }));
        }
        Ok(serde_json::json!({
            "job_id":job_id,
            "workspace_id":workspace_id,
            "session_id":session_id,
            "terminal_id":terminal_id,
            "active":terminal.active,
            "earliest_sequence":earliest,
            "next_sequence":terminal.next_sequence.saturating_sub(1),
            "truncated":after_sequence.saturating_add(1) < earliest,
            "entries":entries
        }))
    }

    async fn write(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
        data_base64: &str,
    ) -> Result<serde_json::Value, &'static str> {
        use base64::{Engine, engine::general_purpose::STANDARD};
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        let terminal = self
            .terminals
            .get(&terminal_id)
            .ok_or("owner_terminal_not_found")?;
        Self::bound(terminal, job_id, workspace_id, session_id)?;
        if !terminal.active {
            return Err("owner_terminal_closed");
        }
        let data = STANDARD
            .decode(data_base64)
            .map_err(|_| "owner_terminal_input_invalid")?;
        if data.is_empty() || data.len() > TERMINAL_INPUT_BYTES {
            return Err("owner_terminal_input_invalid");
        }
        self.service
            .write(terminal_id, &data)
            .await
            .map_err(|_| "owner_terminal_write_failed")?;
        Ok(serde_json::json!({"terminal_id":terminal_id,"accepted_bytes":data.len()}))
    }

    async fn resize(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
        cols: u16,
        rows: u16,
    ) -> Result<serde_json::Value, &'static str> {
        Self::dimensions(cols, rows)?;
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        let terminal = self
            .terminals
            .get(&terminal_id)
            .ok_or("owner_terminal_not_found")?;
        Self::bound(terminal, job_id, workspace_id, session_id)?;
        self.service
            .resize(terminal_id, cols, rows)
            .await
            .map_err(|_| "owner_terminal_resize_failed")?;
        Ok(serde_json::json!({"terminal_id":terminal_id,"cols":cols,"rows":rows}))
    }

    async fn close(
        &mut self,
        pool: &SqlitePool,
        bootstrap: &Bootstrap,
        job_id: &str,
        workspace_id: Uuid,
        session_id: Uuid,
        terminal_id: Uuid,
    ) -> Result<serde_json::Value, &'static str> {
        read_resource(pool, bootstrap, job_id, workspace_id, session_id).await?;
        let terminal = self
            .terminals
            .get(&terminal_id)
            .ok_or("owner_terminal_not_found")?;
        Self::bound(terminal, job_id, workspace_id, session_id)?;
        self.service
            .close_session(terminal_id)
            .await
            .map_err(|_| "owner_terminal_close_failed")?;
        self.terminals.remove(&terminal_id);
        Ok(serde_json::json!({"terminal_id":terminal_id,"active":false}))
    }

    async fn shutdown(&mut self) {
        let terminal_ids: Vec<_> = self.terminals.keys().copied().collect();
        for terminal_id in terminal_ids {
            let _ = self.service.close_session(terminal_id).await;
        }
        self.terminals.clear();
    }
}

async fn bound_execution(
    pool: &SqlitePool,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
    execution_id: Uuid,
) -> Result<(ExecutionProcess, Option<String>), &'static str> {
    let process = ExecutionProcess::find_by_id(pool, execution_id)
        .await
        .map_err(|_| "owner_database_unavailable")?
        .ok_or("owner_execution_not_found")?;
    if process.session_id != session_id
        || process.run_reason != ExecutionProcessRunReason::CodingAgent
        || process.dropped
    {
        return Err("owner_execution_binding_invalid");
    }
    let link = sqlx::query("SELECT job_id,workspace_id,session_id,business_attempt_id,intent FROM fusion_execution_links_v1 WHERE execution_id=?")
        .bind(execution_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| "owner_database_unavailable")?
        .ok_or("owner_execution_binding_invalid")?;
    let linked_job: String = link
        .try_get("job_id")
        .map_err(|_| "owner_execution_binding_invalid")?;
    let linked_workspace: Uuid = link
        .try_get("workspace_id")
        .map_err(|_| "owner_execution_binding_invalid")?;
    let linked_session: Uuid = link
        .try_get("session_id")
        .map_err(|_| "owner_execution_binding_invalid")?;
    let business_attempt_id: Option<String> = link
        .try_get("business_attempt_id")
        .map_err(|_| "owner_execution_binding_invalid")?;
    let intent: String = link
        .try_get("intent")
        .map_err(|_| "owner_execution_binding_invalid")?;
    if linked_job != job_id
        || linked_workspace != workspace_id
        || linked_session != session_id
        || intent != "technical_user"
        || business_attempt_id
            .as_deref()
            .is_some_and(|value| !bounded_trace_id(value))
    {
        return Err("owner_execution_binding_invalid");
    }
    Ok((process, business_attempt_id))
}

fn execution_value(
    process: &ExecutionProcess,
    job_id: &str,
    workspace_id: Uuid,
    business_attempt_id: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "job_id":job_id,
        "workspace_id":workspace_id,
        "session_id":process.session_id,
        "business_attempt_id":business_attempt_id,
        "execution_id":process.id,
        "state":process.status,
        "exit_code":process.exit_code,
        "started_at":process.started_at.to_rfc3339(),
        "completed_at":process.completed_at.map(|value| value.to_rfc3339()),
        "profile":"CODEX:CHAOTANG_SUPERVISED"
    })
}

/// Called only by the isolated --fusion-owner-runtime binary mode before Tauri
/// startup. Parent closes stdin on logout/shutdown; EOF ends the child. Frames
/// carry no backend bearer token or broker secret. Errors are stable and redacted.
pub fn run_stdio() -> Result<(), &'static str> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut reader = stdin.lock();
    let mut writer = stdout.lock();
    let directory = std::env::var_os("CDESKTOP_DATA_DIR").ok_or("owner_directory_missing")?;
    run_protocol(&mut reader, &mut writer, Path::new(&directory))
}

fn run_protocol(
    mut reader: &mut impl BufRead,
    mut writer: &mut impl Write,
    directory: &Path,
) -> Result<(), &'static str> {
    let raw = read_frame(&mut reader)?.ok_or("owner_bootstrap_missing")?;
    let bootstrap: Bootstrap = serde_json::from_str(&raw).map_err(|_| "owner_bootstrap_invalid")?;
    bootstrap.validate()?;
    claim_directory(directory, &bootstrap)?;
    let runtime = tokio::runtime::Runtime::new().map_err(|_| "owner_runtime_unavailable")?;
    let pool = runtime.block_on(open_database(directory, &bootstrap))?;
    runtime.block_on(initialize(&pool, &bootstrap))?;
    write_frame(
        &mut writer,
        &serde_json::json!({"protocol":1,"generation":bootstrap.generation,"ready":true}),
    )?;
    let mut files = task_files::State::default();
    let mut execution = OwnerExecutionState::new();
    let mut terminals = OwnerTerminalState::new();
    while let Some(raw) = read_frame(&mut reader)? {
        let request: Request = serde_json::from_str(&raw).map_err(|_| "owner_frame_invalid")?;
        if request.generation != bootstrap.generation {
            return Err("owner_generation_mismatch");
        }
        let result = match request.command {
            Command::Provision { job_id, title } => runtime
                .block_on(provision(&pool, &bootstrap, &job_id, &title))
                .and_then(|v| serde_json::to_value(v).map_err(|_| "owner_resource_invalid")),
            Command::Read {
                job_id,
                workspace_id,
                session_id,
            } => runtime.block_on(read_resource(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
            )),
            Command::ReadSessionHistory {
                job_id,
                workspace_id,
                session_id,
            } => runtime.block_on(read_session_history(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
            )),
            Command::ReadDiff {
                job_id,
                workspace_id,
                session_id,
            } => runtime.block_on(read_task_diff(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
            )),
            Command::StartExecution {
                job_id,
                workspace_id,
                session_id,
                business_attempt_id,
                prompt,
                intent,
            } => runtime.block_on(execution.start(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                business_attempt_id,
                prompt,
                intent,
            )),
            Command::ReadExecution {
                job_id,
                workspace_id,
                session_id,
                execution_id,
            } => runtime.block_on(execution.read(
                &pool,
                &bootstrap,
                directory,
                &job_id,
                workspace_id,
                session_id,
                execution_id,
            )),
            Command::CancelExecution {
                job_id,
                workspace_id,
                session_id,
                execution_id,
            } => runtime.block_on(execution.cancel(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                execution_id,
            )),
            Command::ReadApprovals {
                job_id,
                workspace_id,
                session_id,
                execution_id,
            } => runtime.block_on(execution.approvals(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                execution_id,
            )),
            Command::RespondApproval {
                job_id,
                workspace_id,
                session_id,
                execution_id,
                approval_id,
                response,
            } => runtime.block_on(execution.respond_approval(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                execution_id,
                approval_id,
                response,
            )),
            Command::StartTerminal {
                job_id,
                workspace_id,
                session_id,
                cols,
                rows,
            } => runtime.block_on(terminals.start(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                cols,
                rows,
            )),
            Command::ReadTerminal {
                job_id,
                workspace_id,
                session_id,
                terminal_id,
                after_sequence,
            } => runtime.block_on(terminals.read(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                terminal_id,
                after_sequence,
            )),
            Command::WriteTerminal {
                job_id,
                workspace_id,
                session_id,
                terminal_id,
                data_base64,
            } => runtime.block_on(terminals.write(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                terminal_id,
                &data_base64,
            )),
            Command::ResizeTerminal {
                job_id,
                workspace_id,
                session_id,
                terminal_id,
                cols,
                rows,
            } => runtime.block_on(terminals.resize(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                terminal_id,
                cols,
                rows,
            )),
            Command::CloseTerminal {
                job_id,
                workspace_id,
                session_id,
                terminal_id,
            } => runtime.block_on(terminals.close(
                &pool,
                &bootstrap,
                &job_id,
                workspace_id,
                session_id,
                terminal_id,
            )),
            Command::Stop => break,
            command => runtime.block_on(files.execute(&pool, &bootstrap, command)),
        };
        let response = match result {
            Ok(value) => {
                serde_json::json!({"request_id":request.request_id,"generation":bootstrap.generation,"result":value})
            }
            Err(code) => {
                serde_json::json!({"request_id":request.request_id,"generation":bootstrap.generation,"error":code})
            }
        };
        write_frame(&mut writer, &response)?;
    }
    runtime.block_on(terminals.shutdown());
    runtime.block_on(execution.shutdown());
    runtime.block_on(pool.close());
    Ok(())
}

async fn open_database(
    directory: &Path,
    bootstrap: &Bootstrap,
) -> Result<SqlitePool, &'static str> {
    validate_database_files(directory)?;
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(directory.join("db.v2.sqlite"))
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(std::time::Duration::from_secs(5));
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|_| "owner_database_unavailable")?;
    // Check database identity before migrations can touch a restored database.
    // Persist the identity first on a completely empty DB, so interrupted initial
    // migrations can be retried without treating existing foreign tables as ours.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|_| "owner_database_unavailable")?;
    let tables = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| "owner_database_unavailable")?;
    if tables == 0 {
        sqlx::query("CREATE TABLE fusion_owner_identity_v1 (id INTEGER PRIMARY KEY CHECK(id=1), owner_key TEXT NOT NULL, installation_id TEXT NOT NULL)").execute(&mut *tx).await.map_err(|_| "owner_database_unavailable")?;
        sqlx::query(
            "INSERT INTO fusion_owner_identity_v1(id,owner_key,installation_id) VALUES(1,?,?)",
        )
        .bind(&bootstrap.owner_key)
        .bind(&bootstrap.installation_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| "owner_database_unavailable")?;
    } else {
        let row = sqlx::query(
            "SELECT owner_key,installation_id FROM fusion_owner_identity_v1 WHERE id=1",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| "owner_database_unclaimed")?
        .ok_or("owner_database_unclaimed")?;
        if row.get::<String, _>("owner_key") != bootstrap.owner_key
            || row.get::<String, _>("installation_id") != bootstrap.installation_id
        {
            return Err("owner_database_identity_mismatch");
        }
    }
    tx.commit()
        .await
        .map_err(|_| "owner_database_unavailable")?;
    // Strict migrator: unlike the legacy Windows release DBService entry point,
    // checksum mismatches are never silently rewritten or accepted.
    sqlx::migrate!("../db/migrations")
        .run(&pool)
        .await
        .map_err(|_| "owner_migration_incompatible")?;
    Ok(pool)
}

fn validate_database_files(directory: &Path) -> Result<(), &'static str> {
    for name in [
        "db.v2.sqlite",
        "db.v2.sqlite-wal",
        "db.v2.sqlite-shm",
        "db.v2.sqlite-journal",
    ] {
        let path = directory.join(name);
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err("owner_database_unavailable"),
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err("owner_database_alias");
        }
        #[cfg(windows)]
        {
            use std::os::windows::{fs::MetadataExt, io::AsRawHandle};

            use windows_sys::Win32::Storage::FileSystem::{
                BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
            };
            if metadata.file_attributes() & 0x400 != 0 {
                return Err("owner_database_alias");
            }
            let file = std::fs::File::open(&path).map_err(|_| "owner_database_unavailable")?;
            let mut info = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
            // Valid owned File handle; Win32 initializes output only on success.
            if unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) } == 0 {
                return Err("owner_database_unavailable");
            }
            let info = unsafe { info.assume_init() };
            if info.nNumberOfLinks != 1 || info.dwFileAttributes & 0x400 != 0 {
                return Err("owner_database_alias");
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.nlink() != 1 {
                return Err("owner_database_alias");
            }
        }
    }
    // Same-OS-user adversarial rename races require an OS security boundary.
    // This rejects static aliases, not a shell sandbox promise.
    Ok(())
}

mod task_files {
    use std::{
        fs::{File, OpenOptions},
        io::{Read, Seek, SeekFrom},
        path::PathBuf,
    };

    use base64::{Engine, engine::general_purpose::STANDARD};
    use serde_json::{Value, json};

    use super::*;

    pub const MAX_BYTES: u64 = 32 * 1024 * 1024;
    pub const CHUNK: usize = 20 * 1024;
    const PREVIEW: usize = 64 * 1024;
    const PENDING: &str = ".fusion-import-";

    fn io_error(error: std::io::Error) -> &'static str {
        match error.kind() {
            std::io::ErrorKind::NotFound => "owner_file_not_found",
            std::io::ErrorKind::PermissionDenied => "owner_file_permission_denied",
            std::io::ErrorKind::AlreadyExists => "owner_file_conflict",
            _ => "owner_file_io_failed",
        }
    }

    pub(super) fn relative(value: &str, allow_empty: bool) -> Result<Vec<&str>, &'static str> {
        if value.is_empty() && allow_empty {
            return Ok(vec![]);
        }
        if value.is_empty() || value.len() > 1024 {
            return Err("owner_file_path_invalid");
        }
        let parts: Vec<_> = value.split('/').collect();
        for part in &parts {
            let stem = part.split('.').next().unwrap_or("").to_uppercase();
            let reserved = matches!(
                stem.as_str(),
                "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$" | "CONIN$" | "CONOUT$"
            ) || ["COM", "LPT"].iter().any(|prefix| {
                stem.strip_prefix(prefix).is_some_and(|s| {
                    matches!(
                        s,
                        "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                    )
                })
            });
            if part.is_empty()
                || *part == "."
                || *part == ".."
                || part.len() > 255
                || part.ends_with(['.', ' '])
                || part.starts_with(PENDING)
                || reserved
                || part.chars().any(|c| {
                    c.is_control() || matches!(c, '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*')
                })
            {
                return Err("owner_file_path_invalid");
            }
        }
        Ok(parts)
    }

    fn checked(file: &File, directory: bool) -> Result<(), &'static str> {
        let meta = file.metadata().map_err(io_error)?;
        if (directory && !meta.is_dir()) || (!directory && !meta.is_file()) {
            return Err("owner_file_type_invalid");
        }
        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;

            use windows_sys::Win32::Storage::FileSystem::{
                BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
            };
            let mut info = std::mem::MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::uninit();
            if unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) } == 0 {
                return Err("owner_file_io_failed");
            }
            let info = unsafe { info.assume_init() };
            if info.dwFileAttributes & 0x400 != 0 || (!directory && info.nNumberOfLinks != 1) {
                return Err("owner_file_alias");
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if !directory && meta.nlink() != 1 {
                return Err("owner_file_alias");
            }
        }
        Ok(())
    }

    fn open(path: &Path, directory: bool) -> Result<File, &'static str> {
        let meta = std::fs::symlink_metadata(path).map_err(io_error)?;
        if meta.file_type().is_symlink() {
            return Err("owner_file_alias");
        }
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;

            use windows_sys::Win32::Storage::FileSystem::{
                FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_ATTRIBUTES,
                FILE_SHARE_READ, FILE_SHARE_WRITE,
            };
            options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
            // Retain directory identity by denying delete/rename until operation ends.
            // Deny file writers as well while snapshotting bytes.
            options.share_mode(if directory {
                FILE_SHARE_READ | FILE_SHARE_WRITE
            } else {
                FILE_SHARE_READ
            });
            if directory {
                options.access_mode(FILE_READ_ATTRIBUTES);
            }
        }
        let file = options.open(path).map_err(io_error)?;
        checked(&file, directory)?;
        Ok(file)
    }

    pub(super) struct LockedPath {
        pub path: PathBuf,
        _guards: Vec<File>,
    }

    fn lock_directories(path: &Path) -> Result<Vec<File>, &'static str> {
        if !path.is_absolute()
            || path.components().any(|p| {
                matches!(
                    p,
                    std::path::Component::ParentDir | std::path::Component::CurDir
                )
            })
        {
            return Err("owner_file_path_invalid");
        }
        let mut ancestors: Vec<_> = path.ancestors().collect();
        ancestors.reverse();
        ancestors.into_iter().map(|p| open(p, true)).collect()
    }

    pub(super) fn root_path(boot: &Bootstrap, workspace: Uuid) -> PathBuf {
        boot.runtime_root
            .join(&boot.owner_key)
            .join("task-files")
            .join(workspace.to_string())
    }

    pub(super) fn ensure_root(boot: &Bootstrap, workspace: Uuid) -> Result<(), &'static str> {
        let owner = boot.runtime_root.join(&boot.owner_key);
        let mut guards = lock_directories(&owner)?;
        let mut parent = owner;
        for component in ["task-files".to_owned(), workspace.to_string()] {
            parent.push(component);
            match std::fs::create_dir(&parent) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(io_error(error)),
            }
            guards.push(open(&parent, true)?);
        }
        Ok(())
    }

    pub(super) fn root_available(boot: &Bootstrap, workspace: Uuid) -> Result<bool, &'static str> {
        match lock_directories(&root_path(boot, workspace)) {
            Ok(_) => Ok(true),
            Err("owner_file_not_found") => Ok(false),
            Err(error) => Err(error),
        }
    }

    pub(super) fn locked_root(
        boot: &Bootstrap,
        workspace: Uuid,
    ) -> Result<LockedPath, &'static str> {
        resolve(boot, workspace, "", true)
    }

    pub(super) fn valid_diff_path(path: &str) -> bool {
        relative(path, false).is_ok()
    }

    fn resolve(
        boot: &Bootstrap,
        workspace: Uuid,
        path: &str,
        directory: bool,
    ) -> Result<LockedPath, &'static str> {
        let parts = relative(path, directory)?;
        let mut full = root_path(boot, workspace);
        let mut guards = lock_directories(&full).map_err(|e| {
            if e == "owner_file_not_found" {
                "owner_files_unavailable"
            } else {
                e
            }
        })?;
        let parents = if directory {
            parts.len()
        } else {
            parts.len() - 1
        };
        for part in parts.iter().take(parents) {
            full.push(part);
            guards.push(open(&full, true)?);
        }
        if !directory {
            full.push(parts.last().unwrap());
        }
        Ok(LockedPath {
            path: full,
            _guards: guards,
        })
    }

    fn entry(path: &str, file: &File) -> Result<Value, &'static str> {
        let meta = file.metadata().map_err(io_error)?;
        let modified = meta
            .modified()
            .ok()
            .map(|v| chrono::DateTime::<chrono::Utc>::from(v).to_rfc3339());
        Ok(
            json!({"relative_path":path,"name":path.rsplit('/').next().unwrap_or(""),"kind":if meta.is_dir(){"directory"}else{"file"},"bytes":if meta.is_file(){Some(meta.len())}else{None},"modified_at":modified}),
        )
    }

    async fn authorize(
        pool: &SqlitePool,
        boot: &Bootstrap,
        job: &str,
        workspace: Uuid,
        session: Uuid,
    ) -> Result<(), &'static str> {
        read_resource(pool, boot, job, workspace, session)
            .await
            .map(|_| ())
    }

    struct Preview {
        id: Uuid,
        data: Vec<u8>,
        sequence: u32,
        offset: usize,
    }
    struct Import {
        id: Uuid,
        job: String,
        workspace: Uuid,
        artifact: String,
        relative: String,
        bytes: u64,
        sha256: String,
        version: u64,
        received: u64,
        sequence: u32,
        target: LockedPath,
        pending: PathBuf,
        file: Option<File>,
    }
    impl Drop for Import {
        fn drop(&mut self) {
            drop(self.file.take());
            let _ = std::fs::remove_file(&self.pending);
        }
    }
    #[derive(Default)]
    pub(super) struct State {
        preview: Option<Preview>,
        import: Option<Import>,
    }

    impl State {
        pub(super) async fn execute(
            &mut self,
            pool: &SqlitePool,
            boot: &Bootstrap,
            command: Command,
        ) -> Result<Value, &'static str> {
            match command {
                Command::ListFiles {
                    job_id,
                    workspace_id,
                    session_id,
                    relative_path,
                } => {
                    authorize(pool, boot, &job_id, workspace_id, session_id).await?;
                    self.list(boot, &job_id, workspace_id, &relative_path)
                }
                Command::ReadFile {
                    job_id,
                    workspace_id,
                    session_id,
                    relative_path,
                } => {
                    self.preview = None;
                    authorize(pool, boot, &job_id, workspace_id, session_id).await?;
                    self.read(boot, &job_id, workspace_id, &relative_path)
                }
                Command::ReadPreview {
                    preview_id,
                    sequence,
                } => self.preview_chunk(preview_id, sequence),
                Command::BeginImport {
                    job_id,
                    workspace_id,
                    session_id,
                    artifact_id,
                    relative_path,
                    bytes,
                    sha256,
                    version,
                } => {
                    authorize(pool, boot, &job_id, workspace_id, session_id).await?;
                    self.begin(
                        boot,
                        job_id,
                        workspace_id,
                        artifact_id,
                        relative_path,
                        bytes,
                        sha256,
                        version,
                    )
                }
                Command::UploadChunk {
                    import_id,
                    sequence,
                    data_base64,
                } => self.upload(import_id, sequence, &data_base64),
                Command::FinishImport { import_id } => self.finish(import_id),
                Command::AbortImport { import_id } => {
                    let pending = self.import.take().ok_or("owner_import_not_found")?;
                    if pending.id != import_id {
                        return Err("owner_import_not_found");
                    }
                    drop(pending);
                    Ok(json!({"import_id":import_id,"aborted":true}))
                }
                _ => Err("owner_frame_invalid"),
            }
        }

        fn list(
            &self,
            boot: &Bootstrap,
            job: &str,
            workspace: Uuid,
            path: &str,
        ) -> Result<Value, &'static str> {
            let locked = resolve(boot, workspace, path, true)?;
            let mut result = json!({"job_id":job,"workspace_id":workspace,"relative_path":path,"entries":[],"truncated":false});
            for item in std::fs::read_dir(&locked.path).map_err(io_error)? {
                let item = item.map_err(io_error)?;
                let name = item
                    .file_name()
                    .into_string()
                    .map_err(|_| "owner_file_path_invalid")?;
                if name.starts_with(PENDING) {
                    continue;
                }
                relative(&name, false)?;
                let metadata = std::fs::symlink_metadata(item.path()).map_err(io_error)?;
                let file = open(&item.path(), metadata.is_dir())?;
                let child_path = if path.is_empty() {
                    name
                } else {
                    format!("{path}/{name}")
                };
                let child = entry(&child_path, &file)?;
                if result["entries"].as_array().unwrap().len() == 500 {
                    result["truncated"] = json!(true);
                    break;
                }
                result["entries"].as_array_mut().unwrap().push(child);
                // Reserve the actual protocol request/generation envelope (IDs <=128).
                if serde_json::to_vec(&result)
                    .map_err(|_| "owner_frame_invalid")?
                    .len()
                    + 256
                    >= MAX_FRAME as usize
                {
                    result["entries"].as_array_mut().unwrap().pop();
                    result["truncated"] = json!(true);
                    break;
                }
            }
            Ok(result)
        }

        fn read(
            &mut self,
            boot: &Bootstrap,
            job: &str,
            workspace: Uuid,
            path: &str,
        ) -> Result<Value, &'static str> {
            let locked = resolve(boot, workspace, path, false)?;
            let mut file = open(&locked.path, false)?;
            let mut result = json!({"job_id":job,"workspace_id":workspace,"entry":entry(path,&file)?,"sha256":null});
            if file.metadata().map_err(io_error)?.len() > MAX_BYTES {
                result["kind"] = json!("not_previewable");
                result["reason"] = json!("too_large");
                return Ok(result);
            }
            let mut bytes = Vec::new();
            (&mut file)
                .take(MAX_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(io_error)?;
            if bytes.len() as u64 > MAX_BYTES {
                return Err("owner_file_changed");
            }
            checked(&file, false)?;
            if bytes.len() as u64 != file.metadata().map_err(io_error)?.len() {
                return Err("owner_file_changed");
            }
            result["sha256"] = json!(format!("{:x}", Sha256::digest(&bytes)));
            let reason = if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
                Some("unsupported_encoding")
            } else if bytes.contains(&0) {
                Some("binary")
            } else if std::str::from_utf8(&bytes).is_err() {
                Some("unsupported_encoding")
            } else {
                None
            };
            if let Some(reason) = reason {
                result["kind"] = json!("not_previewable");
                result["reason"] = json!(reason);
                return Ok(result);
            }
            let text = std::str::from_utf8(&bytes).map_err(|_| "owner_file_changed")?;
            let mut end = bytes.len().min(PREVIEW);
            while !text.is_char_boundary(end) {
                end -= 1;
            }
            let id = Uuid::new_v4();
            result["kind"] = json!("text");
            result["encoding"] = json!("utf-8");
            result["preview_id"] = json!(id);
            result["preview_bytes"] = json!(end);
            result["truncated"] = json!(end < bytes.len());
            bytes.truncate(end);
            self.preview = Some(Preview {
                id,
                data: bytes,
                sequence: 0,
                offset: 0,
            });
            Ok(result)
        }

        fn preview_chunk(&mut self, id: Uuid, sequence: u32) -> Result<Value, &'static str> {
            let preview = self.preview.as_mut().ok_or("owner_preview_not_found")?;
            if preview.id != id || preview.sequence != sequence {
                self.preview = None;
                return Err("owner_preview_sequence_invalid");
            }
            let end = (preview.offset + CHUNK).min(preview.data.len());
            let result = json!({"preview_id":id,"sequence":sequence,"data_base64":STANDARD.encode(&preview.data[preview.offset..end]),"done":end==preview.data.len()});
            preview.offset = end;
            preview.sequence += 1;
            if end == preview.data.len() {
                self.preview = None;
            }
            Ok(result)
        }

        #[allow(clippy::too_many_arguments)]
        fn begin(
            &mut self,
            boot: &Bootstrap,
            job: String,
            workspace: Uuid,
            artifact: String,
            relative: String,
            bytes: u64,
            sha256: String,
            version: u64,
        ) -> Result<Value, &'static str> {
            if self.import.is_some() {
                return Err("owner_import_busy");
            }
            if bytes > MAX_BYTES
                || version == 0
                || artifact.is_empty()
                || artifact.len() > 512
                || artifact.chars().any(char::is_control)
                || sha256.len() != 64
                || !sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            {
                return Err("owner_import_metadata_invalid");
            }
            let target = resolve(boot, workspace, &relative, false)?;
            match open(&target.path, false) {
                Ok(_) | Err("owner_file_not_found") => {}
                Err(e) => return Err(e),
            }
            let id = Uuid::new_v4();
            let pending = target
                .path
                .parent()
                .ok_or("owner_file_path_invalid")?
                .join(format!("{PENDING}{id}.pending"));
            let mut options = OpenOptions::new();
            options.read(true).write(true).create_new(true);
            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                options.share_mode(windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ);
            }
            let file = options.open(&pending).map_err(io_error)?;
            checked(&file, false)?;
            self.import = Some(Import {
                id,
                job,
                workspace,
                artifact,
                relative,
                bytes,
                sha256,
                version,
                received: 0,
                sequence: 0,
                target,
                pending,
                file: Some(file),
            });
            Ok(json!({"import_id":id,"chunk_bytes":CHUNK}))
        }

        fn upload(
            &mut self,
            id: Uuid,
            sequence: u32,
            encoded: &str,
        ) -> Result<Value, &'static str> {
            let mut pending = self.import.take().ok_or("owner_import_not_found")?;
            if id != pending.id || sequence != pending.sequence {
                return Err("owner_import_sequence_invalid");
            }
            if encoded.len() > CHUNK.div_ceil(3) * 4 {
                return Err("owner_import_chunk_invalid");
            }
            let bytes = STANDARD
                .decode(encoded)
                .map_err(|_| "owner_import_chunk_invalid")?;
            if bytes.is_empty()
                || bytes.len() > CHUNK
                || pending.received + bytes.len() as u64 > pending.bytes
            {
                return Err("owner_import_size_mismatch");
            }
            pending
                .file
                .as_mut()
                .ok_or("owner_import_not_found")?
                .write_all(&bytes)
                .map_err(io_error)?;
            pending.received += bytes.len() as u64;
            pending.sequence += 1;
            let result = json!({"import_id":id,"next_sequence":pending.sequence,"received_bytes":pending.received});
            self.import = Some(pending);
            Ok(result)
        }

        fn finish(&mut self, id: Uuid) -> Result<Value, &'static str> {
            let mut pending = self.import.take().ok_or("owner_import_not_found")?;
            if pending.id != id {
                return Err("owner_import_not_found");
            }
            if pending.received != pending.bytes {
                return Err("owner_import_size_mismatch");
            }
            let file = pending.file.as_mut().ok_or("owner_import_not_found")?;
            file.flush().map_err(io_error)?;
            file.sync_all().map_err(io_error)?;
            file.seek(SeekFrom::Start(0)).map_err(io_error)?;
            checked(file, false)?;
            let (actual_bytes, actual_hash) = hash_file(file)?;
            if actual_bytes != pending.bytes || actual_hash != pending.sha256 {
                return Err("owner_import_integrity_mismatch");
            }
            let status = match std::fs::hard_link(&pending.pending, &pending.target.path) {
                Ok(()) => "imported",
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    let mut existing = open(&pending.target.path, false)?;
                    let (size, hash) = hash_file(&mut existing)?;
                    if size != pending.bytes || hash != pending.sha256 {
                        return Err("owner_file_conflict");
                    }
                    "already_present"
                }
                Err(error) => return Err(io_error(error)),
            };
            // Publication creates a temporary second name; close and unlink staging
            // before verifying the visible final file has exactly one link.
            drop(pending.file.take());
            std::fs::remove_file(&pending.pending).map_err(io_error)?;
            let mut final_file = open(&pending.target.path, false)?;
            let (size, hash) = hash_file(&mut final_file)?;
            if size != pending.bytes || hash != pending.sha256 {
                return Err("owner_import_integrity_mismatch");
            }
            Ok(
                json!({"status":status,"job_id":pending.job,"workspace_id":pending.workspace,"entry":entry(&pending.relative,&final_file)?,"sha256":hash,"source":{"artifact_id":pending.artifact,"sha256":pending.sha256,"version":pending.version}}),
            )
        }
    }

    fn hash_file(file: &mut File) -> Result<(u64, String), &'static str> {
        if file.metadata().map_err(io_error)?.len() > MAX_BYTES {
            return Err("owner_file_too_large");
        }
        let mut total = 0u64;
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = file.read(&mut buffer).map_err(io_error)?;
            if count == 0 {
                break;
            }
            total += count as u64;
            if total > MAX_BYTES {
                return Err("owner_file_too_large");
            }
            hash.update(&buffer[..count]);
        }
        Ok((total, format!("{:x}", hash.finalize())))
    }
}

mod task_diff {
    use std::{collections::HashSet, path::Path};

    use git2::{Delta, DiffFindOptions, DiffFlags, DiffFormat, DiffOptions, Repository};
    use serde_json::{Value, json};
    use uuid::Uuid;

    use super::{Bootstrap, MAX_FRAME, task_files};

    const MAX_ENTRIES: usize = 40;
    const MAX_PATCH_BYTES: usize = 10 * 1024;

    fn metadata_is_alias(path: &Path) -> Result<bool, &'static str> {
        let metadata = std::fs::symlink_metadata(path).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "owner_diff_not_repository"
            } else {
                "owner_diff_unavailable"
            }
        })?;
        if metadata.file_type().is_symlink() {
            return Ok(true);
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn state(
        job: &str,
        workspace: Uuid,
        session: Uuid,
        name: &str,
        repository: bool,
        head: Option<String>,
        branch: Option<String>,
        entries: Vec<Value>,
        patch: String,
        truncated: bool,
    ) -> Result<Value, &'static str> {
        let value = json!({
            "job_id":job,
            "workspace_id":workspace,
            "session_id":session,
            "state":name,
            "repository":repository,
            "head":head,
            "branch":branch,
            "entries":entries,
            "patch":patch,
            "truncated":truncated
        });
        if serde_json::to_vec(&value)
            .map_err(|_| "owner_diff_invalid")?
            .len()
            > MAX_FRAME as usize - 1024
        {
            return Err("owner_diff_too_large");
        }
        Ok(value)
    }

    fn change(delta: Delta) -> Option<&'static str> {
        match delta {
            Delta::Added | Delta::Untracked => Some("added"),
            Delta::Deleted => Some("deleted"),
            Delta::Modified => Some("modified"),
            Delta::Renamed => Some("renamed"),
            Delta::Copied => Some("copied"),
            Delta::Typechange => Some("type_changed"),
            Delta::Conflicted => Some("conflicted"),
            Delta::Unreadable => Some("unreadable"),
            Delta::Unmodified | Delta::Ignored => None,
        }
    }

    fn path(value: Option<&Path>) -> Result<Option<String>, &'static str> {
        let Some(value) = value else { return Ok(None) };
        let text = value.to_str().ok_or("owner_diff_path_invalid")?;
        let normalized = text.replace('\\', "/");
        if normalized.len() > 256 || !task_files::valid_diff_path(&normalized) {
            return Err("owner_diff_path_invalid");
        }
        Ok(Some(normalized))
    }

    pub(super) fn read(
        boot: &Bootstrap,
        job: &str,
        workspace: Uuid,
        session: Uuid,
    ) -> Result<Value, &'static str> {
        let root = task_files::locked_root(boot, workspace)?;
        let dot_git = root.path.join(".git");
        match metadata_is_alias(&dot_git) {
            Err("owner_diff_not_repository") => {
                return state(
                    job,
                    workspace,
                    session,
                    "not_git_repository",
                    false,
                    None,
                    None,
                    vec![],
                    String::new(),
                    false,
                );
            }
            Ok(false) if dot_git.is_dir() => {}
            Ok(_) => return Err("owner_diff_alias"),
            Err(error) => return Err(error),
        }
        let repo = Repository::open(&root.path).map_err(|_| "owner_diff_invalid")?;
        let canonical_root =
            std::fs::canonicalize(&root.path).map_err(|_| "owner_diff_unavailable")?;
        let canonical_workdir = repo
            .workdir()
            .and_then(|value| std::fs::canonicalize(value).ok());
        let canonical_git =
            std::fs::canonicalize(repo.path()).map_err(|_| "owner_diff_unavailable")?;
        if repo.is_bare()
            || canonical_workdir.as_ref() != Some(&canonical_root)
            || !canonical_git.starts_with(&canonical_root)
        {
            return Err("owner_diff_scope_invalid");
        }
        let branch = repo
            .head()
            .ok()
            .and_then(|value| value.shorthand().map(str::to_owned));
        let Some(head_id) = repo.head().ok().and_then(|value| value.target()) else {
            return state(
                job,
                workspace,
                session,
                "no_baseline",
                true,
                None,
                branch,
                vec![],
                String::new(),
                false,
            );
        };
        let tree = repo
            .find_commit(head_id)
            .and_then(|commit| commit.tree())
            .map_err(|_| "owner_diff_invalid")?;
        let mut options = DiffOptions::new();
        options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true)
            .include_typechange(true);
        let mut diff = repo
            .diff_tree_to_workdir_with_index(Some(&tree), Some(&mut options))
            .map_err(|_| "owner_diff_unavailable")?;
        let mut find = DiffFindOptions::new();
        find.renames(true).copies(true);
        diff.find_similar(Some(&mut find))
            .map_err(|_| "owner_diff_unavailable")?;

        let mut entries = Vec::new();
        let mut seen = HashSet::new();
        let mut truncated = false;
        for delta in diff.deltas() {
            let Some(change) = change(delta.status()) else {
                continue;
            };
            let new_path = path(delta.new_file().path())?;
            let old_path = path(delta.old_file().path())?;
            let current = new_path
                .clone()
                .or_else(|| old_path.clone())
                .ok_or("owner_diff_path_invalid")?;
            if !seen.insert(current.clone()) {
                return Err("owner_diff_invalid");
            }
            if entries.len() == MAX_ENTRIES {
                truncated = true;
                continue;
            }
            entries.push(json!({
                "path":current,
                "old_path":if old_path != new_path { old_path } else { None },
                "change":change,
                "binary":delta.flags().contains(DiffFlags::BINARY)
            }));
        }
        let mut patch_bytes = Vec::new();
        diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            if patch_bytes.len() >= MAX_PATCH_BYTES {
                truncated = true;
                return true;
            }
            let content = line.content();
            let remaining = MAX_PATCH_BYTES - patch_bytes.len();
            let origin = line.origin();
            let prefix = matches!(origin, '+' | '-' | ' ').then_some(origin as u8);
            if prefix.is_some() && remaining == 0 {
                truncated = true;
                return true;
            }
            if let Some(prefix) = prefix {
                patch_bytes.push(prefix);
            }
            let remaining = MAX_PATCH_BYTES - patch_bytes.len();
            if content.len() > remaining {
                patch_bytes.extend_from_slice(&content[..remaining]);
                truncated = true;
            } else {
                patch_bytes.extend_from_slice(content);
            }
            true
        })
        .map_err(|_| "owner_diff_unavailable")?;
        let patch = String::from_utf8_lossy(&patch_bytes).into_owned();
        state(
            job,
            workspace,
            session,
            if entries.is_empty() {
                "clean"
            } else {
                "changed"
            },
            true,
            Some(head_id.to_string()),
            branch,
            entries,
            patch,
            truncated,
        )
    }
}

#[cfg(test)]
mod tests {
    use base64::{Engine, engine::general_purpose::STANDARD};
    use serde_json::{Value, json};

    use super::*;

    struct Fixture {
        _temp: tempfile::TempDir,
        boot: Bootstrap,
        pool: SqlitePool,
        receipt: ResourceReceipt,
        root: std::path::PathBuf,
    }
    impl Fixture {
        async fn new() -> Self {
            let temp = tempfile::tempdir().unwrap();
            let mut boot = bootstrap();
            boot.runtime_root = temp.path().join("owner-runtimes");
            let directory = boot.runtime_root.join(&boot.owner_key);
            claim_directory(&directory, &boot).unwrap();
            let pool = open_database(&directory, &boot).await.unwrap();
            initialize(&pool, &boot).await.unwrap();
            let receipt = provision(&pool, &boot, "file-job", "Files").await.unwrap();
            let root = directory
                .join("task-files")
                .join(receipt.workspace_id.to_string());
            Self {
                _temp: temp,
                boot,
                pool,
                receipt,
                root,
            }
        }
        fn command(&self, op: &str, path: &str) -> Command {
            serde_json::from_value(json!({"op":op,"job_id":self.receipt.job_id,"workspace_id":self.receipt.workspace_id,"session_id":self.receipt.session_id,"relative_path":path})).unwrap()
        }
        fn begin(&self, path: &str, bytes: &[u8]) -> Command {
            Command::BeginImport {
                job_id: self.receipt.job_id.clone(),
                workspace_id: self.receipt.workspace_id,
                session_id: self.receipt.session_id,
                artifact_id: "published-artifact".into(),
                relative_path: path.into(),
                bytes: bytes.len() as u64,
                sha256: format!("{:x}", Sha256::digest(bytes)),
                version: 1,
            }
        }
        async fn run(
            &self,
            state: &mut task_files::State,
            command: Command,
        ) -> Result<Value, &'static str> {
            state.execute(&self.pool, &self.boot, command).await
        }
        async fn import(
            &self,
            state: &mut task_files::State,
            path: &str,
            bytes: &[u8],
        ) -> Result<Value, &'static str> {
            let begin = self.run(state, self.begin(path, bytes)).await?;
            let id = serde_json::from_value(begin["import_id"].clone()).unwrap();
            for (sequence, chunk) in bytes.chunks(task_files::CHUNK).enumerate() {
                self.run(
                    state,
                    Command::UploadChunk {
                        import_id: id,
                        sequence: sequence as u32,
                        data_base64: STANDARD.encode(chunk),
                    },
                )
                .await?;
            }
            self.run(state, Command::FinishImport { import_id: id })
                .await
        }
        fn pending(&self) -> usize {
            std::fs::read_dir(&self.root)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .starts_with(".fusion-import-")
                })
                .count()
        }
    }

    #[tokio::test]
    async fn t03_import_is_verified_atomic_idempotent_and_conflict_preserves_bytes() {
        let fixture = Fixture::new().await;
        let mut state = task_files::State::default();
        let content = "真实文件🙂\n".repeat(7000).into_bytes();
        let first = fixture
            .import(&mut state, "result.txt", &content)
            .await
            .unwrap();
        assert_eq!(first["status"], "imported");
        assert_eq!(first["entry"]["bytes"], content.len());
        assert_eq!(first["sha256"], format!("{:x}", Sha256::digest(&content)));
        assert_eq!(first["source"]["artifact_id"], "published-artifact");
        assert_eq!(
            std::fs::read(fixture.root.join("result.txt")).unwrap(),
            content
        );
        let second = fixture
            .import(&mut state, "result.txt", &content)
            .await
            .unwrap();
        assert_eq!(second["status"], "already_present");
        assert_eq!(
            fixture
                .import(&mut state, "result.txt", b"conflicting")
                .await,
            Err("owner_file_conflict")
        );
        assert_eq!(
            std::fs::read(fixture.root.join("result.txt")).unwrap(),
            content
        );
        assert_eq!(fixture.pending(), 0);
        let read = fixture
            .run(&mut state, fixture.command("read_file", "result.txt"))
            .await
            .unwrap();
        assert_eq!(read["sha256"], first["sha256"]);
        assert_eq!(read["truncated"], true);
        let id = serde_json::from_value(read["preview_id"].clone()).unwrap();
        let mut preview = Vec::new();
        for sequence in 0..4 {
            let chunk = fixture
                .run(
                    &mut state,
                    Command::ReadPreview {
                        preview_id: id,
                        sequence,
                    },
                )
                .await
                .unwrap();
            let mut frame = Vec::new();
            write_frame(
                &mut frame,
                &json!({"request_id":Uuid::new_v4(),"generation":"a".repeat(128),"result":chunk}),
            )
            .unwrap();
            assert!(frame.len() <= MAX_FRAME as usize);
            preview.extend(
                STANDARD
                    .decode(chunk["data_base64"].as_str().unwrap())
                    .unwrap(),
            );
            if chunk["done"] == true {
                break;
            }
        }
        assert_eq!(
            preview.len() as u64,
            read["preview_bytes"].as_u64().unwrap()
        );
        assert!(std::str::from_utf8(&preview).is_ok());
        assert_eq!(preview, &content[..preview.len()]);
        fixture.pool.close().await;
        let directory = fixture.boot.runtime_root.join(&fixture.boot.owner_key);
        let reopened = open_database(&directory, &fixture.boot).await.unwrap();
        let result = state
            .execute(
                &reopened,
                &fixture.boot,
                fixture.command("read_file", "result.txt"),
            )
            .await
            .unwrap();
        assert_eq!(result["sha256"], first["sha256"]);
        reopened.close().await;
    }

    #[tokio::test]
    async fn t03_scope_traversal_aliases_and_missing_roots_fail_closed() {
        let fixture = Fixture::new().await;
        let mut state = task_files::State::default();
        for path in [
            "../outside",
            "./one",
            "one//two",
            "one/../two",
            "/etc/a",
            "C:/x",
            "C:x",
            "\\\\server\\x",
            "x:ads",
            "NUL",
            "con.txt",
            "COM1.txt",
            "LPT¹",
            "trailing.",
            "trailing ",
            ".fusion-import-x",
        ] {
            assert!(
                fixture
                    .run(&mut state, fixture.command("read_file", path))
                    .await
                    .is_err(),
                "{path}"
            );
            assert!(
                fixture
                    .run(&mut state, fixture.begin(path, b"data"))
                    .await
                    .is_err(),
                "{path}"
            );
        }
        let other = provision(&fixture.pool, &fixture.boot, "other-job", "Other")
            .await
            .unwrap();
        let cross = Command::ListFiles {
            job_id: fixture.receipt.job_id.clone(),
            workspace_id: other.workspace_id,
            session_id: fixture.receipt.session_id,
            relative_path: String::new(),
        };
        assert_eq!(
            fixture.run(&mut state, cross).await,
            Err("owner_resource_not_found")
        );
        let outside = fixture._temp.path().join("outside.txt");
        std::fs::write(&outside, b"untouched").unwrap();
        std::fs::hard_link(&outside, fixture.root.join("hard.txt")).unwrap();
        assert_eq!(
            fixture
                .run(&mut state, fixture.command("read_file", "hard.txt"))
                .await,
            Err("owner_file_alias")
        );
        assert_eq!(
            fixture
                .run(&mut state, fixture.begin("hard.txt", b"write"))
                .await,
            Err("owner_file_alias")
        );
        assert!(
            fixture
                .run(&mut state, fixture.command("list_files", ""))
                .await
                .is_err()
        );
        std::fs::remove_file(fixture.root.join("hard.txt")).unwrap();
        assert_eq!(std::fs::read(&outside).unwrap(), b"untouched");
        assert_eq!(
            fixture
                .run(&mut state, fixture.command("read_file", "missing.txt"))
                .await,
            Err("owner_file_not_found")
        );
        assert_eq!(
            fixture
                .run(&mut state, fixture.begin("no-parent/x", b"x"))
                .await,
            Err("owner_file_not_found")
        );
        std::fs::remove_dir(&fixture.root).unwrap();
        assert_eq!(
            fixture
                .run(&mut state, fixture.command("list_files", ""))
                .await,
            Err("owner_files_unavailable")
        );
        fixture.pool.close().await;
    }

    #[tokio::test]
    async fn t03_empty_binary_encoding_oversize_and_list_frame_are_distinct() {
        let fixture = Fixture::new().await;
        let mut state = task_files::State::default();
        let empty = fixture
            .run(&mut state, fixture.command("list_files", ""))
            .await
            .unwrap();
        assert_eq!(empty["entries"], json!([]));
        assert_eq!(empty["truncated"], false);
        fixture.import(&mut state, "empty.txt", b"").await.unwrap();
        let empty = fixture
            .run(&mut state, fixture.command("read_file", "empty.txt"))
            .await
            .unwrap();
        assert_eq!(empty["kind"], "text");
        assert_eq!(empty["preview_bytes"], 0);
        let preview = fixture
            .run(
                &mut state,
                Command::ReadPreview {
                    preview_id: serde_json::from_value(empty["preview_id"].clone()).unwrap(),
                    sequence: 0,
                },
            )
            .await
            .unwrap();
        assert_eq!(preview["data_base64"], "");
        assert_eq!(preview["done"], true);
        for (name, data, reason) in [
            ("binary.bin", vec![0, 1, 2], "binary"),
            (
                "encoding.bin",
                vec![255, 254, 65, 0],
                "unsupported_encoding",
            ),
        ] {
            std::fs::write(fixture.root.join(name), &data).unwrap();
            let value = fixture
                .run(&mut state, fixture.command("read_file", name))
                .await
                .unwrap();
            assert_eq!(value["reason"], reason);
            assert_eq!(value["sha256"], format!("{:x}", Sha256::digest(&data)));
        }
        let large = std::fs::File::create(fixture.root.join("oversize.bin")).unwrap();
        large.set_len(task_files::MAX_BYTES + 1).unwrap();
        drop(large);
        let value = fixture
            .run(&mut state, fixture.command("read_file", "oversize.bin"))
            .await
            .unwrap();
        assert_eq!(value["reason"], "too_large");
        assert!(value["sha256"].is_null());
        for n in 0..501 {
            std::fs::write(fixture.root.join(format!("item-{n:04}.txt")), b"").unwrap();
        }
        let listing = fixture
            .run(&mut state, fixture.command("list_files", ""))
            .await
            .unwrap();
        assert_eq!(listing["truncated"], true);
        assert!(listing["entries"].as_array().unwrap().len() <= 500);
        let mut frame = Vec::new();
        write_frame(
            &mut frame,
            &json!({"request_id":Uuid::new_v4(),"generation":"a".repeat(128),"result":listing}),
        )
        .unwrap();
        assert!(frame.len() <= MAX_FRAME as usize);
        fixture.pool.close().await;
    }

    #[tokio::test]
    async fn t03_import_bad_hash_size_sequence_abort_and_drop_cleanup() {
        let fixture = Fixture::new().await;
        let mut state = task_files::State::default();
        let begin = fixture
            .run(&mut state, fixture.begin("bad.txt", b"abc"))
            .await
            .unwrap();
        let id = serde_json::from_value(begin["import_id"].clone()).unwrap();
        fixture
            .run(
                &mut state,
                Command::UploadChunk {
                    import_id: id,
                    sequence: 0,
                    data_base64: STANDARD.encode(b"abd"),
                },
            )
            .await
            .unwrap();
        assert_eq!(
            fixture
                .run(&mut state, Command::FinishImport { import_id: id })
                .await,
            Err("owner_import_integrity_mismatch")
        );
        assert_eq!(fixture.pending(), 0);
        assert!(!fixture.root.join("bad.txt").exists());
        let begin = fixture
            .run(&mut state, fixture.begin("sequence.txt", b"abc"))
            .await
            .unwrap();
        let id = serde_json::from_value(begin["import_id"].clone()).unwrap();
        assert_eq!(
            fixture
                .run(
                    &mut state,
                    Command::UploadChunk {
                        import_id: id,
                        sequence: 1,
                        data_base64: STANDARD.encode(b"abc")
                    }
                )
                .await,
            Err("owner_import_sequence_invalid")
        );
        assert_eq!(fixture.pending(), 0);
        let begin = fixture
            .run(&mut state, fixture.begin("size.txt", b"abc"))
            .await
            .unwrap();
        let id = serde_json::from_value(begin["import_id"].clone()).unwrap();
        assert_eq!(
            fixture
                .run(
                    &mut state,
                    Command::UploadChunk {
                        import_id: id,
                        sequence: 0,
                        data_base64: STANDARD.encode(b"abcd")
                    }
                )
                .await,
            Err("owner_import_size_mismatch")
        );
        assert_eq!(fixture.pending(), 0);
        let begin = fixture
            .run(&mut state, fixture.begin("abort.txt", b"abc"))
            .await
            .unwrap();
        let id = serde_json::from_value(begin["import_id"].clone()).unwrap();
        assert_eq!(
            fixture
                .run(&mut state, fixture.begin("busy.txt", b"abc"))
                .await,
            Err("owner_import_busy")
        );
        fixture
            .run(&mut state, Command::AbortImport { import_id: id })
            .await
            .unwrap();
        assert_eq!(fixture.pending(), 0);
        fixture
            .run(&mut state, fixture.begin("drop.txt", b"abc"))
            .await
            .unwrap();
        assert_eq!(fixture.pending(), 1);
        drop(state);
        assert_eq!(fixture.pending(), 0);
        fixture.pool.close().await;
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn t03_windows_reparse_parent_and_live_file_mutation_are_rejected() {
        use std::os::windows::process::CommandExt;
        let fixture = Fixture::new().await;
        let mut state = task_files::State::default();
        let outside = fixture._temp.path().join("outside");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), b"untouched").unwrap();
        let junction = fixture.root.join("alias");
        let output = std::process::Command::new("cmd.exe")
            .args(["/D", "/C", "mklink", "/J"])
            .arg(&junction)
            .arg(&outside)
            .creation_flags(0x08000000)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            fixture
                .run(&mut state, fixture.command("read_file", "alias/secret.txt"))
                .await
                .is_err()
        );
        assert!(
            fixture
                .run(&mut state, fixture.begin("alias/new.txt", b"bad"))
                .await
                .is_err()
        );
        assert!(!outside.join("new.txt").exists());
        assert_eq!(
            std::fs::read(outside.join("secret.txt")).unwrap(),
            b"untouched"
        );
        std::fs::remove_dir(&junction).unwrap();
        let begin = fixture
            .run(&mut state, fixture.begin("guarded.txt", b"data"))
            .await
            .unwrap();
        let id = serde_json::from_value(begin["import_id"].clone()).unwrap();
        assert!(
            std::fs::rename(&fixture.root, fixture.root.with_extension("moved")).is_err(),
            "held parent must deny rename"
        );
        fixture
            .run(&mut state, Command::AbortImport { import_id: id })
            .await
            .unwrap();
        fixture.pool.close().await;
    }

    #[test]
    fn t03_stdio_eof_cleans_pending_import() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let fixture = runtime.block_on(Fixture::new());
        runtime.block_on(fixture.pool.close());
        drop(runtime);
        let boot = json!({"protocol":1,"owner_key":fixture.boot.owner_key,"installation_id":fixture.boot.installation_id,"generation":fixture.boot.generation,"runtime_root":fixture.boot.runtime_root});
        let begin = json!({"request_id":Uuid::new_v4(),"generation":fixture.boot.generation,"command":{"op":"begin_import","job_id":fixture.receipt.job_id,"workspace_id":fixture.receipt.workspace_id,"session_id":fixture.receipt.session_id,"artifact_id":"artifact","relative_path":"eof.txt","bytes":3,"sha256":format!("{:x}",Sha256::digest(b"abc")),"version":1}});
        let input = format!("{boot}\n{begin}\n");
        let mut output = Vec::new();
        run_protocol(
            &mut std::io::Cursor::new(input),
            &mut output,
            &fixture.boot.runtime_root.join(&fixture.boot.owner_key),
        )
        .unwrap();
        let frames: Vec<Value> = String::from_utf8(output)
            .unwrap()
            .lines()
            .map(|s| serde_json::from_str(s).unwrap())
            .collect();
        assert!(frames[1]["result"]["import_id"].is_string());
        assert_eq!(fixture.pending(), 0);
        assert!(!fixture.root.join("eof.txt").exists());
    }
    #[test]
    fn t03_resource_commands_are_a_closed_typed_protocol() {
        for op in ["list_files", "read_file"] {
            let value = serde_json::json!({"op":op,"job_id":"job","workspace_id":Uuid::new_v4(),"session_id":Uuid::new_v4(),"relative_path":""});
            assert!(
                serde_json::from_value::<Command>(value).is_ok(),
                "missing {op} protocol"
            );
        }
        let value = serde_json::json!({
            "op":"read_session_history",
            "job_id":"job",
            "workspace_id":Uuid::new_v4(),
            "session_id":Uuid::new_v4()
        });
        assert!(serde_json::from_value::<Command>(value).is_ok());
        let value = serde_json::json!({
            "op":"read_diff",
            "job_id":"job",
            "workspace_id":Uuid::new_v4(),
            "session_id":Uuid::new_v4()
        });
        assert!(serde_json::from_value::<Command>(value).is_ok());
    }

    #[test]
    fn t03_execution_commands_are_narrow_and_bound() {
        let workspace_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let execution_id = Uuid::new_v4();
        let start = json!({
            "op":"start_execution",
            "job_id":"job",
            "workspace_id":workspace_id,
            "session_id":session_id,
            "business_attempt_id":"attempt-a",
            "prompt":"Inspect the task and produce the requested result.",
            "intent":"technical_user"
        });
        assert!(serde_json::from_value::<Command>(start.clone()).is_ok());
        let mut unsafe_start = start;
        unsafe_start["executor_config"] = json!({"sandbox":"danger-full-access"});
        assert!(serde_json::from_value::<Command>(unsafe_start).is_err());

        for op in ["read_execution", "cancel_execution"] {
            let value = json!({
                "op":op,
                "job_id":"job",
                "workspace_id":workspace_id,
                "session_id":session_id,
                "execution_id":execution_id
            });
            assert!(
                serde_json::from_value::<Command>(value).is_ok(),
                "missing {op}"
            );
        }
        let read_approvals = json!({
            "op":"read_approvals",
            "job_id":"job",
            "workspace_id":workspace_id,
            "session_id":session_id,
            "execution_id":execution_id
        });
        assert!(serde_json::from_value::<Command>(read_approvals).is_ok());
        let approval_id = Uuid::new_v4();
        let respond = json!({
            "op":"respond_approval",
            "job_id":"job",
            "workspace_id":workspace_id,
            "session_id":session_id,
            "execution_id":execution_id,
            "approval_id":approval_id,
            "response":{"decision":"approve"}
        });
        assert!(serde_json::from_value::<Command>(respond.clone()).is_ok());
        let mut unsafe_response = respond;
        unsafe_response["response"]["always_allow"] = json!(true);
        assert!(serde_json::from_value::<Command>(unsafe_response).is_err());
    }

    #[test]
    fn t03_terminal_commands_are_narrow_and_bound() {
        let workspace_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let terminal_id = Uuid::new_v4();
        let start = json!({
            "op":"start_terminal",
            "job_id":"job",
            "workspace_id":workspace_id,
            "session_id":session_id,
            "cols":100,
            "rows":30
        });
        assert!(serde_json::from_value::<Command>(start.clone()).is_ok());
        for forbidden in ["working_dir", "shell", "environment", "endpoint"] {
            let mut unsafe_start = start.clone();
            unsafe_start[forbidden] = json!("untrusted");
            assert!(serde_json::from_value::<Command>(unsafe_start).is_err());
        }
        for op in ["read_terminal", "close_terminal"] {
            let mut value = json!({
                "op":op,
                "job_id":"job",
                "workspace_id":workspace_id,
                "session_id":session_id,
                "terminal_id":terminal_id
            });
            if op == "read_terminal" {
                value["after_sequence"] = json!(0);
            }
            assert!(
                serde_json::from_value::<Command>(value).is_ok(),
                "missing {op}"
            );
        }
        let write = json!({
            "op":"write_terminal",
            "job_id":"job",
            "workspace_id":workspace_id,
            "session_id":session_id,
            "terminal_id":terminal_id,
            "data_base64":"ZGlyDQ=="
        });
        assert!(serde_json::from_value::<Command>(write).is_ok());
        let resize = json!({
            "op":"resize_terminal",
            "job_id":"job",
            "workspace_id":workspace_id,
            "session_id":session_id,
            "terminal_id":terminal_id,
            "cols":120,
            "rows":40
        });
        assert!(serde_json::from_value::<Command>(resize).is_ok());
    }

    #[tokio::test]
    async fn t03_terminal_runs_only_in_the_bound_task_root_and_closes() {
        use base64::{Engine, engine::general_purpose::STANDARD};

        let fixture = Fixture::new().await;
        std::fs::write(fixture.root.join("scope-marker.txt"), b"bound-task").unwrap();
        let mut terminals = OwnerTerminalState::new();
        let started = terminals
            .start(
                &fixture.pool,
                &fixture.boot,
                &fixture.receipt.job_id,
                fixture.receipt.workspace_id,
                fixture.receipt.session_id,
                100,
                30,
            )
            .await
            .unwrap();
        let terminal_id = Uuid::parse_str(started["terminal_id"].as_str().unwrap()).unwrap();
        let resumed = terminals
            .start(
                &fixture.pool,
                &fixture.boot,
                &fixture.receipt.job_id,
                fixture.receipt.workspace_id,
                fixture.receipt.session_id,
                100,
                30,
            )
            .await
            .unwrap();
        assert_eq!(resumed["terminal_id"], started["terminal_id"]);
        assert_eq!(resumed["active"], true);
        terminals
            .write(
                &fixture.pool,
                &fixture.boot,
                &fixture.receipt.job_id,
                fixture.receipt.workspace_id,
                fixture.receipt.session_id,
                terminal_id,
                &STANDARD.encode(b"Get-Content scope-marker.txt\r"),
            )
            .await
            .unwrap();
        let mut output = Vec::new();
        for _ in 0..100 {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            let value = terminals
                .read(
                    &fixture.pool,
                    &fixture.boot,
                    &fixture.receipt.job_id,
                    fixture.receipt.workspace_id,
                    fixture.receipt.session_id,
                    terminal_id,
                    0,
                )
                .await
                .unwrap();
            output.clear();
            for entry in value["entries"].as_array().unwrap() {
                output.extend(
                    STANDARD
                        .decode(entry["data_base64"].as_str().unwrap())
                        .unwrap(),
                );
            }
            if String::from_utf8_lossy(&output).contains("bound-task") {
                break;
            }
        }
        assert!(
            String::from_utf8_lossy(&output).contains("bound-task"),
            "terminal output: {:?}",
            String::from_utf8_lossy(&output)
        );
        terminals
            .close(
                &fixture.pool,
                &fixture.boot,
                &fixture.receipt.job_id,
                fixture.receipt.workspace_id,
                fixture.receipt.session_id,
                terminal_id,
            )
            .await
            .unwrap();
        assert_eq!(
            terminals
                .read(
                    &fixture.pool,
                    &fixture.boot,
                    &fixture.receipt.job_id,
                    fixture.receipt.workspace_id,
                    fixture.receipt.session_id,
                    terminal_id,
                    0,
                )
                .await,
            Err("owner_terminal_not_found")
        );
    }

    #[tokio::test]
    async fn t03_session_history_reads_only_the_bound_real_session() {
        let fixture = Fixture::new().await;
        let process_id = Uuid::new_v4();
        sqlx::query("INSERT INTO execution_processes(id,session_id,run_reason,executor_action,status,exit_code,dropped,started_at,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
            .bind(process_id)
            .bind(fixture.receipt.session_id)
            .bind("codingagent")
            .bind("{}")
            .bind("completed")
            .bind(0_i64)
            .bind(false)
            .bind("2026-09-20T01:00:00Z")
            .bind("2026-09-20T01:00:02Z")
            .bind("2026-09-20T01:00:00Z")
            .bind("2026-09-20T01:00:02Z")
            .execute(&fixture.pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO fusion_execution_links_v1(execution_id,job_id,workspace_id,session_id,business_attempt_id,intent) VALUES(?,?,?,?,?,?)")
            .bind(process_id)
            .bind(&fixture.receipt.job_id)
            .bind(fixture.receipt.workspace_id)
            .bind(fixture.receipt.session_id)
            .bind("attempt-a")
            .bind("technical_user")
            .execute(&fixture.pool)
            .await
            .unwrap();
        let value = read_session_history(
            &fixture.pool,
            &fixture.boot,
            &fixture.receipt.job_id,
            fixture.receipt.workspace_id,
            fixture.receipt.session_id,
        )
        .await
        .unwrap();
        assert_eq!(value["job_id"], fixture.receipt.job_id);
        assert_eq!(
            value["workspace_id"],
            fixture.receipt.workspace_id.to_string()
        );
        assert_eq!(value["session_id"], fixture.receipt.session_id.to_string());
        assert_eq!(value["entries"].as_array().unwrap().len(), 1);
        assert_eq!(value["entries"][0]["event_id"], process_id.to_string());
        assert_eq!(value["entries"][0]["kind"], "codingagent");
        assert_eq!(value["entries"][0]["state"], "completed");
        assert_eq!(value["truncated"], false);
        assert!(
            read_session_history(
                &fixture.pool,
                &fixture.boot,
                "other-job",
                fixture.receipt.workspace_id,
                fixture.receipt.session_id,
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn t03_execution_output_is_limited_to_the_bound_task_session() {
        let fixture = Fixture::new().await;
        let process_id = Uuid::new_v4();
        sqlx::query("INSERT INTO execution_processes(id,session_id,run_reason,executor_action,status,exit_code,dropped,started_at,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
            .bind(process_id)
            .bind(fixture.receipt.session_id)
            .bind("codingagent")
            .bind("{}")
            .bind("running")
            .bind(Option::<i64>::None)
            .bind(false)
            .bind("2026-09-20T01:00:00Z")
            .bind(Option::<String>::None)
            .bind("2026-09-20T01:00:00Z")
            .bind("2026-09-20T01:00:00Z")
            .execute(&fixture.pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO fusion_execution_links_v1(execution_id,job_id,workspace_id,session_id,business_attempt_id,intent) VALUES(?,?,?,?,?,?)")
            .bind(process_id)
            .bind(&fixture.receipt.job_id)
            .bind(fixture.receipt.workspace_id)
            .bind(fixture.receipt.session_id)
            .bind("attempt-a")
            .bind("technical_user")
            .execute(&fixture.pool)
            .await
            .unwrap();
        let directory = fixture.boot.runtime_root.join(&fixture.boot.owner_key);
        let log_path = utils::execution_logs::process_log_file_path_in_root(
            &directory,
            fixture.receipt.session_id,
            process_id,
        );
        std::fs::create_dir_all(log_path.parent().unwrap()).unwrap();
        std::fs::write(&log_path, "{\"Stdout\":\"真实输出\"}\n").unwrap();
        let state = OwnerExecutionState::new();
        let actual = state
            .read(
                &fixture.pool,
                &fixture.boot,
                &directory,
                &fixture.receipt.job_id,
                fixture.receipt.workspace_id,
                fixture.receipt.session_id,
                process_id,
            )
            .await
            .unwrap();
        assert_eq!(actual["execution_id"], process_id.to_string());
        assert_eq!(actual["business_attempt_id"], "attempt-a");
        assert_eq!(actual["profile"], "CODEX:CHAOTANG_SUPERVISED");
        assert_eq!(actual["entries"].as_array().unwrap().len(), 1);
        assert_eq!(actual["entries"][0]["kind"], "stdout");
        assert_eq!(actual["entries"][0]["text"], "真实输出");
        assert!(
            state
                .read(
                    &fixture.pool,
                    &fixture.boot,
                    &directory,
                    "foreign-job",
                    fixture.receipt.workspace_id,
                    fixture.receipt.session_id,
                    process_id,
                )
                .await
                .is_err()
        );
        assert!(
            state
                .read(
                    &fixture.pool,
                    &fixture.boot,
                    &directory,
                    &fixture.receipt.job_id,
                    fixture.receipt.workspace_id,
                    Uuid::new_v4(),
                    process_id,
                )
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn t03_diff_reads_the_bound_real_git_worktree_and_distinguishes_states() {
        let fixture = Fixture::new().await;
        let missing = read_task_diff(
            &fixture.pool,
            &fixture.boot,
            &fixture.receipt.job_id,
            fixture.receipt.workspace_id,
            fixture.receipt.session_id,
        )
        .await
        .unwrap();
        assert_eq!(missing["state"], "not_git_repository");
        assert_eq!(missing["repository"], false);

        git::GitService::new()
            .initialize_repo_with_main_branch(&fixture.root)
            .unwrap();
        let clean = read_task_diff(
            &fixture.pool,
            &fixture.boot,
            &fixture.receipt.job_id,
            fixture.receipt.workspace_id,
            fixture.receipt.session_id,
        )
        .await
        .unwrap();
        assert_eq!(clean["state"], "clean");
        assert_eq!(clean["repository"], true);
        assert!(
            clean["head"]
                .as_str()
                .is_some_and(|value| value.len() == 40)
        );
        assert_eq!(clean["entries"], json!([]));
        assert_eq!(clean["patch"], "");

        std::fs::write(fixture.root.join("真实变更.txt"), "first line\n").unwrap();
        let changed = read_task_diff(
            &fixture.pool,
            &fixture.boot,
            &fixture.receipt.job_id,
            fixture.receipt.workspace_id,
            fixture.receipt.session_id,
        )
        .await
        .unwrap();
        assert_eq!(changed["state"], "changed");
        assert_eq!(changed["entries"][0]["path"], "真实变更.txt");
        assert_eq!(changed["entries"][0]["change"], "added");
        assert!(changed["patch"].as_str().unwrap().contains("+first line"));
        assert_eq!(changed["truncated"], false);
        assert!(
            read_task_diff(
                &fixture.pool,
                &fixture.boot,
                "foreign-job",
                fixture.receipt.workspace_id,
                fixture.receipt.session_id,
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn t03_provision_creates_real_workspace_file_root() {
        let temp = tempfile::tempdir().unwrap();
        let mut boot = bootstrap();
        boot.runtime_root = temp.path().join("owner-runtimes");
        let directory = boot.runtime_root.join(&boot.owner_key);
        claim_directory(&directory, &boot).unwrap();
        let pool = open_database(&directory, &boot).await.unwrap();
        initialize(&pool, &boot).await.unwrap();
        let receipt = provision(&pool, &boot, "file-job", "Files").await.unwrap();
        let root = directory
            .join("task-files")
            .join(receipt.workspace_id.to_string());
        assert!(root.is_dir(), "provision must create actual task file root");
        let attached = sqlx::query(
            "SELECT r.path,r.is_git,wr.target_branch FROM workspace_repos wr JOIN repos r ON r.id=wr.repo_id WHERE wr.workspace_id=?",
        )
        .bind(receipt.workspace_id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            attached.len(),
            1,
            "each owned task workspace needs one exact cdesktop repository"
        );
        assert_eq!(attached[0].get::<String, _>("path"), root.to_string_lossy());
        assert!(!attached[0].get::<bool, _>("is_git"));
        assert_eq!(
            attached[0].get::<String, _>("target_branch"),
            "chaotang/file-job"
        );
        let actual = read_resource(
            &pool,
            &boot,
            "file-job",
            receipt.workspace_id,
            receipt.session_id,
        )
        .await
        .unwrap();
        assert_eq!(actual["files_available"], true);
        pool.close().await;
    }
    fn bootstrap() -> Bootstrap {
        Bootstrap {
            protocol: 1,
            owner_key: "a".repeat(64),
            installation_id: "test-installation".into(),
            generation: "unique-login".into(),
            runtime_root: std::env::temp_dir().join("owner-runtimes"),
        }
    }

    #[test]
    fn frames_and_bootstrap_fail_closed() {
        assert!(bootstrap().validate().is_ok());
        let mut bad = bootstrap();
        bad.owner_key = "../other".into();
        assert!(bad.validate().is_err());
        assert!(read_frame(&mut std::io::Cursor::new("unterminated")).is_err());
        assert!(
            read_frame(&mut std::io::Cursor::new(format!(
                "{}\n",
                "a".repeat(MAX_FRAME as usize)
            )))
            .is_err()
        );
        assert_eq!(
            read_frame(&mut std::io::Cursor::new("one\ntwo\n")).unwrap(),
            Some("one\n".into())
        );
    }

    #[test]
    fn directories_require_exact_persistent_owner_and_no_legacy_data() {
        let temp = tempfile::tempdir().unwrap();
        let mut boot = bootstrap();
        boot.runtime_root = temp.path().join("owner-runtimes");
        let path = temp.path().join("owner-runtimes").join(&boot.owner_key);
        assert!(claim_directory(temp.path(), &boot).is_err());
        claim_directory(&path, &boot).unwrap();
        claim_directory(&path, &boot).unwrap();
        let mut other = bootstrap();
        other.runtime_root = boot.runtime_root.clone();
        other.installation_id = "another-install".into();
        assert_eq!(claim_directory(&path, &other), Err("owner_marker_mismatch"));
        let unclaimed = temp
            .path()
            .join("other")
            .join("owner-runtimes")
            .join(&boot.owner_key);
        std::fs::create_dir_all(&unclaimed).unwrap();
        std::fs::write(unclaimed.join("db.v2.sqlite"), b"legacy").unwrap();
        boot.runtime_root = unclaimed.parent().unwrap().to_path_buf();
        assert_eq!(
            claim_directory(&unclaimed, &boot),
            Err("owner_directory_unclaimed")
        );
    }

    #[test]
    fn interrupted_marker_does_not_become_authority_or_block_recovery() {
        let temp = tempfile::tempdir().unwrap();
        let mut boot = bootstrap();
        boot.runtime_root = temp.path().join("owner-runtimes");
        let path = boot.runtime_root.join(&boot.owner_key);
        std::fs::create_dir_all(&path).unwrap();
        let orphan = path.join(format!(".fusion-owner-v1.{}.pending", Uuid::new_v4()));
        std::fs::write(&orphan, b"{broken").unwrap();
        claim_directory(&path, &boot).unwrap();
        assert!(orphan.exists());
        claim_directory(&path, &boot).unwrap();
        assert!(path.join("fusion-owner-v1.json").is_file());
    }

    #[test]
    fn sqlite_file_hardlinks_and_sidecar_aliases_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let outside = temp.path().join("other-database");
        let directory = temp.path().join("owner");
        std::fs::create_dir(&directory).unwrap();
        std::fs::write(&outside, b"unrelated").unwrap();
        let linked = directory.join("db.v2.sqlite");
        std::fs::hard_link(&outside, &linked).unwrap();
        assert_eq!(
            validate_database_files(&directory),
            Err("owner_database_alias")
        );
        std::fs::remove_file(&linked).unwrap();
        std::fs::create_dir(directory.join("db.v2.sqlite-journal")).unwrap();
        assert_eq!(
            validate_database_files(&directory),
            Err("owner_database_alias")
        );
        assert_eq!(std::fs::read(&outside).unwrap(), b"unrelated");
    }

    #[tokio::test]
    async fn disk_reopen_checks_identity_and_rejects_changed_migration_checksum() {
        let temp = tempfile::tempdir().unwrap();
        let mut boot = bootstrap();
        boot.runtime_root = temp.path().join("owner-runtimes");
        claim_directory(&boot.runtime_root.join(&boot.owner_key), &boot).unwrap();
        let pool = open_database(temp.path(), &boot).await.unwrap();
        initialize(&pool, &boot).await.unwrap();
        let first = provision(&pool, &boot, "persistent-job", "Persistence")
            .await
            .unwrap();
        pool.close().await;
        let pool = open_database(temp.path(), &boot).await.unwrap();
        let second = provision(&pool, &boot, "persistent-job", "Again")
            .await
            .unwrap();
        assert_eq!(first.workspace_id, second.workspace_id);
        sqlx::query("UPDATE _sqlx_migrations SET checksum=x'00' WHERE version=(SELECT MIN(version) FROM _sqlx_migrations)").execute(&pool).await.unwrap();
        pool.close().await;
        let mut other = bootstrap();
        other.owner_key = "b".repeat(64);
        assert!(matches!(
            open_database(temp.path(), &other).await,
            Err("owner_database_identity_mismatch")
        ));
        assert!(matches!(
            open_database(temp.path(), &boot).await,
            Err("owner_migration_incompatible")
        ));
    }

    #[tokio::test]
    async fn provision_is_atomic_idempotent_and_reads_real_cdesktop_models() {
        let temp = tempfile::tempdir().unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("../db/migrations").run(&pool).await.unwrap();
        let mut boot = bootstrap();
        boot.runtime_root = temp.path().join("owner-runtimes");
        claim_directory(&boot.runtime_root.join(&boot.owner_key), &boot).unwrap();
        initialize(&pool, &boot).await.unwrap();
        let first = provision(&pool, &boot, "job-one", "Original task")
            .await
            .unwrap();
        let repeat = provision(
            &pool,
            &boot,
            "job-one",
            "Changed title must not create new resource",
        )
        .await
        .unwrap();
        assert_eq!(first.workspace_id, repeat.workspace_id);
        assert_eq!(first.session_id, repeat.session_id);
        assert_eq!(first.resource_fingerprint, repeat.resource_fingerprint);
        let actual = read_resource(
            &pool,
            &boot,
            "job-one",
            first.workspace_id,
            first.session_id,
        )
        .await
        .unwrap();
        assert_eq!(actual["workspace"]["name"], "Original task");
        assert_eq!(
            actual["session"]["workspace_id"],
            first.workspace_id.to_string()
        );
        assert_eq!(actual["execution_available"], true);
        assert!(
            read_resource(
                &pool,
                &boot,
                "job-two",
                first.workspace_id,
                first.session_id
            )
            .await
            .is_err()
        );
        let second = provision(&pool, &boot, "job-two", "Other task")
            .await
            .unwrap();
        assert!(
            read_resource(
                &pool,
                &boot,
                "job-one",
                first.workspace_id,
                second.session_id
            )
            .await
            .is_err()
        );
        let mut other = bootstrap();
        other.owner_key = "b".repeat(64);
        assert_eq!(
            initialize(&pool, &other).await,
            Err("owner_database_identity_mismatch")
        );
        assert!(
            read_resource(
                &pool,
                &other,
                "job-one",
                first.workspace_id,
                first.session_id
            )
            .await
            .is_err()
        );
        assert!(
            provision(&pool, &other, "job-one", "Must refuse")
                .await
                .is_err()
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM workspaces")
                .fetch_one(&pool)
                .await
                .unwrap(),
            2
        );
        pool.close().await;
    }
}
