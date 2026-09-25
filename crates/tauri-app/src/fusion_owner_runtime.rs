//! Native-only owner resource supervisor. Never exposes paths or broker authority to JS.
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    time::{Instant, timeout, timeout_at},
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::chaotang_provider::ChaotangProviderState;

const FRAME_LIMIT: u64 = 32 * 1024;
const TOTAL_DEADLINE: Duration = Duration::from_secs(45);
const UNAVAILABLE: &str = "OWNER_RUNTIME_UNAVAILABLE";
const STALE: &str = "OWNER_SESSION_CHANGED: 账户已切换，请重新打开任务";
const INVALID: &str = "OWNER_CONTRACT_INVALID: 桌面资源关联校验失败";

fn owner_key(namespace: &str, installation: &str, owner: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&[namespace, installation, owner]).expect("string JSON"))
    )
}
fn bounded_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || matches!(v, b'-' | b'_'))
}
fn bounded_trace_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || matches!(v, b'-' | b'_' | b'.' | b':'))
}

pub(crate) struct OwnerAuth {
    pub client: reqwest::Client,
    pub base_url: String,
    pub token: String,
    pub epoch: u64,
}

struct Configuration {
    installation: String,
    namespace: String,
    broker: String,
    root: PathBuf,
}
impl Configuration {
    fn from_environment() -> Result<Self, String> {
        let installation =
            std::env::var("CHAOTANG_DESKTOP_INSTALLATION_ID").map_err(|_| UNAVAILABLE)?;
        let namespace =
            std::env::var("CHAOTANG_DESKTOP_BACKEND_NAMESPACE").map_err(|_| UNAVAILABLE)?;
        let secret_file =
            std::env::var_os("CHAOTANG_DESKTOP_BROKER_SECRET_FILE").ok_or(UNAVAILABLE)?;
        let appdata = std::env::var_os("CDESKTOP_DATA_DIR").ok_or(UNAVAILABLE)?;
        Self::load(
            installation,
            namespace,
            Path::new(&secret_file),
            Path::new(&appdata),
        )
    }
    fn load(
        installation: String,
        namespace: String,
        secret_file: &Path,
        appdata: &Path,
    ) -> Result<Self, String> {
        if !bounded_id(&installation)
            || !bounded_id(&namespace)
            || !secret_file.is_absolute()
            || !appdata.is_absolute()
            || appdata
                .components()
                .any(|p| matches!(p, std::path::Component::ParentDir))
        {
            return Err(UNAVAILABLE.into());
        }
        let metadata = std::fs::symlink_metadata(secret_file).map_err(|_| UNAVAILABLE)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 4099 {
            return Err(UNAVAILABLE.into());
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(UNAVAILABLE.into());
            }
        }
        use std::io::Read;
        let mut bytes = Vec::new();
        std::fs::File::open(secret_file)
            .map_err(|_| UNAVAILABLE)?
            .take(4100)
            .read_to_end(&mut bytes)
            .map_err(|_| UNAVAILABLE)?;
        let text = std::str::from_utf8(&bytes).map_err(|_| UNAVAILABLE)?;
        let broker = text.trim_start_matches('\u{feff}').trim();
        if !(32..=4096).contains(&broker.len()) || !broker.bytes().all(|v| v.is_ascii_graphic()) {
            return Err(UNAVAILABLE.into());
        }
        Ok(Self {
            installation,
            namespace,
            broker: broker.into(),
            root: appdata.join("owner-runtimes"),
        })
    }
}

#[derive(Default)]
pub(crate) struct OwnerRuntime {
    gate: tokio::sync::Mutex<()>,
    child: tokio::sync::Mutex<Option<OwnerChild>>,
    epoch: AtomicU64,
    cancellation: Mutex<CancellationToken>,
}
impl OwnerRuntime {
    pub(crate) async fn revoke(&self, epoch: u64) {
        self.epoch.store(epoch, Ordering::SeqCst);
        self.cancellation
            .lock()
            .expect("owner cancellation")
            .cancel();
        // Active work observes cancellation before revoke acquires the gate.
        let _guard = self.gate.lock().await;
        let mut child = self.child.lock().await;
        if let Some(mut owned) = child.take() {
            let _ = owned.shutdown().await;
        }
        *self.cancellation.lock().expect("owner cancellation") = CancellationToken::new();
    }

    async fn execute(
        &self,
        auth: &OwnerAuth,
        job_id: &str,
        create: bool,
        config: &Configuration,
    ) -> Result<DesktopResources, String> {
        let deadline = Instant::now() + TOTAL_DEADLINE;
        let _guard = timeout_at(deadline, self.gate.lock())
            .await
            .map_err(|_| "OWNER_TIMEOUT: 桌面资源操作超时")?;
        if self.epoch.load(Ordering::SeqCst) != auth.epoch {
            return Err(STALE.into());
        }
        let cancelled = self
            .cancellation
            .lock()
            .expect("owner cancellation")
            .clone();
        let mut child = self.child.lock().await;
        let result = tokio::select! {
            biased;
            _ = cancelled.cancelled() => Err(STALE.into()),
            value = timeout_at(deadline, workflow(auth, job_id, create, config, &mut child)) => value.unwrap_or_else(|_| Err("OWNER_TIMEOUT: 桌面资源操作超时".into())),
        };
        let stale = cancelled.is_cancelled() || self.epoch.load(Ordering::SeqCst) != auth.epoch;
        if stale
            || result
                .as_ref()
                .err()
                .is_some_and(|error| reset_child(error))
        {
            if let Some(mut owned) = child.take() {
                owned.shutdown().await?;
            }
        }
        if stale {
            return Err(STALE.into());
        }
        result
    }

    async fn execute_resource(
        &self,
        auth: &OwnerAuth,
        job_id: &str,
        operation: ResourceOperation,
        config: &Configuration,
    ) -> Result<Value, String> {
        let deadline = Instant::now() + TOTAL_DEADLINE;
        let _guard = timeout_at(deadline, self.gate.lock())
            .await
            .map_err(|_| "OWNER_TIMEOUT: 桌面资源操作超时")?;
        if self.epoch.load(Ordering::SeqCst) != auth.epoch {
            return Err(STALE.into());
        }
        let cancelled = self
            .cancellation
            .lock()
            .expect("owner cancellation")
            .clone();
        let mut child = self.child.lock().await;
        let result = tokio::select! {
            biased;
            _ = cancelled.cancelled() => Err(STALE.into()),
            value = timeout_at(deadline, resource_workflow(auth, job_id, operation, config, &mut child)) => value.unwrap_or_else(|_| Err("OWNER_TIMEOUT: 桌面资源操作超时".into())),
        };
        let stale = cancelled.is_cancelled() || self.epoch.load(Ordering::SeqCst) != auth.epoch;
        if stale
            || result
                .as_ref()
                .err()
                .is_some_and(|error| reset_child(error))
        {
            if let Some(mut owned) = child.take() {
                owned.shutdown().await?;
            }
        }
        if stale {
            return Err(STALE.into());
        }
        result
    }
}

fn reset_child(error: &str) -> bool {
    error.starts_with(UNAVAILABLE)
        || error.starts_with(INVALID)
        || error.starts_with("OWNER_TIMEOUT")
        || error.starts_with("OWNER_CLEANUP_UNCONFIRMED")
}

enum ResourceOperation {
    List {
        relative_path: String,
    },
    Read {
        relative_path: String,
    },
    Import {
        artifact_id: String,
        relative_path: String,
    },
    SessionHistory,
    Diff,
    StartExecution {
        prompt: String,
    },
    ReadExecution {
        execution_id: Uuid,
    },
    CancelExecution {
        execution_id: Uuid,
    },
    ReadApprovals {
        execution_id: Uuid,
    },
    RespondApproval {
        execution_id: Uuid,
        approval_id: String,
        response: TaskApprovalDecision,
    },
    StartTerminal {
        cols: u16,
        rows: u16,
    },
    ReadTerminal {
        terminal_id: Uuid,
        after_sequence: u64,
    },
    WriteTerminal {
        terminal_id: Uuid,
        data_base64: String,
    },
    ResizeTerminal {
        terminal_id: Uuid,
        cols: u16,
        rows: u16,
    },
    CloseTerminal {
        terminal_id: Uuid,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DesktopBinding {
    pub binding_id: String,
    pub job_id: String,
    pub installation_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub resource_fingerprint: String,
    pub business_attempt_id: Option<String>,
    #[serde(deserialize_with = "binding_time")]
    pub created_at: String,
}
fn binding_time<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let value = Value::deserialize(d)?;
    use sqlx::types::chrono::{DateTime, Utc};
    let timestamp = match value {
        Value::String(text) => DateTime::parse_from_rfc3339(&text)
            .map(|v| v.with_timezone(&Utc))
            .ok(),
        Value::Number(number) => number
            .as_i64()
            .and_then(|n| DateTime::<Utc>::from_timestamp(n, 0)),
        _ => None,
    }
    .ok_or_else(|| serde::de::Error::custom("invalid binding time"))?;
    Ok(timestamp.to_rfc3339())
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DesktopWorkspace {
    pub id: Uuid,
    pub name: Option<String>,
    pub branch: String,
    pub archived: bool,
    pub use_worktree: bool,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DesktopSession {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: Option<String>,
    pub executor: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopResources {
    pub job_id: String,
    pub binding: DesktopBinding,
    pub workspace: DesktopWorkspace,
    pub session: DesktopSession,
    pub files_available: bool,
    pub execution_available: bool,
    pub terminal_available: bool,
    pub preview_available: bool,
}
#[derive(Deserialize)]
struct Context {
    protocol: u32,
    installation_id: String,
    backend_namespace: String,
}
#[derive(Deserialize)]
struct BindingPage {
    items: Vec<DesktopBinding>,
}
#[derive(Deserialize)]
struct Intent {
    intent_id: String,
    job_id: String,
    installation_id: String,
    resource_kind: String,
}
#[derive(Debug, Deserialize)]
struct Receipt {
    job_id: String,
    workspace_id: Uuid,
    session_id: Uuid,
    resource_fingerprint: String,
}
#[derive(Deserialize)]
struct ChildResources {
    binding: Receipt,
    workspace: DesktopWorkspace,
    session: DesktopSession,
    files_available: bool,
    execution_available: bool,
    terminal_available: bool,
    preview_available: bool,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskTerminal {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub terminal_id: Uuid,
    pub active: bool,
    pub next_sequence: u64,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskTerminalEntry {
    pub sequence: u64,
    pub data_base64: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskTerminalRead {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub terminal_id: Uuid,
    pub active: bool,
    pub earliest_sequence: u64,
    pub next_sequence: u64,
    pub truncated: bool,
    pub entries: Vec<TaskTerminalEntry>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskFileEntry {
    pub relative_path: String,
    pub name: String,
    pub kind: String,
    pub bytes: Option<u64>,
    pub modified_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskFileList {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub relative_path: String,
    pub entries: Vec<TaskFileEntry>,
    pub truncated: bool,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskSessionEvent {
    pub event_id: Uuid,
    pub kind: String,
    pub state: String,
    pub exit_code: Option<i64>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskSessionHistory {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub entries: Vec<TaskSessionEvent>,
    pub truncated: bool,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskDiffEntry {
    pub path: String,
    pub old_path: Option<String>,
    pub change: String,
    pub binary: bool,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskDiff {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub state: String,
    pub repository: bool,
    pub head: Option<String>,
    pub branch: Option<String>,
    pub entries: Vec<TaskDiffEntry>,
    pub patch: String,
    pub truncated: bool,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskExecution {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub business_attempt_id: Option<String>,
    pub execution_id: Uuid,
    pub state: String,
    pub exit_code: Option<i64>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub profile: String,
    #[serde(default)]
    pub entries: Vec<TaskExecutionEntry>,
    #[serde(default)]
    pub truncated: bool,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskExecutionEntry {
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "decision", rename_all = "snake_case", deny_unknown_fields)]
pub enum TaskApprovalDecision {
    Approve {},
    Deny { reason: Option<String> },
    Answer { answers: Vec<TaskQuestionAnswer> },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TaskQuestionAnswer {
    pub question: String,
    pub answer: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskApprovalInfo {
    pub approval_id: String,
    pub tool_name: String,
    pub execution_process_id: Uuid,
    pub is_question: bool,
    pub created_at: String,
    pub timeout_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
pub struct TaskApprovalList {
    pub job_id: String,
    pub workspace_id: Uuid,
    pub session_id: Uuid,
    pub execution_id: Uuid,
    pub entries: Vec<TaskApprovalInfo>,
}

fn decode_task_execution(
    value: Value,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
    execution_id: Option<Uuid>,
) -> Result<TaskExecution, String> {
    let result: TaskExecution = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.session_id != session_id
        || result
            .business_attempt_id
            .as_deref()
            .is_some_and(|value| !bounded_trace_id(value))
        || execution_id.is_some_and(|id| result.execution_id != id)
        || !matches!(
            result.state.as_str(),
            "running" | "completed" | "failed" | "killed"
        )
        || result.profile != "CODEX:CHAOTANG_SUPERVISED"
        || result.entries.len() > 200
        || result.entries.iter().any(|entry| {
            !matches!(entry.kind.as_str(), "stdout" | "stderr")
                || entry.text.len() > 512 * 1024
                || entry.text.contains('\0')
        })
        || sqlx::types::chrono::DateTime::parse_from_rfc3339(&result.started_at).is_err()
        || result
            .completed_at
            .as_ref()
            .is_some_and(|value| sqlx::types::chrono::DateTime::parse_from_rfc3339(value).is_err())
    {
        return Err(INVALID.into());
    }
    Ok(result)
}

fn decode_task_approvals(
    value: Value,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
    execution_id: Uuid,
) -> Result<TaskApprovalList, String> {
    let result: TaskApprovalList = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.session_id != session_id
        || result.execution_id != execution_id
        || result.entries.len() > 100
        || result.entries.iter().any(|entry| {
            Uuid::parse_str(&entry.approval_id).is_err()
                || entry.execution_process_id != execution_id
                || entry.tool_name.trim().is_empty()
                || entry.tool_name.len() > 1_024
                || sqlx::types::chrono::DateTime::parse_from_rfc3339(&entry.created_at).is_err()
                || sqlx::types::chrono::DateTime::parse_from_rfc3339(&entry.timeout_at).is_err()
        })
    {
        return Err(INVALID.into());
    }
    Ok(result)
}

fn validate_task_approval_decision(value: &TaskApprovalDecision) -> Result<(), String> {
    let valid = match value {
        TaskApprovalDecision::Approve {} => true,
        TaskApprovalDecision::Deny { reason } => {
            reason.as_ref().is_none_or(|value| value.len() <= 1_000)
        }
        TaskApprovalDecision::Answer { answers } => {
            !answers.is_empty()
                && answers.len() <= 20
                && answers.iter().all(|answer| {
                    !answer.question.trim().is_empty()
                        && answer.question.len() <= 4_096
                        && !answer.answer.is_empty()
                        && answer.answer.len() <= 20
                        && answer
                            .answer
                            .iter()
                            .all(|value| !value.trim().is_empty() && value.len() <= 4_096)
                })
        }
    };
    valid
        .then_some(())
        .ok_or_else(|| "OWNER_APPROVAL_REQUEST_INVALID: 审批内容无效".into())
}

fn terminal_dimensions(cols: u16, rows: u16) -> Result<(), String> {
    if (20..=400).contains(&cols) && (5..=200).contains(&rows) {
        Ok(())
    } else {
        Err("TASK_TERMINAL_DIMENSIONS_INVALID: 终端尺寸无效".into())
    }
}

fn decode_task_terminal(
    value: Value,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
) -> Result<TaskTerminal, String> {
    let result: TaskTerminal = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.session_id != session_id
        || !result.active
        || result.next_sequence != 0
    {
        return Err(INVALID.into());
    }
    Ok(result)
}

fn decode_task_terminal_read(
    value: Value,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
    terminal_id: Uuid,
    after_sequence: u64,
) -> Result<TaskTerminalRead, String> {
    let result: TaskTerminalRead = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.session_id != session_id
        || result.terminal_id != terminal_id
        || result.earliest_sequence == 0
        || result.next_sequence < after_sequence
        || result.entries.len() > 256
    {
        return Err(INVALID.into());
    }
    let mut previous = after_sequence;
    let mut total = 0usize;
    for entry in &result.entries {
        if entry.sequence <= previous || entry.sequence > result.next_sequence {
            return Err(INVALID.into());
        }
        let bytes = decode_base64(&entry.data_base64)?;
        total = total.checked_add(bytes.len()).ok_or(INVALID)?;
        if bytes.is_empty() || total > 64 * 1024 {
            return Err(INVALID.into());
        }
        previous = entry.sequence;
    }
    Ok(result)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskFileRead {
    job_id: String,
    workspace_id: Uuid,
    entry: TaskFileEntry,
    sha256: Option<String>,
    #[serde(flatten)]
    content: TaskFileContent,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum TaskFileContent {
    Text {
        text: String,
        encoding: &'static str,
        truncated: bool,
    },
    NotPreviewable {
        reason: String,
    },
}

#[derive(Debug, Deserialize)]
struct ChildTaskFileRead {
    job_id: String,
    workspace_id: Uuid,
    entry: TaskFileEntry,
    sha256: Option<String>,
    #[serde(flatten)]
    content: ChildTaskFileContent,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ChildTaskFileContent {
    Text {
        encoding: String,
        preview_id: Uuid,
        preview_bytes: u64,
        truncated: bool,
    },
    NotPreviewable {
        reason: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PreviewChunk {
    preview_id: Uuid,
    sequence: u32,
    data_base64: String,
    done: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ImportBegin {
    import_id: Uuid,
    chunk_bytes: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ImportProgress {
    import_id: Uuid,
    next_sequence: u32,
    received_bytes: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
struct TaskArtifactSource {
    artifact_id: String,
    sha256: String,
    version: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(
    deny_unknown_fields,
    rename_all(serialize = "camelCase", deserialize = "snake_case")
)]
struct TaskArtifactImport {
    status: String,
    job_id: String,
    workspace_id: Uuid,
    entry: TaskFileEntry,
    sha256: String,
    source: TaskArtifactSource,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ArtifactDescriptor {
    artifact_id: String,
    job_id: String,
    version: u64,
    file_name: String,
    kind: String,
    sha256: String,
    bytes: u64,
    download_path: String,
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn valid_relative_path(value: &str, allow_empty: bool) -> bool {
    if value.is_empty() {
        return allow_empty;
    }
    if value.len() > 1024 {
        return false;
    }
    value.split('/').all(|part| {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        let reserved = matches!(
            stem.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$" | "CONIN$" | "CONOUT$"
        ) || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|suffix| {
                matches!(
                    suffix,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        });
        !part.is_empty()
            && part != "."
            && part != ".."
            && part.len() <= 255
            && !part.ends_with(['.', ' '])
            && !reserved
            && !part.chars().any(|c| {
                c.is_control() || matches!(c, '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*')
            })
    })
}

fn validate_entry(entry: &TaskFileEntry) -> Result<(), String> {
    if !valid_relative_path(&entry.relative_path, false)
        || entry.relative_path.rsplit('/').next() != Some(entry.name.as_str())
        || !matches!(entry.kind.as_str(), "file" | "directory")
        || (entry.kind == "file") != entry.bytes.is_some()
        || entry
            .modified_at
            .as_ref()
            .is_some_and(|value| sqlx::types::chrono::DateTime::parse_from_rfc3339(value).is_err())
    {
        return Err(INVALID.into());
    }
    Ok(())
}

fn decode_task_file_list(
    value: Value,
    job_id: &str,
    workspace_id: Uuid,
    relative_path: &str,
) -> Result<TaskFileList, String> {
    if !valid_relative_path(relative_path, true) {
        return Err(INVALID.into());
    }
    let result: TaskFileList = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.relative_path != relative_path
        || result.entries.len() > 500
    {
        return Err(INVALID.into());
    }
    let mut seen = std::collections::HashSet::new();
    for entry in &result.entries {
        validate_entry(entry)?;
        let parent = entry
            .relative_path
            .rsplit_once('/')
            .map(|(parent, _)| parent)
            .unwrap_or("");
        if parent != relative_path || !seen.insert(entry.relative_path.as_str()) {
            return Err(INVALID.into());
        }
    }
    Ok(result)
}

fn decode_task_session_history(
    value: Value,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
) -> Result<TaskSessionHistory, String> {
    use sqlx::types::chrono::DateTime;

    let result: TaskSessionHistory = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.session_id != session_id
        || result.entries.len() > 200
    {
        return Err(INVALID.into());
    }
    let mut seen = std::collections::HashSet::new();
    for entry in &result.entries {
        let started = DateTime::parse_from_rfc3339(&entry.started_at).map_err(|_| INVALID)?;
        DateTime::parse_from_rfc3339(&entry.created_at).map_err(|_| INVALID)?;
        let completed = entry
            .completed_at
            .as_ref()
            .map(|value| DateTime::parse_from_rfc3339(value).map_err(|_| INVALID))
            .transpose()?;
        if !seen.insert(entry.event_id)
            || !matches!(
                entry.kind.as_str(),
                "setupscript" | "cleanupscript" | "archivescript" | "codingagent" | "devserver"
            )
            || !matches!(
                entry.state.as_str(),
                "running" | "completed" | "failed" | "killed"
            )
            || completed.is_some_and(|value| value < started)
        {
            return Err(INVALID.into());
        }
    }
    Ok(result)
}

fn decode_task_diff(
    value: Value,
    job_id: &str,
    workspace_id: Uuid,
    session_id: Uuid,
) -> Result<TaskDiff, String> {
    let result: TaskDiff = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.session_id != session_id
        || result.entries.len() > 40
        || result.patch.len() > 10 * 1024
        || result.patch.contains('\0')
        || result.branch.as_ref().is_some_and(|value| {
            value.is_empty() || value.len() > 255 || value.chars().any(char::is_control)
        })
        || result.head.as_ref().is_some_and(|value| {
            !matches!(value.len(), 40 | 64)
                || !value
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        })
    {
        return Err(INVALID.into());
    }
    let mut seen = std::collections::HashSet::new();
    for entry in &result.entries {
        if !valid_relative_path(&entry.path, false)
            || entry.path.len() > 256
            || !seen.insert(entry.path.as_str())
            || !matches!(
                entry.change.as_str(),
                "added"
                    | "deleted"
                    | "modified"
                    | "renamed"
                    | "copied"
                    | "type_changed"
                    | "conflicted"
                    | "unreadable"
            )
            || entry.old_path.as_ref().is_some_and(|value| {
                value == &entry.path || value.len() > 256 || !valid_relative_path(value, false)
            })
        {
            return Err(INVALID.into());
        }
    }
    let valid_state = match result.state.as_str() {
        "not_git_repository" => {
            !result.repository
                && result.head.is_none()
                && result.branch.is_none()
                && result.entries.is_empty()
                && result.patch.is_empty()
                && !result.truncated
        }
        "no_baseline" => {
            result.repository
                && result.head.is_none()
                && result.entries.is_empty()
                && result.patch.is_empty()
                && !result.truncated
        }
        "clean" => {
            result.repository
                && result.head.is_some()
                && result.entries.is_empty()
                && result.patch.is_empty()
                && !result.truncated
        }
        "changed" => {
            result.repository
                && result.head.is_some()
                && !result.entries.is_empty()
                && (!result.patch.is_empty() || result.entries.iter().all(|entry| entry.binary))
        }
        _ => false,
    };
    if !valid_state {
        return Err(INVALID.into());
    }
    Ok(result)
}

fn decode_artifact_descriptor(
    value: Value,
    job_id: &str,
    artifact_id: &str,
) -> Result<ArtifactDescriptor, String> {
    let result: ArtifactDescriptor = serde_json::from_value(value).map_err(|_| INVALID)?;
    let expected_path = format!("/api/v1/fusion-artifacts/{artifact_id}/download");
    let extension = match result.kind.as_str() {
        "md" => ".md",
        "docx" => ".docx",
        "xlsx" => ".xlsx",
        _ => return Err(INVALID.into()),
    };
    if result.artifact_id != artifact_id
        || result.job_id != job_id
        || !bounded_id(artifact_id)
        || result.version == 0
        || !(1..=25 * 1024 * 1024).contains(&result.bytes)
        || !valid_hash(&result.sha256)
        || !valid_relative_path(&result.file_name, false)
        || result.file_name.contains('/')
        || !result.file_name.to_ascii_lowercase().ends_with(extension)
        || result.download_path != expected_path
    {
        return Err(INVALID.into());
    }
    Ok(result)
}

fn map_owner_file_error(code: &str) -> &'static str {
    match code {
        "owner_files_unavailable" => "TASK_FILES_UNPROVISIONED",
        "owner_file_not_found" => "TASK_FILE_NOT_FOUND",
        "owner_file_path_invalid" => "TASK_FILE_PATH_INVALID",
        "owner_file_permission_denied" => "TASK_FILE_PERMISSION_DENIED",
        "owner_file_alias" => "TASK_FILE_UNSAFE_ALIAS",
        "owner_file_conflict" => "TASK_FILE_CONFLICT",
        "owner_file_type_invalid" => "TASK_FILE_TYPE_INVALID",
        "owner_file_changed" => "TASK_FILE_CHANGED",
        "owner_file_io_failed" => "TASK_FILE_IO_FAILED",
        "owner_import_busy" => "TASK_ARTIFACT_IMPORT_BUSY",
        "owner_import_metadata_invalid"
        | "owner_import_chunk_invalid"
        | "owner_import_sequence_invalid"
        | "owner_import_size_mismatch"
        | "owner_import_hash_mismatch"
        | "owner_import_not_found" => "TASK_ARTIFACT_IMPORT_FAILED",
        "owner_preview_not_found" | "owner_preview_sequence_invalid" => "TASK_FILE_PREVIEW_INVALID",
        "owner_diff_unavailable" => "TASK_DIFF_UNAVAILABLE",
        "owner_diff_too_large" => "TASK_DIFF_TOO_LARGE",
        _ => "OWNER_RESOURCE_UNAVAILABLE: 隔离资源不存在或未通过校验",
    }
}

fn exact_fields(value: &Value, expected: &[&str]) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == expected.len() && expected.iter().all(|key| object.contains_key(*key))
    })
}

fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 4 != 0 || !value.is_ascii() {
        return Err(INVALID.into());
    }
    let decode = |byte: u8| -> Option<u8> {
        match byte {
            b'A'..=b'Z' => Some(byte - b'A'),
            b'a'..=b'z' => Some(byte - b'a' + 26),
            b'0'..=b'9' => Some(byte - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    };
    let bytes = value.as_bytes();
    let mut result = Vec::with_capacity(value.len() / 4 * 3);
    for (index, chunk) in bytes.chunks_exact(4).enumerate() {
        let last = index + 1 == bytes.len() / 4;
        let padding = match (chunk[2] == b'=', chunk[3] == b'=') {
            (true, true) => 2,
            (false, true) => 1,
            (false, false) => 0,
            (true, false) => return Err(INVALID.into()),
        };
        if padding > 0 && !last {
            return Err(INVALID.into());
        }
        let a = decode(chunk[0]).ok_or(INVALID)? as u32;
        let b = decode(chunk[1]).ok_or(INVALID)? as u32;
        let c = if padding == 2 {
            0
        } else {
            decode(chunk[2]).ok_or(INVALID)? as u32
        };
        let d = if padding > 0 {
            0
        } else {
            decode(chunk[3]).ok_or(INVALID)? as u32
        };
        if (padding == 2 && b & 0x0f != 0) || (padding == 1 && c & 0x03 != 0) {
            return Err(INVALID.into());
        }
        let packed = (a << 18) | (b << 12) | (c << 6) | d;
        result.push((packed >> 16) as u8);
        if padding < 2 {
            result.push((packed >> 8) as u8);
        }
        if padding == 0 {
            result.push(packed as u8);
        }
    }
    Ok(result)
}

fn encode_base64(value: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(value.len().div_ceil(3) * 4);
    for chunk in value.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let packed = (a << 16) | (b << 8) | c;
        result.push(TABLE[((packed >> 18) & 63) as usize] as char);
        result.push(TABLE[((packed >> 12) & 63) as usize] as char);
        result.push(if chunk.len() > 1 {
            TABLE[((packed >> 6) & 63) as usize] as char
        } else {
            '='
        });
        result.push(if chunk.len() > 2 {
            TABLE[(packed & 63) as usize] as char
        } else {
            '='
        });
    }
    result
}

async fn download_artifact(
    auth: &OwnerAuth,
    config: &Configuration,
    descriptor: &ArtifactDescriptor,
    job_id: &str,
) -> Result<Vec<u8>, String> {
    let mut response = auth
        .client
        .get(format!("{}{}", auth.base_url, descriptor.download_path))
        .bearer_auth(&auth.token)
        .header("X-Chaotang-Desktop-Broker-Secret", &config.broker)
        .query(&[("job_id", job_id)])
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| UNAVAILABLE)?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("OWNER_AUTH_EXPIRED: 请重新登录朝堂账户".into());
    }
    if !status.is_success() {
        return Err(format!(
            "TASK_ARTIFACT_DOWNLOAD_HTTP_{}: 成果下载未获服务端确认",
            status.as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length != descriptor.bytes)
    {
        return Err("TASK_ARTIFACT_INTEGRITY_FAILED".into());
    }
    let mut bytes = Vec::with_capacity(descriptor.bytes as usize);
    while let Some(chunk) = response.chunk().await.map_err(|_| UNAVAILABLE)? {
        if bytes.len() + chunk.len() > descriptor.bytes as usize {
            return Err("TASK_ARTIFACT_INTEGRITY_FAILED".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() as u64 != descriptor.bytes
        || format!("{:x}", Sha256::digest(&bytes)) != descriptor.sha256
    {
        return Err("TASK_ARTIFACT_INTEGRITY_FAILED".into());
    }
    Ok(bytes)
}

async fn transfer_artifact(
    child: &mut OwnerChild,
    resources: &DesktopResources,
    descriptor: &ArtifactDescriptor,
    relative_path: &str,
    bytes: &[u8],
) -> Result<TaskArtifactImport, String> {
    let begin_value = child
        .request(json!({
            "op":"begin_import",
            "job_id":resources.job_id,
            "workspace_id":resources.workspace.id,
            "session_id":resources.session.id,
            "artifact_id":descriptor.artifact_id,
            "relative_path":relative_path,
            "bytes":descriptor.bytes,
            "sha256":descriptor.sha256,
            "version":descriptor.version
        }))
        .await?;
    if !exact_fields(&begin_value, &["import_id", "chunk_bytes"]) {
        return Err(INVALID.into());
    }
    let begin: ImportBegin = serde_json::from_value(begin_value).map_err(|_| INVALID)?;
    if begin.chunk_bytes != 20 * 1024 {
        return Err(INVALID.into());
    }
    let outcome = async {
        let mut received = 0u64;
        let mut sequence = 0u32;
        for chunk in bytes.chunks(begin.chunk_bytes) {
            let progress_value = child
                .request(json!({
                    "op":"upload_chunk",
                    "import_id":begin.import_id,
                    "sequence":sequence,
                    "data_base64":encode_base64(chunk)
                }))
                .await?;
            if !exact_fields(
                &progress_value,
                &["import_id", "next_sequence", "received_bytes"],
            ) {
                return Err(INVALID.into());
            }
            let progress: ImportProgress =
                serde_json::from_value(progress_value).map_err(|_| INVALID)?;
            received += chunk.len() as u64;
            sequence = sequence.checked_add(1).ok_or(INVALID)?;
            if progress.import_id != begin.import_id
                || progress.next_sequence != sequence
                || progress.received_bytes != received
            {
                return Err(INVALID.into());
            }
        }
        let finish_value = child
            .request(json!({"op":"finish_import","import_id":begin.import_id}))
            .await?;
        let result: TaskArtifactImport =
            serde_json::from_value(finish_value).map_err(|_| INVALID)?;
        validate_entry(&result.entry)?;
        if !matches!(result.status.as_str(), "imported" | "already_present")
            || result.job_id != resources.job_id
            || result.workspace_id != resources.workspace.id
            || result.entry.relative_path != relative_path
            || result.entry.kind != "file"
            || result.entry.bytes != Some(descriptor.bytes)
            || result.sha256 != descriptor.sha256
            || result.source.artifact_id != descriptor.artifact_id
            || result.source.sha256 != descriptor.sha256
            || result.source.version != descriptor.version
        {
            return Err(INVALID.into());
        }
        Ok(result)
    }
    .await;
    if outcome.is_err() {
        let _ = child
            .request(json!({"op":"abort_import","import_id":begin.import_id}))
            .await;
    }
    outcome
}

async fn decode_task_file_read(
    value: Value,
    child: &mut OwnerChild,
    job_id: &str,
    workspace_id: Uuid,
    relative_path: &str,
) -> Result<TaskFileRead, String> {
    let kind = value.get("kind").and_then(Value::as_str);
    let expected = match kind {
        Some("text") => &[
            "job_id",
            "workspace_id",
            "entry",
            "sha256",
            "kind",
            "encoding",
            "preview_id",
            "preview_bytes",
            "truncated",
        ][..],
        Some("not_previewable") => &[
            "job_id",
            "workspace_id",
            "entry",
            "sha256",
            "kind",
            "reason",
        ][..],
        _ => return Err(INVALID.into()),
    };
    if !exact_fields(&value, expected) || !valid_relative_path(relative_path, false) {
        return Err(INVALID.into());
    }
    let result: ChildTaskFileRead = serde_json::from_value(value).map_err(|_| INVALID)?;
    if result.job_id != job_id
        || result.workspace_id != workspace_id
        || result.entry.relative_path != relative_path
        || result.entry.kind != "file"
        || result.entry.bytes.is_none()
    {
        return Err(INVALID.into());
    }
    validate_entry(&result.entry)?;
    match result.content {
        ChildTaskFileContent::NotPreviewable { reason } => {
            if !matches!(
                reason.as_str(),
                "binary" | "unsupported_encoding" | "too_large"
            ) || (reason == "too_large" && result.sha256.is_some())
                || (reason != "too_large" && !result.sha256.as_deref().is_some_and(valid_hash))
            {
                return Err(INVALID.into());
            }
            Ok(TaskFileRead {
                job_id: result.job_id,
                workspace_id,
                entry: result.entry,
                sha256: result.sha256,
                content: TaskFileContent::NotPreviewable { reason },
            })
        }
        ChildTaskFileContent::Text {
            encoding,
            preview_id,
            preview_bytes,
            truncated,
        } => {
            let hash = result
                .sha256
                .as_deref()
                .filter(|v| valid_hash(v))
                .ok_or(INVALID)?;
            let file_bytes = result.entry.bytes.ok_or(INVALID)?;
            if encoding != "utf-8"
                || preview_bytes > 64 * 1024
                || preview_bytes > file_bytes
                || (truncated && preview_bytes >= file_bytes)
                || (!truncated && preview_bytes != file_bytes)
            {
                return Err(INVALID.into());
            }
            let mut data = Vec::with_capacity(preview_bytes as usize);
            let mut sequence = 0u32;
            loop {
                if sequence > 4 {
                    return Err(INVALID.into());
                }
                let chunk_value = child
                    .request(
                        json!({"op":"read_preview","preview_id":preview_id,"sequence":sequence}),
                    )
                    .await?;
                if !exact_fields(
                    &chunk_value,
                    &["preview_id", "sequence", "data_base64", "done"],
                ) {
                    return Err(INVALID.into());
                }
                let chunk: PreviewChunk =
                    serde_json::from_value(chunk_value).map_err(|_| INVALID)?;
                if chunk.preview_id != preview_id || chunk.sequence != sequence {
                    return Err(INVALID.into());
                }
                let decoded = decode_base64(&chunk.data_base64)?;
                if decoded.len() > 20 * 1024
                    || (!chunk.done && decoded.is_empty())
                    || data.len() + decoded.len() > preview_bytes as usize
                {
                    return Err(INVALID.into());
                }
                data.extend_from_slice(&decoded);
                if chunk.done {
                    break;
                }
                sequence = sequence.checked_add(1).ok_or(INVALID)?;
            }
            if data.len() != preview_bytes as usize
                || (!truncated && format!("{:x}", Sha256::digest(&data)) != hash)
            {
                return Err(INVALID.into());
            }
            let text = String::from_utf8(data).map_err(|_| INVALID)?;
            Ok(TaskFileRead {
                job_id: result.job_id,
                workspace_id,
                entry: result.entry,
                sha256: result.sha256,
                content: TaskFileContent::Text {
                    text,
                    encoding: "utf-8",
                    truncated,
                },
            })
        }
    }
}

fn validate_binding(binding: &DesktopBinding, job: &str, installation: &str) -> Result<(), String> {
    if binding.job_id != job
        || binding.installation_id != installation
        || !bounded_id(&binding.binding_id)
        || binding
            .business_attempt_id
            .as_deref()
            .is_some_and(|value| !bounded_trace_id(value))
        || binding.resource_fingerprint.len() != 64
        || !binding
            .resource_fingerprint
            .bytes()
            .all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(&v))
    {
        return Err(INVALID.into());
    }
    Ok(())
}

async fn backend<T: serde::de::DeserializeOwned>(
    auth: &OwnerAuth,
    config: &Configuration,
    method: reqwest::Method,
    path: &str,
    query: &[(&str, &str)],
    body: Option<Value>,
    idempotency: Option<&str>,
) -> Result<T, String> {
    let mut request = auth
        .client
        .request(method, format!("{}{path}", auth.base_url))
        .bearer_auth(&auth.token)
        .header("X-Chaotang-Desktop-Broker-Secret", &config.broker)
        .query(query)
        .timeout(Duration::from_secs(8));
    if let Some(value) = body {
        request = request.json(&value);
    }
    if let Some(key) = idempotency {
        request = request.header("Idempotency-Key", key);
    }
    let mut response = request.send().await.map_err(|_| UNAVAILABLE)?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("OWNER_AUTH_EXPIRED: 请重新登录朝堂账户".into());
    }
    if !status.is_success() {
        return Err(format!(
            "OWNER_BACKEND_HTTP_{}: 桌面资源请求未获服务端确认",
            status.as_u16()
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| UNAVAILABLE)? {
        if bytes.len() + chunk.len() > 131072 {
            return Err(INVALID.into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| INVALID.into())
}

async fn authorize(
    auth: &OwnerAuth,
    config: &Configuration,
    binding: &DesktopBinding,
) -> Result<(), String> {
    for (kind, id) in [
        ("workspace", binding.workspace_id),
        ("session", binding.session_id),
    ] {
        let id = id.to_string();
        let approved: DesktopBinding = backend(
            auth,
            config,
            reqwest::Method::GET,
            "/api/v1/desktop-bindings/authorize",
            &[
                ("installation_id", &config.installation),
                ("resource_kind", kind),
                ("resource_id", &id),
            ],
            None,
            None,
        )
        .await?;
        if &approved != binding {
            return Err(INVALID.into());
        }
    }
    Ok(())
}

async fn workflow(
    auth: &OwnerAuth,
    job: &str,
    create: bool,
    config: &Configuration,
    child: &mut Option<OwnerChild>,
) -> Result<DesktopResources, String> {
    if !bounded_id(job) {
        return Err(INVALID.into());
    }
    let url = reqwest::Url::parse(&auth.base_url).map_err(|_| UNAVAILABLE)?;
    if !url
        .host_str()
        .and_then(|v| v.trim_matches(['[', ']']).parse::<std::net::IpAddr>().ok())
        .is_some_and(|v| v.is_loopback())
    {
        return Err(UNAVAILABLE.into());
    }
    let user: crate::chaotang_provider::ChaotangUser = backend(
        auth,
        config,
        reqwest::Method::GET,
        "/api/v1/auth/me",
        &[],
        None,
        None,
    )
    .await?;
    if user.id.is_empty() || user.id.len() > 200 {
        return Err(INVALID.into());
    }
    let context: Context = backend(
        auth,
        config,
        reqwest::Method::GET,
        "/api/v1/desktop-bindings/context",
        &[],
        None,
        None,
    )
    .await?;
    if context.protocol != 1
        || context.installation_id != config.installation
        || context.backend_namespace != config.namespace
    {
        return Err("OWNER_NAMESPACE_MISMATCH: 桌面安装与后端身份不一致".into());
    }
    let page: BindingPage = backend(
        auth,
        config,
        reqwest::Method::GET,
        &format!("/api/v1/decree-jobs/{job}/desktop-bindings"),
        &[],
        None,
        None,
    )
    .await?;
    let mut matches = page
        .items
        .into_iter()
        .filter(|v| v.installation_id == config.installation);
    let existing = matches.next();
    if matches.next().is_some() {
        return Err(INVALID.into());
    }
    let intent = if let Some(ref binding) = existing {
        validate_binding(binding, job, &config.installation)?;
        authorize(auth, config, binding).await?;
        None
    } else {
        if !create {
            return Err("OWNER_BINDING_NOT_FOUND".into());
        }
        let key = Uuid::new_v4().to_string();
        let intent: Intent = backend(
            auth,
            config,
            reqwest::Method::POST,
            &format!("/api/v1/decree-jobs/{job}/desktop-binding-intents"),
            &[],
            Some(json!({"installation_id":config.installation,"resource_kind":"workspace"})),
            Some(&key),
        )
        .await?;
        if !bounded_id(&intent.intent_id)
            || intent.job_id != job
            || intent.installation_id != config.installation
            || intent.resource_kind != "workspace"
        {
            return Err(INVALID.into());
        }
        Some(intent)
    };
    let key = owner_key(&context.backend_namespace, &config.installation, &user.id);
    let directory = config.root.join(&key);
    if child
        .as_ref()
        .is_some_and(|owned| owned.directory != directory)
    {
        if let Some(mut owned) = child.take() {
            owned.shutdown().await?;
        }
        return Err(STALE.into());
    }
    if child.is_none() {
        let generation = Uuid::new_v4().to_string();
        let mut owned = OwnerChild::spawn(&directory, &generation).await?;
        owned.bootstrap(json!({"protocol":1,"owner_key":key,"installation_id":config.installation,"generation":generation,"runtime_root":config.root})).await?;
        *child = Some(owned);
    }
    let owned = child.as_mut().expect("spawned child");
    let binding = if let Some(binding) = existing {
        binding
    } else {
        let data: Value = backend(
            auth,
            config,
            reqwest::Method::GET,
            &format!("/api/v1/decree-jobs/{job}"),
            &[],
            None,
            None,
        )
        .await?;
        if data.get("job_id").and_then(Value::as_str) != Some(job) {
            return Err(INVALID.into());
        }
        let title = data
            .get("title")
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty() && v.len() <= 1200)
            .unwrap_or(job);
        let receipt: Receipt = serde_json::from_value(
            owned
                .request(json!({"op":"provision","job_id":job,"title":title}))
                .await?,
        )
        .map_err(|_| INVALID)?;
        if receipt.job_id != job {
            return Err(INVALID.into());
        }
        let intent = intent.expect("new intent");
        let binding:DesktopBinding=backend(auth,config,reqwest::Method::POST,"/api/v1/desktop-bindings/commit",&[],Some(json!({"intent_id":intent.intent_id,"installation_id":config.installation,"workspace_id":receipt.workspace_id,"session_id":receipt.session_id,"resource_fingerprint":receipt.resource_fingerprint})),None).await?;
        validate_binding(&binding, job, &config.installation)?;
        if binding.workspace_id != receipt.workspace_id
            || binding.session_id != receipt.session_id
            || binding.resource_fingerprint != receipt.resource_fingerprint
        {
            return Err(INVALID.into());
        }
        authorize(auth, config, &binding).await?;
        binding
    };
    let actual:ChildResources=serde_json::from_value(owned.request(json!({"op":"read","job_id":job,"workspace_id":binding.workspace_id,"session_id":binding.session_id})).await?).map_err(|_| INVALID)?;
    if !actual.execution_available
        || !actual.terminal_available
        || !actual.preview_available
        || !actual.files_available
        || actual.binding.job_id != job
        || actual.binding.workspace_id != binding.workspace_id
        || actual.binding.session_id != binding.session_id
        || actual.binding.resource_fingerprint != binding.resource_fingerprint
        || actual.workspace.id != binding.workspace_id
        || actual.session.id != binding.session_id
        || actual.session.workspace_id != binding.workspace_id
    {
        return Err(INVALID.into());
    }
    Ok(DesktopResources {
        job_id: job.into(),
        binding,
        workspace: actual.workspace,
        session: actual.session,
        files_available: true,
        execution_available: true,
        terminal_available: true,
        preview_available: true,
    })
}

async fn resource_workflow(
    auth: &OwnerAuth,
    job: &str,
    operation: ResourceOperation,
    config: &Configuration,
    child: &mut Option<OwnerChild>,
) -> Result<Value, String> {
    match &operation {
        ResourceOperation::List { relative_path } => {
            if !valid_relative_path(relative_path, true) {
                return Err("TASK_FILE_PATH_INVALID".into());
            }
        }
        ResourceOperation::Read { relative_path } => {
            if !valid_relative_path(relative_path, false) {
                return Err("TASK_FILE_PATH_INVALID".into());
            }
        }
        ResourceOperation::Import {
            artifact_id,
            relative_path,
        } => {
            if !bounded_id(artifact_id) || !valid_relative_path(relative_path, false) {
                return Err("TASK_FILE_PATH_INVALID".into());
            }
        }
        ResourceOperation::SessionHistory => {}
        ResourceOperation::Diff => {}
        ResourceOperation::StartExecution { prompt } => {
            if prompt.trim().is_empty() || prompt.len() > 65_536 {
                return Err("OWNER_EXECUTION_REQUEST_INVALID: 执行内容不能为空或过长".into());
            }
        }
        ResourceOperation::ReadExecution { .. }
        | ResourceOperation::CancelExecution { .. }
        | ResourceOperation::ReadApprovals { .. } => {}
        ResourceOperation::RespondApproval {
            approval_id,
            response,
            ..
        } => {
            if Uuid::parse_str(approval_id).is_err() {
                return Err("OWNER_APPROVAL_REQUEST_INVALID: 审批编号无效".into());
            }
            validate_task_approval_decision(response)?;
        }
        ResourceOperation::StartTerminal { cols, rows }
        | ResourceOperation::ResizeTerminal { cols, rows, .. } => {
            terminal_dimensions(*cols, *rows)?;
        }
        ResourceOperation::ReadTerminal { .. } | ResourceOperation::CloseTerminal { .. } => {}
        ResourceOperation::WriteTerminal { data_base64, .. } => {
            let data = decode_base64(data_base64)?;
            if data.is_empty() || data.len() > 4 * 1024 {
                return Err("TASK_TERMINAL_INPUT_INVALID: 终端输入无效".into());
            }
        }
    }
    let resources = workflow(auth, job, false, config, child).await?;
    if !resources.files_available {
        return Err("TASK_FILES_UNPROVISIONED".into());
    }
    let owned = child.as_mut().ok_or(UNAVAILABLE)?;
    match operation {
        ResourceOperation::List { relative_path } => {
            let value = owned
                .request(json!({
                    "op":"list_files",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "relative_path":relative_path
                }))
                .await?;
            let result = decode_task_file_list(value, job, resources.workspace.id, &relative_path)?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::Read { relative_path } => {
            let value = owned
                .request(json!({
                    "op":"read_file",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "relative_path":relative_path
                }))
                .await?;
            let result =
                decode_task_file_read(value, owned, job, resources.workspace.id, &relative_path)
                    .await?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::Import {
            artifact_id,
            relative_path,
        } => {
            let descriptor_value: Value = backend(
                auth,
                config,
                reqwest::Method::GET,
                &format!("/api/v1/fusion-artifacts/{artifact_id}/descriptor"),
                &[("job_id", job)],
                None,
                None,
            )
            .await?;
            let descriptor = decode_artifact_descriptor(descriptor_value, job, &artifact_id)?;
            let bytes = download_artifact(auth, config, &descriptor, job).await?;
            let result =
                transfer_artifact(owned, &resources, &descriptor, &relative_path, &bytes).await?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::SessionHistory => {
            let value = owned
                .request(json!({
                    "op":"read_session_history",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id
                }))
                .await?;
            let result = decode_task_session_history(
                value,
                job,
                resources.workspace.id,
                resources.session.id,
            )?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::Diff => {
            let value = owned
                .request(json!({
                    "op":"read_diff",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id
                }))
                .await?;
            let result =
                decode_task_diff(value, job, resources.workspace.id, resources.session.id)?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::StartExecution { prompt } => {
            let value = owned
                .request(json!({
                    "op":"start_execution",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "business_attempt_id":resources.binding.business_attempt_id,
                    "prompt":prompt,
                    "intent":"technical_user"
                }))
                .await?;
            let result = decode_task_execution(
                value,
                job,
                resources.workspace.id,
                resources.session.id,
                None,
            )?;
            if result.business_attempt_id != resources.binding.business_attempt_id {
                return Err(INVALID.into());
            }
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::ReadExecution { execution_id } => {
            let value = owned
                .request(json!({
                    "op":"read_execution",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "execution_id":execution_id
                }))
                .await?;
            let result = decode_task_execution(
                value,
                job,
                resources.workspace.id,
                resources.session.id,
                Some(execution_id),
            )?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::CancelExecution { execution_id } => {
            let value = owned
                .request(json!({
                    "op":"cancel_execution",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "execution_id":execution_id
                }))
                .await?;
            let result = decode_task_execution(
                value,
                job,
                resources.workspace.id,
                resources.session.id,
                Some(execution_id),
            )?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::ReadApprovals { execution_id } => {
            let value = owned
                .request(json!({
                    "op":"read_approvals",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "execution_id":execution_id
                }))
                .await?;
            let result = decode_task_approvals(
                value,
                job,
                resources.workspace.id,
                resources.session.id,
                execution_id,
            )?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::RespondApproval {
            execution_id,
            approval_id,
            response,
        } => {
            let value = owned
                .request(json!({
                    "op":"respond_approval",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "execution_id":execution_id,
                    "approval_id":approval_id,
                    "response":response
                }))
                .await?;
            let workspace_id = resources.workspace.id.to_string();
            let session_id = resources.session.id.to_string();
            let execution_id_text = execution_id.to_string();
            if value.get("job_id").and_then(Value::as_str) != Some(job)
                || value.get("workspace_id").and_then(Value::as_str) != Some(workspace_id.as_str())
                || value.get("session_id").and_then(Value::as_str) != Some(session_id.as_str())
                || value.get("execution_id").and_then(Value::as_str)
                    != Some(execution_id_text.as_str())
                || value.get("approval_id").and_then(Value::as_str) != Some(approval_id.as_str())
            {
                return Err(INVALID.into());
            }
            Ok(value)
        }
        ResourceOperation::StartTerminal { cols, rows } => {
            let value = owned
                .request(json!({
                    "op":"start_terminal",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "cols":cols,
                    "rows":rows
                }))
                .await?;
            let result =
                decode_task_terminal(value, job, resources.workspace.id, resources.session.id)?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::ReadTerminal {
            terminal_id,
            after_sequence,
        } => {
            let value = owned
                .request(json!({
                    "op":"read_terminal",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "terminal_id":terminal_id,
                    "after_sequence":after_sequence
                }))
                .await?;
            let result = decode_task_terminal_read(
                value,
                job,
                resources.workspace.id,
                resources.session.id,
                terminal_id,
                after_sequence,
            )?;
            serde_json::to_value(result).map_err(|_| INVALID.into())
        }
        ResourceOperation::WriteTerminal {
            terminal_id,
            data_base64,
        } => {
            owned
                .request(json!({
                    "op":"write_terminal",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "terminal_id":terminal_id,
                    "data_base64":data_base64
                }))
                .await
        }
        ResourceOperation::ResizeTerminal {
            terminal_id,
            cols,
            rows,
        } => {
            owned
                .request(json!({
                    "op":"resize_terminal",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "terminal_id":terminal_id,
                    "cols":cols,
                    "rows":rows
                }))
                .await
        }
        ResourceOperation::CloseTerminal { terminal_id } => {
            owned
                .request(json!({
                    "op":"close_terminal",
                    "job_id":job,
                    "workspace_id":resources.workspace.id,
                    "session_id":resources.session.id,
                    "terminal_id":terminal_id
                }))
                .await
        }
    }
}

struct OwnerChild {
    process: Child,
    input: Option<ChildStdin>,
    output: BufReader<ChildStdout>,
    generation: String,
    directory: PathBuf,
}
impl OwnerChild {
    async fn spawn(directory: &Path, generation: &str) -> Result<Self, String> {
        let executable = std::env::current_exe().map_err(|_| UNAVAILABLE)?;
        let mut command = Command::new(executable);
        #[cfg(not(test))]
        command.arg("--fusion-owner-runtime");
        #[cfg(test)]
        command.args([
            "--exact",
            "fusion_owner_runtime::tests::owner_stdio_fixture",
            "--nocapture",
            "--quiet",
        ]);
        let mut owned = Self::spawn_command(command, directory, generation)?;
        #[cfg(test)]
        {
            // libtest emits exactly this prelude before the fixture enters the
            // real server::run_stdio. Production accepts no prelude at all.
            let mut line = String::new();
            owned
                .output
                .read_line(&mut line)
                .await
                .map_err(|_| UNAVAILABLE)?;
            if !line.trim().is_empty() {
                return Err(INVALID.into());
            }
            line.clear();
            owned
                .output
                .read_line(&mut line)
                .await
                .map_err(|_| UNAVAILABLE)?;
            if line.trim() != "running 1 test" {
                return Err(INVALID.into());
            }
        }
        Ok(owned)
    }
    fn spawn_command(
        mut command: Command,
        directory: &Path,
        generation: &str,
    ) -> Result<Self, String> {
        command.env_clear();
        // Keep only the ordinary user/runtime variables required by cdesktop's
        // Codex child. Backend bearer tokens and the broker secret are never
        // inherited; the broker secret exists only in the parent process.
        for name in [
            "SystemRoot",
            "WINDIR",
            "TEMP",
            "TMP",
            "PATH",
            "PATHEXT",
            "ComSpec",
            "USERPROFILE",
            "HOMEDRIVE",
            "HOMEPATH",
            "APPDATA",
            "LOCALAPPDATA",
            "PROGRAMDATA",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "CODEX_HOME",
        ] {
            if let Some(value) = std::env::var_os(name) {
                command.env(name, value);
            }
        }
        command
            .env("CDESKTOP_DATA_DIR", directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut process = command.spawn().map_err(|_| UNAVAILABLE)?;
        let input = process.stdin.take().ok_or(UNAVAILABLE)?;
        let output = process.stdout.take().ok_or(UNAVAILABLE)?;
        Ok(Self {
            process,
            input: Some(input),
            output: BufReader::new(output),
            generation: generation.into(),
            directory: directory.to_path_buf(),
        })
    }
    async fn write(&mut self, value: Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(&value).map_err(|_| INVALID)?;
        bytes.push(b'\n');
        if bytes.len() > FRAME_LIMIT as usize {
            return Err(INVALID.into());
        }
        let input = self.input.as_mut().ok_or(UNAVAILABLE)?;
        input.write_all(&bytes).await.map_err(|_| UNAVAILABLE)?;
        input.flush().await.map_err(|_| UNAVAILABLE.into())
    }
    async fn frame(&mut self) -> Result<Value, String> {
        read_protocol_frame(&mut self.output).await
    }
    async fn bootstrap(&mut self, value: Value) -> Result<(), String> {
        self.write(value).await?;
        let ready = self.frame().await?;
        if ready.get("protocol").and_then(Value::as_u64) != Some(1)
            || ready.get("ready") != Some(&Value::Bool(true))
            || ready.get("generation").and_then(Value::as_str) != Some(&self.generation)
        {
            return Err(INVALID.into());
        }
        Ok(())
    }
    async fn request(&mut self, command: Value) -> Result<Value, String> {
        let id = Uuid::new_v4().to_string();
        self.write(json!({"request_id":id,"generation":self.generation,"command":command}))
            .await?;
        let response = self.frame().await?;
        decode_reply(&response, &id, &self.generation)
    }
    async fn shutdown(&mut self) -> Result<(), String> {
        // EOF is the server's normal shutdown signal. Stop has no response ACK.
        self.input.take();
        match timeout(Duration::from_secs(2), self.process.wait()).await {
            Ok(Ok(_)) => Ok(()),
            _ => match timeout(Duration::from_secs(3), self.process.kill()).await {
                Ok(Ok(())) => Ok(()),
                _ => Err("OWNER_CLEANUP_UNCONFIRMED: 桌面子进程停止尚未确认".into()),
            },
        }
    }
}

async fn read_protocol_frame(
    reader: &mut (impl tokio::io::AsyncBufRead + Unpin),
) -> Result<Value, String> {
    let mut frame = String::new();
    let count = reader
        .take(FRAME_LIMIT + 1)
        .read_line(&mut frame)
        .await
        .map_err(|_| INVALID)?;
    if count == 0 || count as u64 > FRAME_LIMIT || !frame.ends_with('\n') {
        return Err(INVALID.into());
    }
    serde_json::from_str(&frame).map_err(|_| INVALID.into())
}
fn decode_reply(response: &Value, id: &str, generation: &str) -> Result<Value, String> {
    if response.get("request_id").and_then(Value::as_str) != Some(id)
        || response.get("generation").and_then(Value::as_str) != Some(generation)
    {
        return Err(INVALID.into());
    }
    if let Some(error) = response.get("error") {
        return Err(error
            .as_str()
            .map(map_owner_file_error)
            .unwrap_or("OWNER_RESOURCE_UNAVAILABLE: 隔离资源不存在或未通过校验")
            .into());
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| INVALID.into())
}

async fn command(
    state: &ChaotangProviderState,
    job_id: &str,
    create: bool,
) -> Result<DesktopResources, String> {
    let config = Configuration::from_environment()?;
    let auth = state.owner_auth().await?;
    let result = state
        .owner_runtime
        .execute(&auth, job_id, create, &config)
        .await;
    if result
        .as_ref()
        .err()
        .is_some_and(|v| v.starts_with("OWNER_AUTH_EXPIRED"))
    {
        state.owner_expired(&auth.token).await;
    }
    state.owner_auth_current(&auth).await?;
    result
}

async fn task_resource_command(
    state: &ChaotangProviderState,
    job_id: &str,
    operation: ResourceOperation,
) -> Result<Value, String> {
    let config = Configuration::from_environment()?;
    let auth = state.owner_auth().await?;
    let result = state
        .owner_runtime
        .execute_resource(&auth, job_id, operation, &config)
        .await;
    if result
        .as_ref()
        .err()
        .is_some_and(|value| value.starts_with("OWNER_AUTH_EXPIRED"))
    {
        state.owner_expired(&auth.token).await;
    }
    state.owner_auth_current(&auth).await?;
    result
}
#[tauri::command]
pub async fn chaotang_link_decree_workspace(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<DesktopResources, String> {
    command(&state, &job_id, true).await
}
#[tauri::command]
pub async fn chaotang_decree_desktop_resources(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<DesktopResources, String> {
    command(&state, &job_id, false).await
}

#[tauri::command]
pub async fn chaotang_list_task_files(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    relative_path: String,
) -> Result<Value, String> {
    task_resource_command(&state, &job_id, ResourceOperation::List { relative_path }).await
}

#[tauri::command]
pub async fn chaotang_read_task_file(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    relative_path: String,
) -> Result<Value, String> {
    task_resource_command(&state, &job_id, ResourceOperation::Read { relative_path }).await
}

#[tauri::command]
pub async fn chaotang_import_task_artifact(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    artifact_id: String,
    relative_path: String,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::Import {
            artifact_id,
            relative_path,
        },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_task_session_history(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<Value, String> {
    task_resource_command(&state, &job_id, ResourceOperation::SessionHistory).await
}

#[tauri::command]
pub async fn chaotang_task_diff(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<Value, String> {
    task_resource_command(&state, &job_id, ResourceOperation::Diff).await
}

#[tauri::command]
pub async fn chaotang_start_task_execution(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    prompt: String,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::StartExecution { prompt },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_read_task_execution(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    execution_id: Uuid,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::ReadExecution { execution_id },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_cancel_task_execution(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    execution_id: Uuid,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::CancelExecution { execution_id },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_task_execution_approvals(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    execution_id: Uuid,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::ReadApprovals { execution_id },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_respond_task_execution_approval(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    execution_id: Uuid,
    approval_id: String,
    response: TaskApprovalDecision,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::RespondApproval {
            execution_id,
            approval_id,
            response,
        },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_start_task_terminal(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    cols: u16,
    rows: u16,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::StartTerminal { cols, rows },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_read_task_terminal(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    terminal_id: Uuid,
    after_sequence: u64,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::ReadTerminal {
            terminal_id,
            after_sequence,
        },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_write_task_terminal(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    terminal_id: Uuid,
    data_base64: String,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::WriteTerminal {
            terminal_id,
            data_base64,
        },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_resize_task_terminal(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    terminal_id: Uuid,
    cols: u16,
    rows: u16,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::ResizeTerminal {
            terminal_id,
            cols,
            rows,
        },
    )
    .await
}

#[tauri::command]
pub async fn chaotang_close_task_terminal(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    terminal_id: Uuid,
) -> Result<Value, String> {
    task_resource_command(
        &state,
        &job_id,
        ResourceOperation::CloseTerminal { terminal_id },
    )
    .await
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        sync::{Arc, atomic::AtomicBool},
    };

    use super::*;

    fn temp_root() -> PathBuf {
        let path = std::env::temp_dir().join(format!("chaotang-owner-wire-{}", Uuid::new_v4()));
        std::fs::create_dir(&path).unwrap();
        path
    }
    fn config(path: &Path) -> Configuration {
        Configuration {
            installation: "test-installation".into(),
            namespace: "test-realm".into(),
            broker: "b".repeat(40),
            root: path.join("owner-runtimes"),
        }
    }
    #[test]
    fn owner_stdio_fixture() {
        if std::env::args().any(|v| v == "--exact") {
            std::process::exit(if server::fusion_owner::run_stdio().is_ok() {
                0
            } else {
                2
            });
        }
    }
    #[test]
    fn unresponsive_child_fixture() {
        if std::env::args().any(|v| v == "--exact") {
            std::thread::sleep(Duration::from_secs(60));
            std::process::exit(0);
        }
    }
    #[test]
    fn namespace_binds_backend_installation_and_authenticated_owner() {
        let a = owner_key("https://backend.test", "install", "owner");
        assert_eq!(a.len(), 64);
        assert_eq!(a, owner_key("https://backend.test", "install", "owner"));
        for value in [
            owner_key("https://other.test", "install", "owner"),
            owner_key("https://backend.test", "other", "owner"),
            owner_key("https://backend.test", "install", "other"),
        ] {
            assert_ne!(a, value);
        }
    }

    #[test]
    fn binding_time_and_public_projection_are_stable() {
        let make = |time: Value| json!({"binding_id":"binding","job_id":"job","installation_id":"install","workspace_id":Uuid::nil(),"session_id":Uuid::nil(),"resource_fingerprint":"a".repeat(64),"business_attempt_id":"attempt-a","created_at":time});
        let iso: DesktopBinding =
            serde_json::from_value(make(json!("2026-09-19T00:00:00+00:00"))).unwrap();
        let seconds = sqlx::types::chrono::DateTime::parse_from_rfc3339(&iso.created_at)
            .unwrap()
            .timestamp();
        let unix: DesktopBinding = serde_json::from_value(make(json!(seconds))).unwrap();
        assert_eq!(iso, unix);
        let public = serde_json::to_value(iso).unwrap();
        assert!(public.get("createdAt").is_some());
        assert_eq!(public["businessAttemptId"], "attempt-a");
        assert!(public.get("created_at").is_none());
        assert!(serde_json::from_value::<DesktopBinding>(make(json!("bad"))).is_err());

        let resource_projection = serde_json::to_value(DesktopResources {
            job_id: "job".into(),
            binding: unix,
            workspace: DesktopWorkspace {
                id: Uuid::nil(),
                name: Some("task".into()),
                branch: "chaotang/job".into(),
                archived: false,
                use_worktree: false,
                created_at: "2026-09-19T00:00:00Z".into(),
                updated_at: "2026-09-19T00:00:00Z".into(),
            },
            session: DesktopSession {
                id: Uuid::nil(),
                workspace_id: Uuid::nil(),
                name: Some("task".into()),
                executor: None,
                created_at: "2026-09-19T00:00:00Z".into(),
                updated_at: "2026-09-19T00:00:00Z".into(),
            },
            files_available: true,
            execution_available: true,
            terminal_available: true,
            preview_available: true,
        })
        .unwrap();
        assert_eq!(resource_projection["filesAvailable"], true);
        assert_eq!(resource_projection["terminalAvailable"], true);
        assert_eq!(resource_projection["previewAvailable"], true);
    }

    #[test]
    fn task_file_list_and_descriptor_contracts_reject_cross_scope_or_untrusted_paths() {
        let workspace = Uuid::new_v4();
        let child = json!({
            "job_id":"job-one",
            "workspace_id":workspace,
            "relative_path":"docs",
            "entries":[
                {"relative_path":"docs/readme.md","name":"readme.md","kind":"file","bytes":3,"modified_at":"2026-09-19T00:00:00Z"},
                {"relative_path":"docs/more","name":"more","kind":"directory","bytes":null,"modified_at":null}
            ],
            "truncated":false
        });
        let public = serde_json::to_value(
            decode_task_file_list(child.clone(), "job-one", workspace, "docs").unwrap(),
        )
        .unwrap();
        assert_eq!(public["jobId"], "job-one");
        assert_eq!(public["workspaceId"], workspace.to_string());
        assert_eq!(public["entries"][0]["relativePath"], "docs/readme.md");
        let mut foreign = child.clone();
        foreign["job_id"] = json!("other");
        assert!(decode_task_file_list(foreign, "job-one", workspace, "docs").is_err());
        let mut nested = child;
        nested["entries"][0]["relative_path"] = json!("docs/sub/readme.md");
        assert!(decode_task_file_list(nested, "job-one", workspace, "docs").is_err());

        let descriptor = json!({
            "artifact_id":"artifact-one",
            "job_id":"job-one",
            "version":2,
            "file_name":"report.md",
            "kind":"md",
            "sha256":"a".repeat(64),
            "bytes":3,
            "download_path":"/api/v1/fusion-artifacts/artifact-one/download"
        });
        assert_eq!(
            decode_artifact_descriptor(descriptor.clone(), "job-one", "artifact-one")
                .unwrap()
                .bytes,
            3
        );
        for (field, value) in [
            ("job_id", json!("other")),
            ("download_path", json!("https://outside.test/file")),
            ("file_name", json!("../report.md")),
            ("sha256", json!("A".repeat(64))),
            ("version", json!(0)),
        ] {
            let mut invalid = descriptor.clone();
            invalid[field] = value;
            assert!(
                decode_artifact_descriptor(invalid, "job-one", "artifact-one").is_err(),
                "accepted invalid {field}"
            );
        }
    }

    #[test]
    fn task_session_history_contract_rejects_cross_scope_and_unknown_states() {
        let workspace = Uuid::new_v4();
        let session = Uuid::new_v4();
        let event = Uuid::new_v4();
        let child = json!({
            "job_id":"job-one",
            "workspace_id":workspace,
            "session_id":session,
            "entries":[{
                "event_id":event,
                "kind":"codingagent",
                "state":"completed",
                "exit_code":0,
                "started_at":"2026-09-20T01:00:00Z",
                "completed_at":"2026-09-20T01:00:02Z",
                "created_at":"2026-09-20T01:00:00Z"
            }],
            "truncated":false
        });
        let decoded =
            decode_task_session_history(child.clone(), "job-one", workspace, session).unwrap();
        assert_eq!(decoded.entries.len(), 1);
        assert_eq!(decoded.entries[0].event_id, event);
        assert_eq!(decoded.entries[0].state, "completed");
        let mut foreign = child.clone();
        foreign["session_id"] = json!(Uuid::new_v4());
        assert!(decode_task_session_history(foreign, "job-one", workspace, session).is_err());
        let mut invented = child;
        invented["entries"][0]["state"] = json!("successful");
        assert!(decode_task_session_history(invented, "job-one", workspace, session).is_err());
    }

    #[test]
    fn task_diff_contract_rejects_cross_scope_invented_states_and_fake_clean_results() {
        let workspace = Uuid::new_v4();
        let session = Uuid::new_v4();
        let child = json!({
            "job_id":"job-one",
            "workspace_id":workspace,
            "session_id":session,
            "state":"changed",
            "repository":true,
            "head":"a".repeat(40),
            "branch":"main",
            "entries":[{
                "path":"src/main.rs",
                "old_path":null,
                "change":"modified",
                "binary":false
            }],
            "patch":"diff --git a/src/main.rs b/src/main.rs\n-old\n+new\n",
            "truncated":false
        });
        let decoded = decode_task_diff(child.clone(), "job-one", workspace, session).unwrap();
        assert_eq!(decoded.entries.len(), 1);
        assert_eq!(decoded.entries[0].path, "src/main.rs");
        assert_eq!(decoded.state, "changed");
        let mut foreign = child.clone();
        foreign["session_id"] = json!(Uuid::new_v4());
        assert!(decode_task_diff(foreign, "job-one", workspace, session).is_err());
        let mut invented = child.clone();
        invented["entries"][0]["change"] = json!("rewritten");
        assert!(decode_task_diff(invented, "job-one", workspace, session).is_err());
        let mut fake_clean = child;
        fake_clean["state"] = json!("clean");
        assert!(decode_task_diff(fake_clean, "job-one", workspace, session).is_err());
    }

    #[test]
    fn child_file_errors_are_mapped_by_exact_code_only() {
        assert_eq!(
            map_owner_file_error("owner_files_unavailable"),
            "TASK_FILES_UNPROVISIONED"
        );
        assert_eq!(
            map_owner_file_error("owner_file_not_found"),
            "TASK_FILE_NOT_FOUND"
        );
        assert_eq!(
            map_owner_file_error("owner_file_conflict"),
            "TASK_FILE_CONFLICT"
        );
        assert_eq!(
            map_owner_file_error("prefix owner_file_not_found"),
            "OWNER_RESOURCE_UNAVAILABLE: 隔离资源不存在或未通过校验"
        );
        assert_eq!(
            map_owner_file_error("internal-secret-value"),
            "OWNER_RESOURCE_UNAVAILABLE: 隔离资源不存在或未通过校验"
        );
    }
    #[tokio::test]
    async fn frames_and_reply_identity_reject_cross_generation_and_truncation() {
        let good = json!({"request_id":"request","generation":"generation","result":{"ok":true}});
        assert_eq!(
            decode_reply(&good, "request", "generation").unwrap(),
            json!({"ok":true})
        );
        assert!(decode_reply(&good, "other", "generation").is_err());
        assert!(decode_reply(&good, "request", "old").is_err());
        assert!(
            decode_reply(
                &json!({"request_id":"request","result":{}}),
                "request",
                "generation"
            )
            .is_err()
        );
        let error=decode_reply(&json!({"request_id":"request","generation":"generation","error":"secret-internal-body"}),"request","generation").unwrap_err();
        assert!(!error.contains("secret"));
        for bytes in [
            Vec::new(),
            b"{}".to_vec(),
            format!("{}\n", "x".repeat(FRAME_LIMIT as usize)).into_bytes(),
            b"\xff\n".to_vec(),
        ] {
            assert!(
                read_protocol_frame(&mut BufReader::new(bytes.as_slice()))
                    .await
                    .is_err()
            );
        }
        assert_eq!(
            read_protocol_frame(&mut BufReader::new(b"{}\n".as_slice()))
                .await
                .unwrap(),
            json!({})
        );
    }
    #[test]
    fn configuration_requires_native_absolute_bounded_files() {
        let path = temp_root();
        let secret = path.join("broker.txt");
        std::fs::write(&secret, "b".repeat(40)).unwrap();
        assert!(Configuration::load("install".into(), "realm".into(), &secret, &path).is_ok());
        assert!(
            Configuration::load(
                "install".into(),
                "realm".into(),
                Path::new("broker.txt"),
                &path
            )
            .is_err()
        );
        assert!(Configuration::load("../other".into(), "realm".into(), &secret, &path).is_err());
        std::fs::write(&secret, "b".repeat(5000)).unwrap();
        assert!(Configuration::load("install".into(), "realm".into(), &secret, &path).is_err());
        std::fs::remove_dir_all(path).unwrap();
    }

    fn request(stream: &mut TcpStream) -> (String, Value, String) {
        // Accepted Windows sockets can inherit the listener's nonblocking mode.
        // Keep accept cancellable but make this bounded fixture request blocking.
        stream.set_nonblocking(false).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut raw = Vec::new();
        let mut part = [0u8; 4096];
        let header_end = loop {
            let count = stream.read(&mut part).unwrap();
            assert!(count > 0);
            raw.extend_from_slice(&part[..count]);
            if let Some(end) = raw.windows(4).position(|v| v == b"\r\n\r\n") {
                break end + 4;
            }
            assert!(raw.len() < 16384);
        };
        let headers = String::from_utf8(raw[..header_end].to_vec()).unwrap();
        let length = headers
            .lines()
            .find_map(|l| {
                l.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .map(|v| v.trim().parse::<usize>().unwrap())
            })
            .unwrap_or(0);
        while raw.len() < header_end + length {
            let count = stream.read(&mut part).unwrap();
            assert!(count > 0);
            raw.extend_from_slice(&part[..count]);
        }
        let body = if length > 0 {
            serde_json::from_slice(&raw[header_end..header_end + length]).unwrap()
        } else {
            Value::Null
        };
        (
            headers
                .lines()
                .next()
                .unwrap()
                .split_whitespace()
                .nth(1)
                .unwrap()
                .into(),
            body,
            headers,
        )
    }
    struct BackendFixture {
        base: String,
        stop: Arc<AtomicBool>,
        thread: Option<std::thread::JoinHandle<()>>,
        binding: Arc<Mutex<Option<Value>>>,
        receipts: Arc<Mutex<Vec<Value>>>,
        calls: Arc<Mutex<Vec<String>>>,
        job_seen: Arc<AtomicBool>,
    }
    impl BackendFixture {
        fn new(fail_first_commit: bool, wrong_namespace: bool) -> Self {
            Self::options(fail_first_commit, wrong_namespace, false)
        }
        fn options(fail_first_commit: bool, wrong_namespace: bool, hold_job: bool) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let stop = Arc::new(AtomicBool::new(false));
            let binding = Arc::new(Mutex::new(None));
            let receipts = Arc::new(Mutex::new(Vec::new()));
            let calls = Arc::new(Mutex::new(Vec::new()));
            let (halt, stored, seen, paths) = (
                stop.clone(),
                binding.clone(),
                receipts.clone(),
                calls.clone(),
            );
            let job_seen = Arc::new(AtomicBool::new(false));
            let observed_job = job_seen.clone();
            let thread = std::thread::spawn(move || {
                while !halt.load(Ordering::SeqCst) {
                    let (mut stream, _) = match listener.accept() {
                        Ok(v) => v,
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(Duration::from_millis(5));
                            continue;
                        }
                        Err(e) => panic!("{e}"),
                    };
                    let (path, body, headers) = request(&mut stream);
                    paths.lock().unwrap().push(path.clone());
                    assert!(
                        headers
                            .to_ascii_lowercase()
                            .contains("authorization: bearer session-a")
                    );
                    assert!(headers.to_ascii_lowercase().contains(&format!(
                        "x-chaotang-desktop-broker-secret: {}",
                        "b".repeat(40)
                    )));
                    let mut status = 200;
                    let artifact_bytes = b"trusted artifact bytes";
                    let download =
                        path == "/api/v1/fusion-artifacts/artifact-one/download?job_id=job-one";
                    let value = if path == "/api/v1/auth/me" {
                        json!({"id":"owner-a","username":"a","email":"a@example.test"})
                    } else if path == "/api/v1/desktop-bindings/context" {
                        json!({"protocol":1,"installation_id":"test-installation","backend_namespace":if wrong_namespace{"other-realm"}else{"test-realm"}})
                    } else if path.ends_with("/desktop-bindings") {
                        json!({"items":stored.lock().unwrap().clone().into_iter().collect::<Vec<Value>>()})
                    } else if path.ends_with("/desktop-binding-intents") {
                        json!({"intent_id":"intent","job_id":"job-one","installation_id":"test-installation","resource_kind":"workspace"})
                    } else if path == "/api/v1/decree-jobs/job-one" {
                        observed_job.store(true, Ordering::SeqCst);
                        while hold_job && !halt.load(Ordering::SeqCst) {
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        json!({"job_id":"job-one","title":"Real owned task"})
                    } else if path == "/api/v1/desktop-bindings/commit" {
                        let mut rows = seen.lock().unwrap();
                        rows.push(body.clone());
                        if fail_first_commit && rows.len() == 1 {
                            status = 503;
                            json!({"detail":"unavailable"})
                        } else {
                            let value = json!({"binding_id":"binding-one","job_id":"job-one","installation_id":"test-installation","workspace_id":body["workspace_id"],"session_id":body["session_id"],"resource_fingerprint":body["resource_fingerprint"],"business_attempt_id":"attempt-a","created_at":"2026-09-19T00:00:00Z"});
                            *stored.lock().unwrap() = Some(value.clone());
                            value
                        }
                    } else if path.starts_with("/api/v1/desktop-bindings/authorize?") {
                        stored.lock().unwrap().clone().unwrap()
                    } else if path
                        == "/api/v1/fusion-artifacts/artifact-one/descriptor?job_id=job-one"
                    {
                        json!({
                            "artifact_id":"artifact-one",
                            "job_id":"job-one",
                            "version":2,
                            "file_name":"report.md",
                            "kind":"md",
                            "sha256":format!("{:x}",Sha256::digest(artifact_bytes)),
                            "bytes":artifact_bytes.len(),
                            "download_path":"/api/v1/fusion-artifacts/artifact-one/download"
                        })
                    } else if download {
                        Value::Null
                    } else {
                        panic!("Unexpected mock path {path}")
                    };
                    let body = if download {
                        artifact_bytes.to_vec()
                    } else {
                        serde_json::to_vec(&value).unwrap()
                    };
                    let header = format!(
                        "HTTP/1.1 {status} OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        if download {
                            "application/octet-stream"
                        } else {
                            "application/json"
                        },
                        body.len()
                    );
                    let _ = stream.write_all(header.as_bytes());
                    let _ = stream.write_all(&body);
                }
            });
            Self {
                base,
                stop,
                thread: Some(thread),
                binding,
                receipts,
                calls,
                job_seen,
            }
        }
        fn auth(&self) -> OwnerAuth {
            OwnerAuth {
                client: reqwest::Client::builder()
                    .no_proxy()
                    .redirect(reqwest::redirect::Policy::none())
                    .build()
                    .unwrap(),
                base_url: self.base.clone(),
                token: "session-a".into(),
                epoch: 0,
            }
        }
    }
    impl Drop for BackendFixture {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::SeqCst);
            let result = self.thread.take().unwrap().join();
            if result.is_err() && !std::thread::panicking() {
                panic!("Local backend fixture failed");
            }
        }
    }

    #[tokio::test]
    async fn link_commit_failure_preserves_resources_then_authorized_read_recovers() {
        let path = temp_root();
        let config = config(&path);
        let backend = BackendFixture::new(true, false);
        let auth = backend.auth();
        let manager = OwnerRuntime::default();
        let first = manager
            .execute(&auth, "job-one", true, &config)
            .await
            .unwrap_err();
        assert!(first.starts_with("OWNER_BACKEND_HTTP_503"), "{first}");
        let linked = manager
            .execute(&auth, "job-one", true, &config)
            .await
            .unwrap();
        let loaded = manager
            .execute(&auth, "job-one", false, &config)
            .await
            .unwrap();
        assert_eq!(linked.binding, loaded.binding);
        assert_eq!(loaded.workspace.name.as_deref(), Some("Real owned task"));
        assert_eq!(loaded.session.workspace_id, loaded.workspace.id);
        assert!(loaded.execution_available);
        assert!(loaded.terminal_available);
        assert!(loaded.preview_available);
        let receipts = backend.receipts.lock().unwrap();
        assert_eq!(receipts.len(), 2);
        for key in ["workspace_id", "session_id", "resource_fingerprint"] {
            assert_eq!(receipts[0][key], receipts[1][key]);
        }
        assert!(backend.binding.lock().unwrap().is_some());
        assert_eq!(
            backend
                .calls
                .lock()
                .unwrap()
                .iter()
                .filter(|v| v.starts_with("/api/v1/desktop-bindings/authorize?"))
                .count(),
            4
        );
        let new_port = BackendFixture::new(false, false);
        *new_port.binding.lock().unwrap() = backend.binding.lock().unwrap().clone();
        assert_ne!(new_port.base, backend.base);
        let restored = manager
            .execute(&new_port.auth(), "job-one", false, &config)
            .await
            .unwrap();
        assert_eq!(restored.workspace.id, loaded.workspace.id);
        assert_eq!(restored.session.id, loaded.session.id);
        assert!(new_port.receipts.lock().unwrap().is_empty());
        drop(new_port);
        drop(receipts);
        drop(backend);
        manager.revoke(1).await;
        std::fs::remove_dir_all(path).unwrap();
    }

    #[tokio::test]
    async fn owner_child_is_reused_until_the_authenticated_generation_is_revoked() {
        let path = temp_root();
        let settings = config(&path);
        let backend = BackendFixture::new(false, false);
        let auth = backend.auth();
        let manager = OwnerRuntime::default();
        manager
            .execute(&auth, "job-one", true, &settings)
            .await
            .unwrap();
        let first_pid = manager
            .child
            .lock()
            .await
            .as_ref()
            .and_then(|child| child.process.id())
            .expect("resident owner child");
        manager
            .execute(&auth, "job-one", false, &settings)
            .await
            .unwrap();
        let second_pid = manager
            .child
            .lock()
            .await
            .as_ref()
            .and_then(|child| child.process.id())
            .expect("same resident owner child");
        assert_eq!(first_pid, second_pid);
        manager.revoke(1).await;
        assert!(manager.child.lock().await.is_none());
        drop(backend);
        std::fs::remove_dir_all(path).unwrap();
    }

    #[tokio::test]
    async fn authorized_file_list_and_preview_use_the_bound_owner_workspace() {
        let path = temp_root();
        let settings = config(&path);
        let backend = BackendFixture::new(false, false);
        let auth = backend.auth();
        let manager = OwnerRuntime::default();
        let linked = manager
            .execute(&auth, "job-one", true, &settings)
            .await
            .unwrap();
        let root = settings
            .root
            .join(owner_key("test-realm", "test-installation", "owner-a"))
            .join("task-files")
            .join(linked.workspace.id.to_string());
        std::fs::write(root.join("report.txt"), b"real task file").unwrap();

        let listed = manager
            .execute_resource(
                &auth,
                "job-one",
                ResourceOperation::List {
                    relative_path: String::new(),
                },
                &settings,
            )
            .await
            .unwrap();
        assert_eq!(listed["jobId"], "job-one");
        assert_eq!(listed["workspaceId"], linked.workspace.id.to_string());
        assert_eq!(listed["entries"][0]["relativePath"], "report.txt");

        let read = manager
            .execute_resource(
                &auth,
                "job-one",
                ResourceOperation::Read {
                    relative_path: "report.txt".into(),
                },
                &settings,
            )
            .await
            .unwrap();
        assert_eq!(read["jobId"], "job-one");
        assert_eq!(read["workspaceId"], linked.workspace.id.to_string());
        assert_eq!(read["kind"], "text");
        assert_eq!(read["text"], "real task file");
        assert_eq!(read["truncated"], false);
        assert_eq!(
            read["sha256"],
            format!("{:x}", Sha256::digest(b"real task file"))
        );
        drop(backend);
        manager.revoke(1).await;
        std::fs::remove_dir_all(path).unwrap();
    }

    #[tokio::test]
    async fn published_artifact_import_is_verified_chunked_and_idempotent() {
        let path = temp_root();
        let settings = config(&path);
        let backend = BackendFixture::new(false, false);
        let auth = backend.auth();
        let manager = OwnerRuntime::default();
        let linked = manager
            .execute(&auth, "job-one", true, &settings)
            .await
            .unwrap();
        for expected in ["imported", "already_present"] {
            let imported = manager
                .execute_resource(
                    &auth,
                    "job-one",
                    ResourceOperation::Import {
                        artifact_id: "artifact-one".into(),
                        relative_path: "report.md".into(),
                    },
                    &settings,
                )
                .await
                .unwrap();
            assert_eq!(imported["status"], expected);
            assert_eq!(imported["jobId"], "job-one");
            assert_eq!(imported["workspaceId"], linked.workspace.id.to_string());
            assert_eq!(imported["entry"]["relativePath"], "report.md");
            assert_eq!(imported["source"]["artifactId"], "artifact-one");
            assert_eq!(imported["source"]["version"], 2);
        }
        let file = settings
            .root
            .join(owner_key("test-realm", "test-installation", "owner-a"))
            .join("task-files")
            .join(linked.workspace.id.to_string())
            .join("report.md");
        assert_eq!(std::fs::read(file).unwrap(), b"trusted artifact bytes");
        let calls = backend.calls.lock().unwrap();
        assert_eq!(
            calls
                .iter()
                .filter(|path| path.contains("/descriptor?job_id=job-one"))
                .count(),
            2
        );
        assert_eq!(
            calls
                .iter()
                .filter(|path| path.contains("/download?job_id=job-one"))
                .count(),
            2
        );
        drop(calls);
        drop(backend);
        manager.revoke(1).await;
        std::fs::remove_dir_all(path).unwrap();
    }
    #[tokio::test]
    async fn namespace_mismatch_and_unbound_read_never_start_owner_directory() {
        let path = temp_root();
        let config = config(&path);
        let manager = OwnerRuntime::default();
        let backend = BackendFixture::new(false, true);
        assert!(
            manager
                .execute(&backend.auth(), "job-one", true, &config)
                .await
                .unwrap_err()
                .starts_with("OWNER_NAMESPACE_MISMATCH")
        );
        assert!(!config.root.exists());
        drop(backend);
        let backend = BackendFixture::new(false, false);
        assert!(
            manager
                .execute(&backend.auth(), "job-one", false, &config)
                .await
                .unwrap_err()
                .starts_with("OWNER_BINDING_NOT_FOUND")
        );
        assert!(!config.root.exists());
        drop(backend);
        std::fs::remove_dir_all(path).unwrap();
    }
    #[tokio::test]
    async fn revoked_epoch_cannot_start_a_stale_request() {
        let path = temp_root();
        let config = config(&path);
        let manager = OwnerRuntime::default();
        let backend = BackendFixture::new(false, false);
        manager.revoke(1).await;
        assert!(
            manager
                .execute(&backend.auth(), "job-one", true, &config)
                .await
                .unwrap_err()
                .starts_with("OWNER_SESSION_CHANGED")
        );
        assert!(backend.calls.lock().unwrap().is_empty());
        assert!(!config.root.exists());
        drop(backend);
        std::fs::remove_dir_all(path).unwrap();
    }
    #[tokio::test]
    async fn revoke_cancels_inflight_work_and_waits_for_owned_child_exit() {
        let path = temp_root();
        let settings = config(&path);
        let root = settings.root.clone();
        let manager = Arc::new(OwnerRuntime::default());
        let backend = BackendFixture::options(false, false, true);
        let auth = backend.auth();
        let active = manager.clone();
        let task =
            tokio::spawn(async move { active.execute(&auth, "job-one", true, &settings).await });
        timeout(Duration::from_secs(10), async {
            while !backend.job_seen.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert!(
            root.join(owner_key("test-realm", "test-installation", "owner-a"))
                .join("db.v2.sqlite")
                .exists()
        );
        timeout(Duration::from_secs(7), manager.revoke(1))
            .await
            .unwrap();
        assert!(
            task.await
                .unwrap()
                .unwrap_err()
                .starts_with("OWNER_SESSION_CHANGED")
        );
        drop(backend);
        // Windows refuses removal if the child still holds its SQLite database.
        std::fs::remove_dir_all(path).unwrap();
    }
    #[tokio::test]
    async fn shutdown_kills_and_waits_when_child_ignores_eof() {
        let path = temp_root();
        let mut command = Command::new(std::env::current_exe().unwrap());
        command.args([
            "--exact",
            "fusion_owner_runtime::tests::unresponsive_child_fixture",
            "--nocapture",
            "--quiet",
        ]);
        let mut child = OwnerChild::spawn_command(command, &path, "generation").unwrap();
        child.shutdown().await.unwrap();
        assert!(child.process.try_wait().unwrap().is_some());
        std::fs::remove_dir_all(path).unwrap();
    }
}
