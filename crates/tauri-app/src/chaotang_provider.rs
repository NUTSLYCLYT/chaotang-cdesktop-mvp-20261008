use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use serde::{Deserialize, Serialize};

fn candidate_identity(value: &str) -> bool {
    (8..=128).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CandidateAction {
    Approve,
    Reject,
    Enable,
    CheckHealth,
    Degrade,
    Rollback,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CandidateCommand {
    action: CandidateAction,
    expected_revision: u32,
    idempotency_key: String,
    snapshot_digest: String,
    evaluation_digest: String,
    reason: String,
}
impl CandidateCommand {
    fn validate(&self) -> Result<(), String> {
        let digest = |v: &str| {
            v.len() == 71
                && v.starts_with("sha256:")
                && v.as_bytes()[7..]
                    .iter()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
        };
        if self.expected_revision > 1000
            || !candidate_identity(&self.idempotency_key)
            || !digest(&self.snapshot_digest)
            || !digest(&self.evaluation_digest)
            || self.reason.trim().is_empty()
            || self.reason.chars().count() > 2000
        {
            return Err("候选账操作参数无效".into());
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuntimeRehearsalAction {
    Start,
    Probe,
    RunDepartment,
    SwitchLocalBinding,
    Degrade,
    Rollback,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeRehearsalCommand {
    action: RuntimeRehearsalAction,
    expected_revision: u32,
    idempotency_key: String,
    candidate_event_digest: String,
    reason: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OutcomeValue {
    Achieved,
    Partial,
    NotAchieved,
    Observing,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct OutcomeCreateCommand {
    outcome: OutcomeValue,
    occurred_at: String,
    idempotency_key: String,
    supersedes_event_id: Option<String>,
}

impl OutcomeCreateCommand {
    fn validate(&self) -> Result<(), String> {
        let correction = self.supersedes_event_id.as_deref();
        if !candidate_identity(&self.idempotency_key)
            || self.occurred_at.trim() != self.occurred_at
            || self.occurred_at.len() > 64
            || sqlx::types::chrono::DateTime::parse_from_rfc3339(&self.occurred_at).is_err()
            || correction.is_some_and(|value| {
                value.len() != 32
                    || !value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
        {
            return Err("Outcome 写入参数无效".into());
        }
        Ok(())
    }
}

impl RuntimeRehearsalCommand {
    fn validate(&self) -> Result<(), String> {
        let digest = |value: &str| {
            value.len() == 71
                && value.starts_with("sha256:")
                && value.as_bytes()[7..]
                    .iter()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
        };
        if self.expected_revision > 100
            || !candidate_identity(&self.idempotency_key)
            || !digest(&self.candidate_event_digest)
            || self.reason.trim().is_empty()
            || self.reason.chars().count() > 2000
        {
            return Err("候选进程演练参数无效".into());
        }
        Ok(())
    }
}

const DEFAULT_BASE_URL: &str = "https://app.mingshuoxny.com";

fn safe_opaque_id<'a>(value: &'a str, label: &str) -> Result<&'a str, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 128
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(format!("{label}格式无效"));
    }
    Ok(value)
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DecreeWorkspace {
    pub job_id: String,
    pub artifacts: Vec<WorkspaceArtifact>,
    pub agents_available: bool,
    pub agents: Vec<WorkspaceAgent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<WorkspaceTool>>,
    pub sources: Vec<WorkspaceSource>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct FusionCapabilities {
    pub execution: FusionExecution,
    pub network_enabled: bool,
    pub registry_status: String,
    pub connectors: Vec<FusionConnector>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct FusionExecution {
    pub mode: String,
    pub node_available: bool,
    pub host_available: bool,
    pub availability_scope: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct FusionConnector {
    pub id: String,
    pub enabled: bool,
    pub credential_status: String,
    pub approval_revision: String,
    pub approved_tools: Vec<FusionApprovedTool>,
    pub probe_status: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct FusionApprovedTool {
    pub id: String,
    pub enabled: bool,
    pub approval_revision: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct WorkspaceTool {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub state: String,
    pub sequence: u64,
    #[serde(default)]
    pub state_reason: Option<String>,
}

fn public_service_error(body: &serde_json::Value) -> Option<&'static str> {
    [
        body.get("reason"),
        body.get("code"),
        body.pointer("/detail/reason"),
        body.pointer("/detail/code"),
    ]
    .into_iter()
    .flatten()
    .filter_map(|value| value.as_str())
    .find_map(|code| match code {
        "config_unavailable" => Some("模型配置不可用，请检查服务配置"),
        "model_unavailable" => Some("模型服务未能返回有效结果，请检查服务后再重试"),
        "provider_budget_exceeded" => Some("模型请求预算已用完，请调整预算后再继续"),
        "job_not_found" => Some("任务不存在或当前账户无权查看"),
        "job_history_archive_rejected" => Some("仅已结束的任务可以归档或恢复"),
        "job_unavailable" => Some("任务服务暂时不可用，请稍后查看任务记录"),
        "validation_failed" => Some("提交内容未通过校验，请检查目标与资料"),
        _ => None,
    })
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct WorkspaceArtifact {
    pub id: String,
    pub display_name: String,
    pub kind: String,
    pub state: String,
    pub download_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<u64>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct WorkspaceAgent {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub role: String,
    pub state: String,
    pub task_summary: String,
    #[serde(default)]
    pub state_reason: Option<String>,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct WorkspaceSource {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub content: Option<String>,
    pub url: Option<String>,
    pub download_path: Option<String>,
}

fn safe_workspace_download_path(path: &str) -> Result<&str, String> {
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() != 6
        || parts[0] != ""
        || parts[1] != "api"
        || parts[2] != "v1"
        || !matches!(parts[3], "report-artifacts" | "fusion-artifacts")
        || parts[5] != "download"
        || safe_opaque_id(parts[4], "成果编号")? != parts[4]
    {
        return Err("成果下载路径无效".to_string());
    }
    Ok(path)
}

fn artifact_for_save<'a>(
    workspace: &'a DecreeWorkspace,
    job_id: &str,
    artifact_id: &str,
) -> Result<&'a WorkspaceArtifact, String> {
    safe_opaque_id(job_id, "任务编号")?;
    safe_opaque_id(artifact_id, "成果编号")?;
    if workspace.job_id != job_id {
        return Err("成果任务关联无效".into());
    }
    let artifact = workspace
        .artifacts
        .iter()
        .find(|a| a.id == artifact_id)
        .ok_or("当前任务没有此成果，或当前账户无权保存")?;
    if !artifact.state.eq_ignore_ascii_case("published") {
        return Err("成果尚未发布".into());
    }
    crate::artifact_save::safe_filename(&artifact.display_name)?;
    let path =
        safe_workspace_download_path(artifact.download_path.as_deref().ok_or("成果下载不可用")?)?;
    if path.split('/').nth(4) != Some(artifact_id) {
        return Err("成果下载关联无效".into());
    }
    let hash = artifact
        .sha256
        .as_deref()
        .ok_or("成果缺少服务端 SHA-256，无法安全保存")?;
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("成果 SHA-256 格式无效".into());
    }
    Ok(artifact)
}

#[derive(Clone)]
pub struct ChaotangProviderState {
    client: reqwest::Client,
    base_url: String,
    session_id: Arc<tokio::sync::RwLock<Option<String>>>,
    session_store: crate::session_store::SessionStore,
    auth_generation: Arc<AtomicU64>,
    pub(crate) owner_runtime: Arc<crate::fusion_owner_runtime::OwnerRuntime>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChaotangHealth {
    pub status: String,
    pub service: String,
    pub version: String,
    pub base_url: String,
}

#[derive(Debug, Deserialize)]
struct BackendHealth {
    status: String,
    service: String,
    version: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChaotangUser {
    pub id: String,
    pub username: String,
    pub email: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DadianDepartmentCount {
    pub department: String,
    pub count: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DadianRecentReply {
    pub id: String,
    pub title: String,
    pub participating_departments: Vec<String>,
    pub reply_conclusion: String,
    pub reply_time: String,
    pub created_at: String,
    pub respondent: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DadianOverview {
    pub reply_count: u64,
    pub department_counts: Vec<DadianDepartmentCount>,
    pub recent_replies: Vec<DadianRecentReply>,
    pub pending_review_count: u64,
    pub today_focus: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChaotangReadiness {
    pub ready: bool,
    pub codes: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct BackendReadiness {
    codes: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DailyMemorialDraft {
    pub id: String,
    pub report_date: String,
    pub source_window_start: String,
    pub source_window_end: String,
    pub version: u64,
    pub fingerprint: String,
    pub bureau_result_count: u64,
    pub ministry_result_count: u64,
    pub content: String,
    pub fact_refs: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DailyMemorialLatest {
    pub status: String,
    pub draft: Option<DailyMemorialDraft>,
    pub memorial_id: Option<String>,
    pub failure_code: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "snake_case", deserialize = "camelCase"))]
pub struct ConfirmDailyMemorialInput {
    pub draft_id: String,
    pub version: u64,
    pub fingerprint: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ConfirmDailyMemorialResponse {
    pub status: String,
    pub draft_id: String,
    pub memorial_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DecreeJobError {
    pub code: String,
    pub stage: String,
    pub category: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DecreeJob {
    pub job_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub decree_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub draft_fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_attempt_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_of_job_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_draft: Option<ChancellorDraftResponse>,
    pub state: String,
    pub stage: String,
    pub attempt_count: u64,
    pub provider_request_count: u64,
    pub cancel_requested: bool,
    pub result: Option<HashMap<String, serde_json::Value>>,
    pub error: Option<DecreeJobError>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DecreeJobPage {
    pub items: Vec<DecreeJob>,
    pub total: u64,
    pub limit: u64,
    #[serde(default)]
    pub offset: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DecreeJobListInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<DecreeHistoryFilter>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DecreeHistoryFilter {
    Active,
    Archived,
    All,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct DecreeHistoryAnnotation {
    pub job_id: String,
    pub history_archived: bool,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChancellorConsultMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChancellorConsultResponse {
    pub status: String,
    pub consultant: String,
    pub reply: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChancellorDepartmentRecommendation {
    pub department: String,
    pub bureaus: Vec<String>,
    pub role: String,
    pub reason: String,
    pub responsibility: String,
    pub expected_output: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChancellorDraftEdict {
    pub objective: String,
    pub scope: Vec<String>,
    pub exclusions: Vec<String>,
    pub input_materials: Vec<String>,
    pub material_gaps: Vec<String>,
    pub key_questions: Vec<String>,
    pub departments: Vec<ChancellorDepartmentRecommendation>,
    pub execution_steps: Vec<String>,
    pub deliverables: Vec<String>,
    pub completion_criteria: Vec<String>,
    pub permissions_and_limits: Vec<String>,
    pub current_status: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChancellorDraftResponse {
    pub status: String,
    pub version: u64,
    pub fingerprint: String,
    pub understanding: String,
    pub expert_example: String,
    pub recommendation_reason: String,
    pub assumptions: Vec<String>,
    pub revision_prompt: String,
    pub draft: Option<ChancellorDraftEdict>,
    pub decree_text: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChancellorDraftInput {
    pub messages: Vec<ChancellorConsultMessage>,
    pub version: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "snake_case", deserialize = "camelCase"))]
pub struct IssueChancellorDecreeInput {
    pub decree_text: String,
    pub draft_version: u64,
    pub draft_fingerprint: String,
    #[serde(skip_serializing)]
    pub idempotency_key: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct AcceptedDecree {
    pub job_id: String,
    pub state: String,
    pub status_url: String,
    pub cancel_url: String,
    pub accepted_at: String,
    pub replayed: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JunjichuBureauOpinion {
    pub bureau: String,
    pub opinion: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JunjichuMinistryOpinion {
    pub department: String,
    pub bureau_opinions: Vec<JunjichuBureauOpinion>,
    pub opinion: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JunjichuCase {
    pub id: String,
    pub decree_text: String,
    pub departments: Vec<String>,
    pub status: String,
    pub processing_path: Vec<String>,
    pub completed_ministry_opinions: Vec<JunjichuMinistryOpinion>,
    pub council_verdict: Option<String>,
    pub reply_id: Option<String>,
    pub failure_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ShiguanReviewStatus {
    pub status: String,
    pub reviewed_at: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ShiguanArchiveDecision {
    pub decision: String,
    pub decided_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ShiguanArchive {
    pub id: String,
    #[serde(rename(deserialize = "type"))]
    pub archive_type: String,
    pub title: String,
    pub content: String,
    pub matter_type: String,
    pub department: String,
    pub lessons_learned: Option<String>,
    pub pitfalls: Option<String>,
    pub source_kind: Option<String>,
    pub source_text: Option<String>,
    pub participating_departments: Option<Vec<String>>,
    pub reply_process: Option<String>,
    pub reply_conclusion: Option<String>,
    pub reply_time: Option<String>,
    pub respondent: Option<String>,
    pub created_at: String,
    pub review_status: Option<ShiguanReviewStatus>,
    pub decision_status: Option<ShiguanArchiveDecision>,
}

#[derive(Serialize)]
struct ShiguanReviewRequest<'a> {
    status: &'a str,
    reviewed_at: String,
    note: Option<&'a str>,
}

#[derive(Serialize)]
struct ShiguanDecisionRequest<'a> {
    decision: &'a str,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ShiguanStatistics {
    pub total: u64,
    pub achieved: u64,
    pub not_achieved: u64,
    pub partial: u64,
    pub observing: u64,
    pub pending_review: u64,
    pub success_rate: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ShiguanRecallMatch {
    pub archive_id: String,
    pub match_reason: String,
    pub historical_conclusion: String,
    pub evidence_labels: Vec<String>,
    pub review_status: Option<ShiguanReviewStatus>,
    pub lessons_learned: Option<String>,
    pub pitfalls: Option<String>,
}

#[derive(Serialize)]
struct ShiguanRecallRequest<'a> {
    matter_type: Option<&'a str>,
    department: Option<&'a str>,
    limit: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct QintianSubject {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct QintianScenario {
    pub kind: String,
    pub summary: String,
    pub impact: String,
    pub time_window: String,
    pub counterfactual: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct QintianAssumption {
    pub statement: String,
    pub critical: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct QintianTrigger {
    pub id: String,
    pub signal: String,
    pub threshold: String,
    pub window: String,
    pub review_at: String,
    pub status: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct QintianReview {
    pub id: String,
    pub forecast_id: String,
    pub trigger_id: String,
    pub decision: String,
    pub observation: String,
    pub judgment_invalidated: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct QintianForecast {
    pub id: String,
    pub created_at: String,
    pub subject: QintianSubject,
    pub question: String,
    pub judgment: String,
    pub confidence: String,
    pub confidence_basis: String,
    pub status: String,
    pub review_at: String,
    pub methodology_version: String,
    pub scenarios: Vec<QintianScenario>,
    pub assumptions: Vec<QintianAssumption>,
    pub triggers: Vec<QintianTrigger>,
    pub reviews: Vec<QintianReview>,
    pub human_signoff_required: bool,
    pub disclaimer: String,
}

#[derive(Debug, Deserialize)]
struct QintianForecastList {
    items: Vec<QintianForecast>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct QintianPendingTrigger {
    pub id: String,
    pub signal: String,
    pub threshold: String,
    pub window: String,
    pub review_at: String,
    pub status: String,
    pub forecast_id: String,
    pub forecast_summary: String,
    pub is_due: bool,
    pub subject: QintianSubject,
    pub context_ref: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct QintianPendingTriggerList {
    items: Vec<QintianPendingTrigger>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QintianConsultMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
struct QintianConsultRequest<'a> {
    messages: &'a [QintianConsultMessage],
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QintianConsultResponse {
    pub status: String,
    pub consultant: String,
    pub reply: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HubuWorkProductSummary {
    pub artifact_id: String,
    pub work_product_id: String,
    pub run_id: String,
    pub reply_id: Option<String>,
    pub capability_id: String,
    pub version: u64,
    pub work_status: String,
    pub confirmation_status: String,
    pub artifact_state: String,
    pub decision: String,
    pub content_digest: String,
    pub created_at: String,
    pub confirmation_receipt_count: u64,
}

#[derive(Debug, Deserialize)]
struct HubuWorkProductList {
    items: Vec<HubuWorkProductSummary>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HubuConfirmationReceipt {
    pub sequence: u64,
    pub decision: String,
    pub structured_reason: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HubuWorkProduct {
    pub artifact_id: String,
    pub work_product_id: String,
    pub version: u64,
    pub run_id: String,
    pub reply_id: Option<String>,
    pub capability_id: String,
    pub work_status: String,
    pub confirmation_status: String,
    pub artifact_state: String,
    pub decision: String,
    pub facts: Vec<serde_json::Value>,
    pub assumptions: Vec<String>,
    pub recommendations: Vec<String>,
    pub evidence_used: Vec<String>,
    pub missing_evidence: Vec<String>,
    pub conflicts: Vec<String>,
    pub risk_register: Vec<String>,
    pub artifact_manifest: Vec<serde_json::Value>,
    pub artifact_gate: HubuArtifactGate,
    pub accounting_projection: Option<HubuAccountingProjection>,
    pub shiguan_archive_id: Option<String>,
    pub content_digest: String,
    pub created_at: String,
    pub confirmation_receipts: Vec<HubuConfirmationReceipt>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HubuArtifactGate {
    pub status: String,
    pub reason_codes: Vec<String>,
    pub missing_kinds: Vec<String>,
    pub unexpected_kinds: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HubuAccountingProjection {
    pub status: String,
    pub code: Option<String>,
    pub report_period: Option<String>,
    pub overall_status: Option<String>,
    pub sheet_names: Option<Vec<String>>,
    pub control_totals: Option<Vec<HubuAccountingControlTotal>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HubuAccountingControlTotal {
    pub name: String,
    pub status: String,
    pub actual: Option<serde_json::Value>,
    pub expected: Option<serde_json::Value>,
    pub difference: Option<serde_json::Value>,
    pub detail: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct CashSafetyAssessment {
    pub kind: String,
    pub risk_level: String,
    pub runway_state: String,
    pub available_cash: String,
    pub monthly_net_burn: Option<String>,
    pub runway_months: Option<String>,
    pub forecast_ending_cash: String,
    pub daily_forecast: Vec<CashSafetyDailyForecast>,
    pub check_codes: Vec<String>,
    pub evidence_links: Vec<String>,
    pub missing_evidence_codes: Vec<String>,
    pub risk_reason_codes: Vec<String>,
    pub recommendations: Vec<CashSafetyRecommendation>,
    pub rule_version: String,
    pub external_effects: String,
    pub payment_executed: bool,
    pub ledger_posted: bool,
    pub persistence_status: String,
    pub artifact_id: Option<String>,
    pub work_product_id: Option<String>,
    pub work_status: Option<String>,
    pub confirmation_status: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct CashSafetyDailyForecast {
    pub forecast_date: String,
    pub ending_cash: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CashSafetyRecommendation {
    pub code: String,
    pub title: String,
    pub action: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HubuArtifactDownload {
    pub file_name: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JinyiweiSummary {
    pub total_investigations: u64,
    pub resolved_count: u64,
    pub partial_count: u64,
    pub blocked_count: u64,
    pub unavailable_count: u64,
    pub distinct_evidence_count: u64,
    pub pending_adoption_count: u64,
    pub confirmed_adoption_count: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JinyiweiInvestigationListItem {
    pub investigation_id: String,
    pub request_id: String,
    pub requesting_agent: String,
    pub question: String,
    pub status: String,
    pub started_at: String,
    pub completed_at: String,
    pub source_attempt_count: u64,
    pub evidence_count: u64,
    pub linked_reply_count: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JinyiweiInvestigationPage {
    pub items: Vec<JinyiweiInvestigationListItem>,
    pub total: u64,
    pub limit: u64,
    pub offset: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JinyiweiEvidence {
    pub evidence_id: String,
    pub fact_key: String,
    pub value: serde_json::Value,
    pub unit: Option<String>,
    pub as_of: String,
    pub published_at: Option<String>,
    pub retrieved_at: String,
    pub source_url: String,
    pub publisher: String,
    pub source_type: String,
    pub coverage: Option<Vec<String>>,
    pub license_note: Option<String>,
    pub quality: String,
    pub stance: String,
    pub excerpt: String,
    pub content_hash: String,
    pub confidence: f64,
    pub access_url: Option<String>,
    pub access_metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JinyiweiAdoption {
    pub evidence_id: String,
    pub reply_id: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub confirmed_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JinyiweiInvestigationDetail {
    pub pack_id: String,
    pub investigation_id: String,
    pub status: String,
    pub request: serde_json::Value,
    pub investigation_plan: serde_json::Value,
    pub evidence_by_fact: HashMap<String, Vec<JinyiweiEvidence>>,
    pub historical_evidence_by_fact: HashMap<String, Vec<JinyiweiEvidence>>,
    pub resolved_facts: Vec<String>,
    pub unresolved_facts: Vec<String>,
    pub conflicts: Vec<serde_json::Value>,
    pub source_attempts: Vec<serde_json::Value>,
    pub investigation_started_at: String,
    pub investigation_completed_at: String,
    pub cache: serde_json::Value,
    pub do_not_infer: Vec<String>,
    pub adoptions: Vec<JinyiweiAdoption>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChaotangSkillCatalogItem {
    pub skill_id: String,
    pub version: String,
    pub agent_id: String,
    pub layer: String,
    pub source: String,
    pub purpose: String,
    pub enabled: bool,
    pub allowed_services: Vec<String>,
    pub forbidden_actions: Vec<String>,
    pub allowed_entrypoints: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChaotangSkillCatalog {
    pub items: Vec<ChaotangSkillCatalogItem>,
    pub total: u64,
    pub enabled_count: u64,
    pub disabled_count: u64,
    pub layer_counts: HashMap<String, u64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChaotangMcpTool {
    pub tool_name: String,
    pub enabled: bool,
    pub effect: String,
    pub approval_version: String,
    pub resolver_only: bool,
    pub fact_categories: Vec<String>,
    pub data_scopes: Vec<String>,
    pub jurisdictions: Vec<String>,
    pub priority: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChaotangMcpServer {
    pub server_id: String,
    pub display_name: String,
    pub transport: String,
    pub source_kind: String,
    pub access_policy: String,
    pub enabled: bool,
    pub approval_version: String,
    pub health: String,
    pub tools: Vec<ChaotangMcpTool>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChaotangMcpCatalog {
    pub servers: Vec<ChaotangMcpServer>,
    pub server_count: u64,
    pub tool_count: u64,
    pub enabled_tool_count: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChaotangConnector {
    pub connector_id: String,
    pub display_name: String,
    pub kind: String,
    pub publisher: String,
    pub enabled: bool,
    pub access_policy: String,
    pub credential_status: String,
    pub sync_mode: String,
    pub last_sync_at: Option<String>,
    pub categories: Vec<String>,
    pub coverage: Vec<String>,
    pub quality_ceiling: Option<String>,
    pub health: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct ChaotangConnectorCatalog {
    pub items: Vec<ChaotangConnector>,
    pub total: u64,
    pub enabled_count: u64,
    pub credential_free_count: u64,
}

#[derive(Debug, Deserialize)]
struct SessionResponse {
    user: ChaotangUser,
    session_id: String,
}

#[derive(Serialize)]
struct LoginRequest<'a> {
    identifier: &'a str,
    password: &'a str,
}

#[derive(Serialize)]
struct RegisterRequest<'a> {
    username: &'a str,
    email: &'a str,
    password: &'a str,
}

#[derive(Serialize)]
struct HubuConfirmationRequest<'a> {
    decision: &'a str,
    structured_reason: &'a str,
}

fn validated_backend_url(value: &str) -> Result<String, String> {
    let invalid = || "账户服务地址无效或不安全（AUTH_ENDPOINT_INVALID）".to_string();
    let url = reqwest::Url::parse(value.trim()).map_err(|_| invalid())?;
    let loopback = url.host_str().is_some_and(|host| {
        host.trim_matches(['[', ']'])
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
    });
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host().is_none()
        || !(url.scheme() == "https" || (url.scheme() == "http" && loopback))
    {
        return Err(invalid());
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

fn account_location(base_url: &str) -> &'static str {
    let local = reqwest::Url::parse(base_url)
        .ok()
        .is_some_and(|url| matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")));
    if local { "本机" } else { "远程" }
}

fn bypass_backend_proxy(base_url: &str) -> bool {
    reqwest::Url::parse(base_url).ok().is_some_and(|url| {
        url.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .trim_matches(['[', ']'])
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|ip| ip.is_loopback())
        })
    })
}

fn provider_http_client(base_url: &str) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(5));
    if bypass_backend_proxy(base_url) {
        builder = builder.no_proxy();
    }
    builder
        .build()
        .map_err(|error| format!("failed to initialize Chaotang HTTP client: {error}"))
}

fn account_http_error(status: u16, base_url: &str) -> String {
    let reason = match status {
        403 => "请求被拒绝，请检查账户权限",
        404 => "登录接口不存在，请检查客户端与服务版本",
        422 => "账户输入格式不符合要求，请检查输入",
        429 => "请求过于频繁，请稍后重试",
        500..=599 => "账户服务内部异常，请联系维护人员检查日志",
        _ => "账户请求失败，请联系维护人员",
    };
    format!(
        "{}：{reason}（AUTH_HTTP_{status}）",
        account_location(base_url)
    )
}

#[cfg(test)]
mod account_diagnostic_tests {
    use super::*;

    #[test]
    fn only_local_endpoints_bypass_proxy_configuration() {
        for value in [
            "http://127.0.0.1:8000",
            "http://127.42.3.2",
            "https://[::1]",
            "https://localhost",
        ] {
            assert!(bypass_backend_proxy(value), "{value}");
        }
        for value in [
            "https://app.mingshuoxny.com",
            "https://localhost.example.com",
            "https://127.0.0.1.example.com",
            "https://192.168.0.1",
            "https://0.0.0.0",
            "not a URL",
        ] {
            assert!(!bypass_backend_proxy(value), "{value}");
        }
    }

    #[tokio::test]
    async fn login_redirect_is_not_followed() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let destination = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let target = destination.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = [0; 4096];
            socket.read(&mut buffer).await.unwrap();
            socket.write_all(format!("HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{target}/login\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState::from_backend_url(&format!("http://{address}")).unwrap();
        assert!(
            state
                .login("test", "test-only")
                .await
                .unwrap_err()
                .contains("AUTH_HTTP_307")
        );
        server.await.unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(100), destination.accept())
                .await
                .is_err()
        );
    }

    #[test]
    fn backend_endpoint_requires_tls_except_literal_loopback() {
        for value in [
            "http://127.0.0.1:8000",
            "http://[::1]:8000",
            "https://example.com",
        ] {
            assert!(validated_backend_url(value).is_ok());
        }
        for value in [
            "http://132.232.137.45:8088",
            "http://192.168.10.36:8000",
            "http://localhost",
            "http://localhost.example.com",
            "file:///tmp/api",
            "https://user:secret@example.com",
            "https://example.com?token=secret",
            "https://example.com#secret",
            "not a url",
        ] {
            let error = validated_backend_url(value).unwrap_err();
            assert!(error.contains("AUTH_ENDPOINT_INVALID"));
            assert!(!error.contains("secret"));
        }
        assert_eq!(
            validated_backend_url(" https://example.com/api/ ").unwrap(),
            "https://example.com/api"
        );
    }

    #[test]
    fn account_errors_identify_service_and_status_without_endpoint_secrets() {
        for status in [403, 404, 422, 429, 500, 502, 503] {
            let message = account_http_error(status, "https://user:secret@example.com/private");
            assert!(message.starts_with("远程"));
            assert!(message.contains(&format!("AUTH_HTTP_{status}")));
            assert!(!message.contains("secret"));
            assert!(!message.contains("example.com"));
        }
        assert_eq!(account_location("http://127.0.0.1:8000"), "本机");
        assert_eq!(account_location("http://localhost:8000"), "本机");
        assert_eq!(account_location("http://[::1]:8000"), "本机");
        assert_eq!(account_location("http://localhost.example.com"), "远程");
    }
}

impl ChaotangProviderState {
    pub fn from_environment() -> Result<Self, String> {
        let store = crate::session_store::SessionStore::from_environment()?;
        Self::from_backend_url_with_store(
            &std::env::var("CHAOTANG_BACKEND_BASE_URL")
                .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string()),
            store,
        )
    }

    fn from_backend_url(value: &str) -> Result<Self, String> {
        Self::from_backend_url_with_store(value, crate::session_store::SessionStore::disabled())
    }

    fn from_backend_url_with_store(
        value: &str,
        session_store: crate::session_store::SessionStore,
    ) -> Result<Self, String> {
        let base_url = validated_backend_url(value)?;
        let client = provider_http_client(&base_url)?;
        let persisted_session = session_store.load();

        Ok(Self {
            client,
            base_url,
            session_id: Arc::new(tokio::sync::RwLock::new(persisted_session)),
            session_store,
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
        })
    }

    async fn begin_auth_change(&self) -> Result<u64, String> {
        let mut session = self.session_id.write().await;
        *session = None;
        let generation = self
            .auth_generation
            .fetch_add(1, Ordering::SeqCst)
            .wrapping_add(1);
        self.owner_runtime.revoke(generation).await;
        self.session_store.clear()?;
        Ok(generation)
    }

    async fn clear_request_session(&self, request_session: &str) -> bool {
        let mut current = self.session_id.write().await;
        if current.as_deref() != Some(request_session) {
            return false;
        }
        *current = None;
        let _ = self.session_store.clear();
        let generation = self
            .auth_generation
            .fetch_add(1, Ordering::SeqCst)
            .wrapping_add(1);
        self.owner_runtime.revoke(generation).await;
        true
    }

    pub(crate) async fn owner_auth(
        &self,
    ) -> Result<crate::fusion_owner_runtime::OwnerAuth, String> {
        let current = self.session_id.read().await;
        Ok(crate::fusion_owner_runtime::OwnerAuth {
            client: self.client.clone(),
            base_url: self.base_url.clone(),
            token: current.clone().ok_or("请先登录朝堂账户")?,
            epoch: self.auth_generation.load(Ordering::SeqCst),
        })
    }

    pub(crate) async fn owner_auth_current(
        &self,
        auth: &crate::fusion_owner_runtime::OwnerAuth,
    ) -> Result<(), String> {
        let current = self.session_id.read().await;
        if current.as_deref() != Some(auth.token.as_str())
            || self.auth_generation.load(Ordering::SeqCst) != auth.epoch
        {
            return Err("OWNER_SESSION_CHANGED: 账户已切换，请重新打开任务".into());
        }
        Ok(())
    }

    pub(crate) async fn owner_expired(&self, token: &str) {
        self.clear_request_session(token).await;
    }

    async fn health(&self) -> Result<ChaotangHealth, String> {
        let response = self
            .client
            .get(format!("{}/health", self.base_url))
            .send()
            .await
            .map_err(|_| "chaotang backend is unavailable".to_string())?;

        if !response.status().is_success() {
            return Err(format!(
                "chaotang backend health check returned HTTP {}",
                response.status().as_u16()
            ));
        }

        let health = response
            .json::<BackendHealth>()
            .await
            .map_err(|_| "chaotang backend returned an invalid health contract".to_string())?;

        if health.status != "ok" || health.service != "chaotang-os-backend" {
            return Err("chaotang backend identity check failed".to_string());
        }

        Ok(ChaotangHealth {
            status: health.status,
            service: health.service,
            version: health.version,
            base_url: self.base_url.clone(),
        })
    }

    async fn readiness(&self) -> Result<ChaotangReadiness, String> {
        let response = self
            .client
            .get(format!("{}/readyz", self.base_url))
            .send()
            .await
            .map_err(|_| "朝堂就绪状态暂时无法连接".to_string())?;
        let ready = response.status().is_success();
        let readiness = response
            .json::<BackendReadiness>()
            .await
            .map_err(|_| "朝堂就绪状态响应格式无效".to_string())?;
        Ok(ChaotangReadiness {
            ready,
            codes: readiness.codes,
        })
    }

    async fn accept_session(
        &self,
        response: reqwest::Response,
        generation: u64,
    ) -> Result<ChaotangUser, String> {
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err("用户名、邮箱或密码不正确".to_string());
        }
        if response.status() == reqwest::StatusCode::CONFLICT {
            return Err("用户名或邮箱已存在".to_string());
        }
        if !response.status().is_success() {
            let status = response.status().as_u16();
            // Do not expose response bodies: they can contain internal data.
            return Err(account_http_error(status, &self.base_url));
        }
        let session = response
            .json::<SessionResponse>()
            .await
            .map_err(|_| "朝堂账户响应格式无效".to_string())?;
        let mut current = self.session_id.write().await;
        if self.auth_generation.load(Ordering::SeqCst) != generation {
            return Err("账户操作已被新的登录或退出操作替代".into());
        }
        if let Err(error) = self.session_store.save(&session.session_id) {
            let _ = self
                .client
                .post(format!("{}/api/v1/auth/logout", self.base_url))
                .bearer_auth(&session.session_id)
                .send()
                .await;
            return Err(error);
        }
        *current = Some(session.session_id);
        let generation = self
            .auth_generation
            .fetch_add(1, Ordering::SeqCst)
            .wrapping_add(1);
        self.owner_runtime.revoke(generation).await;
        Ok(session.user)
    }

    async fn login(&self, identifier: &str, password: &str) -> Result<ChaotangUser, String> {
        let generation = self.begin_auth_change().await?;
        let response = self
            .client
            .post(format!("{}/api/v1/auth/login", self.base_url))
            .json(&LoginRequest {
                identifier,
                password,
            })
            .send()
            .await
            .map_err(|error| {
                let location = account_location(&self.base_url);
                if error.is_timeout() {
                    format!("{location}账户服务响应超时，请稍后重试（AUTH_TIMEOUT）")
                } else {
                    format!("无法连接{location}账户服务，请检查服务是否启动或网络连接（AUTH_CONNECTION）")
                }
            })?;
        self.accept_session(response, generation).await
    }

    async fn register(
        &self,
        username: &str,
        email: &str,
        password: &str,
    ) -> Result<ChaotangUser, String> {
        let generation = self.begin_auth_change().await?;
        let response = self
            .client
            .post(format!("{}/api/v1/auth/register", self.base_url))
            .json(&RegisterRequest {
                username,
                email,
                password,
            })
            .send()
            .await
            .map_err(|_| "朝堂后端当前不可用".to_string())?;
        self.accept_session(response, generation).await
    }

    pub(crate) async fn current_user(&self) -> Result<Option<ChaotangUser>, String> {
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Ok(None);
        };
        let response = self
            .client
            .get(format!("{}/api/v1/auth/me", self.base_url))
            .bearer_auth(&session_id)
            .send()
            .await
            .map_err(|_| "朝堂后端当前不可用".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return if self.clear_request_session(&session_id).await {
                Ok(None)
            } else {
                Err("请求所属会话已结束或切换，请重新读取当前账户".into())
            };
        }
        if !response.status().is_success() {
            return Err("无法读取当前朝堂用户".to_string());
        }
        let user = response
            .json::<ChaotangUser>()
            .await
            .map_err(|_| "朝堂用户响应格式无效".to_string())?;
        if self.session_id.read().await.as_deref() != Some(session_id.as_str()) {
            return Err("请求所属会话已结束或切换，请重新读取当前账户".into());
        }
        Ok(Some(user))
    }

    async fn logout(&self) -> Result<(), String> {
        let session_id = {
            let mut current = self.session_id.write().await;
            let generation = self
                .auth_generation
                .fetch_add(1, Ordering::SeqCst)
                .wrapping_add(1);
            self.owner_runtime.revoke(generation).await;
            current.take()
        };
        let clear_result = self.session_store.clear();
        let Some(session_id) = session_id else {
            return clear_result;
        };
        let remote_result = self
            .client
            .post(format!("{}/api/v1/auth/logout", self.base_url))
            .bearer_auth(&session_id)
            .send()
            .await
            .map_err(|_| "本机会话已清除，但后端暂时无法确认退出".to_string());
        clear_result?;
        let response = remote_result?;
        if !response.status().is_success() {
            return Err("本机会话已清除，但后端未确认退出，请检查连接并核对账户状态".into());
        }
        Ok(())
    }

    async fn dadian_overview(&self, department: Option<&str>) -> Result<DadianOverview, String> {
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let mut request = self
            .client
            .get(format!("{}/api/v1/shiguan/dadian-overview", self.base_url))
            .bearer_auth(&session_id);
        if let Some(department) = department.filter(|value| !value.trim().is_empty()) {
            request = request.query(&[("department", department.trim())]);
        }
        let response = request
            .send()
            .await
            .map_err(|_| "大殿总览暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if !response.status().is_success() {
            return Err("大殿总览暂时不可用".to_string());
        }
        response
            .json::<DadianOverview>()
            .await
            .map_err(|_| "大殿总览响应格式无效".to_string())
    }

    async fn daily_memorial_latest(&self) -> Result<Option<DailyMemorialLatest>, String> {
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .get(format!(
                "{}/api/v1/daily-memorial-drafts/latest",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .send()
            .await
            .map_err(|_| "每日奏报暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if !response.status().is_success() {
            return Err("每日奏报暂时不可用".to_string());
        }
        response
            .json::<Option<DailyMemorialLatest>>()
            .await
            .map_err(|_| "每日奏报响应格式无效".to_string())
    }

    async fn confirm_daily_memorial(
        &self,
        input: &ConfirmDailyMemorialInput,
    ) -> Result<ConfirmDailyMemorialResponse, String> {
        let draft_id = safe_opaque_id(&input.draft_id, "奏报草稿编号")?;
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/daily-memorial-drafts/{draft_id}/confirm",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .json(&serde_json::json!({"version": input.version, "fingerprint": input.fingerprint}))
            .send()
            .await
            .map_err(|_| "确认每日奏报暂时无法连接".to_string())?;
        self.decode_authenticated(
            response,
            &session_id,
            "确认每日奏报",
            "确认每日奏报响应格式无效",
        )
        .await
    }

    async fn decree_jobs(
        &self,
        input: Option<&DecreeJobListInput>,
    ) -> Result<DecreeJobPage, String> {
        let session_id = self.require_session().await?;
        let mut query = input.cloned().unwrap_or_default();
        query.limit.get_or_insert(50);
        query.offset.get_or_insert(0);
        query.archived.get_or_insert(DecreeHistoryFilter::Active);
        let response = self
            .client
            .get(format!("{}/api/v1/decree-jobs", self.base_url))
            .query(&query)
            .bearer_auth(&session_id)
            .send()
            .await
            .map_err(|_| "旨意任务暂时无法连接".to_string())?;
        self.decode_authenticated(response, &session_id, "旨意任务", "旨意任务响应格式无效")
            .await
    }

    async fn set_decree_history_archived(
        &self,
        job_id: &str,
        archived: bool,
    ) -> Result<DecreeHistoryAnnotation, String> {
        let job_id = safe_opaque_id(job_id, "任务编号")?;
        let session_id = self.require_session().await?;
        let response = self
            .client
            .put(format!(
                "{}/api/v1/decree-jobs/{job_id}/history-annotation",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .json(&serde_json::json!({"archived": archived}))
            .send()
            .await
            .map_err(|_| "任务历史归档暂时无法连接".to_string())?;
        self.decode_authenticated(
            response,
            &session_id,
            "任务历史归档",
            "任务历史归档响应格式无效",
        )
        .await
    }

    async fn decree_job(&self, job_id: &str) -> Result<DecreeJob, String> {
        let job_id = safe_opaque_id(job_id, "任务编号")?;
        self.authenticated_get(&format!("/api/v1/decree-jobs/{job_id}"), "旨意任务")
            .await?
            .json::<DecreeJob>()
            .await
            .map_err(|_| "旨意任务响应格式无效".to_string())
    }

    async fn decree_workspace(&self, job_id: &str) -> Result<DecreeWorkspace, String> {
        let job_id = safe_opaque_id(job_id, "任务编号")?;
        self.authenticated_get(
            &format!("/api/v1/decree-jobs/{job_id}/workspace"),
            "任务面板",
        )
        .await?
        .json::<DecreeWorkspace>()
        .await
        .map_err(|_| "任务面板响应格式无效".to_string())
    }

    async fn download_workspace_artifact(
        &self,
        path: &str,
    ) -> Result<HubuArtifactDownload, String> {
        let path = safe_workspace_download_path(path)?;
        let mut response = self.authenticated_get(path, "成果下载").await?;
        const MAX_DOWNLOAD_BYTES: usize = 32 * 1024 * 1024;
        if response.content_length().unwrap_or(0) > MAX_DOWNLOAD_BYTES as u64 {
            return Err("成果文件超过 32 MB 下载限制".to_string());
        }
        let mime_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "成果文件读取失败".to_string())?
        {
            if bytes.len() + chunk.len() > MAX_DOWNLOAD_BYTES {
                return Err("成果文件超过 32 MB 下载限制".to_string());
            }
            bytes.extend_from_slice(&chunk);
        }
        if bytes.is_empty() {
            return Err("成果文件为空".to_string());
        }
        Ok(HubuArtifactDownload {
            file_name: "artifact".to_string(),
            mime_type,
            bytes,
        })
    }

    async fn cancel_decree_job(&self, job_id: &str) -> Result<DecreeJob, String> {
        let job_id = safe_opaque_id(job_id, "任务编号")?;
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/decree-jobs/{job_id}/cancel",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .send()
            .await
            .map_err(|_| "取消旨意任务暂时无法连接".to_string())?;
        self.decode_authenticated(
            response,
            &session_id,
            "取消旨意任务",
            "取消旨意任务响应格式无效",
        )
        .await
    }

    async fn retry_decree_job(&self, job_id: &str) -> Result<DecreeJob, String> {
        let job_id = safe_opaque_id(job_id, "任务编号")?;
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/decree-jobs/{job_id}/retry",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .send()
            .await
            .map_err(|_| "重试旨意任务暂时无法连接".to_string())?;
        self.decode_authenticated(
            response,
            &session_id,
            "重试旨意任务",
            "重试旨意任务响应格式无效",
        )
        .await
    }

    async fn chancellor_consult(
        &self,
        messages: &[ChancellorConsultMessage],
    ) -> Result<ChancellorConsultResponse, String> {
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!("{}/api/v1/chancellor-consult", self.base_url))
            .bearer_auth(&session_id)
            .json(&serde_json::json!({"messages": messages}))
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    "DeepSeek 响应超时，请稍后重试".to_string()
                } else {
                    "丞相咨询暂时无法连接".to_string()
                }
            })?;
        self.decode_authenticated(response, &session_id, "丞相咨询", "丞相咨询响应格式无效")
            .await
    }

    async fn chancellor_draft(
        &self,
        input: &ChancellorDraftInput,
    ) -> Result<ChancellorDraftResponse, String> {
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!("{}/api/v1/chancellor-drafts", self.base_url))
            .bearer_auth(&session_id)
            .json(input)
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    "DeepSeek 响应超时，请稍后重试".to_string()
                } else {
                    "丞相拟旨暂时无法连接".to_string()
                }
            })?;
        self.decode_authenticated(response, &session_id, "丞相拟旨", "丞相拟旨响应格式无效")
            .await
    }

    async fn issue_chancellor_decree(
        &self,
        input: &IssueChancellorDecreeInput,
    ) -> Result<AcceptedDecree, String> {
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!("{}/api/v1/decrees/chancellor", self.base_url))
            .bearer_auth(&session_id)
            .header("Idempotency-Key", input.idempotency_key.trim())
            .json(input)
            .send()
            .await
            .map_err(|_| "正式下旨暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::CONFLICT {
            return Err("该幂等键已用于不同旨意".to_string());
        }
        self.decode_authenticated(response, &session_id, "正式下旨", "正式下旨响应格式无效")
            .await
    }

    async fn junjichu_cases(&self) -> Result<Vec<JunjichuCase>, String> {
        self.authenticated_get("/api/v1/junjichu/cases", "军机处案卷")
            .await?
            .json::<Vec<JunjichuCase>>()
            .await
            .map_err(|_| "军机处案卷响应格式无效".to_string())
    }

    async fn junjichu_case(&self, case_id: &str) -> Result<JunjichuCase, String> {
        let case_id = safe_opaque_id(case_id, "案卷编号")?;
        self.authenticated_get(&format!("/api/v1/junjichu/cases/{case_id}"), "军机处案卷")
            .await?
            .json::<JunjichuCase>()
            .await
            .map_err(|_| "军机处案卷响应格式无效".to_string())
    }

    async fn require_session(&self) -> Result<String, String> {
        self.session_id
            .read()
            .await
            .clone()
            .ok_or_else(|| "请先登录朝堂账户".to_string())
    }

    async fn decode_authenticated<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
        request_session: &str,
        label: &str,
        invalid: &str,
    ) -> Result<T, String> {
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(request_session).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response
                .json::<serde_json::Value>()
                .await
                .unwrap_or(serde_json::Value::Null);
            let reason = public_service_error(&body).unwrap_or("暂时不可用");
            return Err(format!("{label}：{reason}（HTTP {status}）"));
        }
        response.json::<T>().await.map_err(|_| invalid.to_string())
    }

    async fn authenticated_get(
        &self,
        path: &str,
        label: &str,
    ) -> Result<reqwest::Response, String> {
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .get(format!("{}{}", self.base_url, path))
            .bearer_auth(&session_id)
            .send()
            .await
            .map_err(|_| format!("{label}暂时无法连接"))?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if !response.status().is_success() {
            return Err(format!("{label}暂时不可用"));
        }
        Ok(response)
    }

    async fn shiguan_archives(
        &self,
        archive_type: Option<&str>,
        limit: u64,
    ) -> Result<Vec<ShiguanArchive>, String> {
        let mut path = format!("/api/v1/shiguan/archives?limit={}", limit.clamp(1, 100));
        if let Some(archive_type) = archive_type.filter(|value| !value.trim().is_empty()) {
            path.push_str("&type=");
            path.push_str(archive_type.trim());
        }
        self.authenticated_get(&path, "史馆档案")
            .await?
            .json::<Vec<ShiguanArchive>>()
            .await
            .map_err(|_| "史馆档案响应格式无效".to_string())
    }

    async fn shiguan_archive(&self, archive_id: &str) -> Result<ShiguanArchive, String> {
        let safe_id = archive_id.trim();
        if safe_id.is_empty()
            || !safe_id.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err("史馆档案编号无效".to_string());
        }
        self.authenticated_get(
            &format!("/api/v1/shiguan/archives/{safe_id}"),
            "史馆档案详情",
        )
        .await?
        .json::<ShiguanArchive>()
        .await
        .map_err(|_| "史馆档案详情响应格式无效".to_string())
    }

    async fn shiguan_review(
        &self,
        archive_id: &str,
        status: &str,
        reviewed_at: &str,
        note: Option<&str>,
    ) -> Result<ShiguanReviewStatus, String> {
        if !matches!(
            status,
            "ACHIEVED" | "NOT_ACHIEVED" | "PARTIAL" | "OBSERVING"
        ) {
            return Err("复盘状态无效".to_string());
        }
        let safe_id = archive_id.trim();
        if safe_id.is_empty()
            || !safe_id.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
            || reviewed_at.trim().is_empty()
        {
            return Err("复盘请求格式无效".to_string());
        }
        let note = note.map(str::trim).filter(|value| !value.is_empty());
        if note.is_some_and(|value| value.chars().count() > 4000) {
            return Err("复盘备注不能超过 4000 字".to_string());
        }
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .patch(format!(
                "{}/api/v1/shiguan/archives/{safe_id}/review",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .json(&ShiguanReviewRequest {
                status,
                reviewed_at: reviewed_at.to_string(),
                note,
            })
            .send()
            .await
            .map_err(|_| "复盘更新暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err("档案不存在或无权访问".to_string());
        }
        if !response.status().is_success() {
            return Err("复盘更新失败".to_string());
        }
        response
            .json::<ShiguanReviewStatus>()
            .await
            .map_err(|_| "复盘响应格式无效".to_string())
    }

    async fn shiguan_decision(
        &self,
        archive_id: &str,
        decision: &str,
    ) -> Result<ShiguanArchiveDecision, String> {
        if !matches!(
            decision,
            "APPROVED" | "REJECTED" | "ADOPTED" | "RETURNED_FOR_RECONSIDERATION"
        ) {
            return Err("档案处置决定无效".to_string());
        }
        let safe_id = archive_id.trim();
        if safe_id.is_empty()
            || !safe_id.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err("史馆档案编号无效".to_string());
        }
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .put(format!(
                "{}/api/v1/shiguan/archives/{safe_id}/decision",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .json(&ShiguanDecisionRequest { decision })
            .send()
            .await
            .map_err(|_| "档案处置暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err("档案不存在或无权访问".to_string());
        }
        if response.status() == reqwest::StatusCode::CONFLICT {
            return Err("档案已有不同的不可变最终决定".to_string());
        }
        if !response.status().is_success() {
            return Err("档案处置失败".to_string());
        }
        response
            .json::<ShiguanArchiveDecision>()
            .await
            .map_err(|_| "档案处置响应格式无效".to_string())
    }

    async fn shiguan_statistics(&self) -> Result<ShiguanStatistics, String> {
        self.authenticated_get("/api/v1/shiguan/statistics", "史馆统计")
            .await?
            .json::<ShiguanStatistics>()
            .await
            .map_err(|_| "史馆统计响应格式无效".to_string())
    }

    async fn shiguan_outcomes_overview(&self) -> Result<serde_json::Value, String> {
        self.authenticated_get("/api/v1/shiguan/outcomes/overview", "史馆业务结果")
            .await?
            .json::<serde_json::Value>()
            .await
            .map_err(|_| "史馆业务结果响应格式无效".to_string())
    }

    async fn shiguan_create_outcome(
        &self,
        archive_id: &str,
        payload: OutcomeCreateCommand,
    ) -> Result<serde_json::Value, String> {
        let archive_id = safe_opaque_id(archive_id, "史馆档案编号")?;
        payload.validate()?;
        let session = self.require_session().await?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/shiguan/archives/{archive_id}/outcomes",
                self.base_url
            ))
            .bearer_auth(&session)
            .json(&payload)
            .send()
            .await
            .map_err(|_| "Outcome 写入暂时不可用".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session).await;
            return Err("登录已失效，请重新登录".into());
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err("档案不存在或无权访问".into());
        }
        if response.status() == reqwest::StatusCode::CONFLICT {
            return Err("档案尚未采纳、幂等键冲突或更正链无效".into());
        }
        if !response.status().is_success() {
            return Err(format!(
                "Outcome 写入失败（HTTP {}）",
                response.status().as_u16()
            ));
        }
        response
            .json()
            .await
            .map_err(|_| "Outcome 写入回执格式无效".into())
    }

    async fn candidate_history(&self, experiment_id: &str) -> Result<serde_json::Value, String> {
        if !candidate_identity(experiment_id) {
            return Err("实验编号无效".into());
        }
        self.authenticated_get(
            &format!("/api/v1/hanlin/experiments/{experiment_id}/candidate-events"),
            "候选账历史",
        )
        .await?
        .json()
        .await
        .map_err(|_| "候选账历史响应格式无效".into())
    }

    async fn append_candidate_event(
        &self,
        experiment_id: &str,
        payload: CandidateCommand,
    ) -> Result<serde_json::Value, String> {
        if !candidate_identity(experiment_id) {
            return Err("实验编号无效".into());
        }
        payload.validate()?;
        let session = self.require_session().await?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/hanlin/experiments/{experiment_id}/candidate-events",
                self.base_url
            ))
            .bearer_auth(&session)
            .json(&payload)
            .send()
            .await
            .map_err(|_| "候选账操作暂时不可用".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session).await;
            return Err("登录已失效，请重新登录".into());
        }
        if !response.status().is_success() {
            return Err(format!(
                "候选账操作失败（HTTP {}）",
                response.status().as_u16()
            ));
        }
        response
            .json()
            .await
            .map_err(|_| "候选账操作响应格式无效".into())
    }

    async fn runtime_rehearsal_history(
        &self,
        experiment_id: &str,
    ) -> Result<serde_json::Value, String> {
        if !candidate_identity(experiment_id) {
            return Err("实验编号无效".into());
        }
        self.authenticated_get(
            &format!("/api/v1/hanlin/experiments/{experiment_id}/runtime-rehearsal-events"),
            "候选进程演练历史",
        )
        .await?
        .json()
        .await
        .map_err(|_| "候选进程演练历史响应格式无效".into())
    }

    async fn append_runtime_rehearsal_event(
        &self,
        experiment_id: &str,
        payload: RuntimeRehearsalCommand,
    ) -> Result<serde_json::Value, String> {
        if !candidate_identity(experiment_id) {
            return Err("实验编号无效".into());
        }
        payload.validate()?;
        let session = self.require_session().await?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/hanlin/experiments/{experiment_id}/runtime-rehearsal-events",
                self.base_url
            ))
            .bearer_auth(&session)
            .json(&payload)
            .send()
            .await
            .map_err(|_| "候选进程演练暂时不可用".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session).await;
            return Err("登录已失效，请重新登录".into());
        }
        if !response.status().is_success() {
            return Err(format!(
                "候选进程演练失败（HTTP {}）",
                response.status().as_u16()
            ));
        }
        response
            .json()
            .await
            .map_err(|_| "候选进程演练响应格式无效".into())
    }

    async fn hanlin_experiment(&self, experiment_id: &str) -> Result<serde_json::Value, String> {
        // Match backend ExperimentDefinition identity; a single bounded segment.
        if !(8..=128).contains(&experiment_id.len())
            || !experiment_id.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-')
            })
        {
            return Err("实验编号无效".to_string());
        }
        self.authenticated_get(
            &format!("/api/v1/hanlin/experiments/{experiment_id}"),
            "翰林院实验",
        )
        .await?
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "翰林院实验响应格式无效".to_string())
    }

    async fn shiguan_recall(
        &self,
        matter_type: Option<&str>,
        department: Option<&str>,
        limit: u64,
    ) -> Result<Vec<ShiguanRecallMatch>, String> {
        let matter_type = matter_type.map(str::trim).filter(|value| !value.is_empty());
        let department = department.map(str::trim).filter(|value| !value.is_empty());
        if matter_type.is_none() && department.is_none() {
            return Err("请至少填写事项类型或部门".to_string());
        }
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .post(format!("{}/api/v1/shiguan/recall", self.base_url))
            .bearer_auth(&session_id)
            .json(&ShiguanRecallRequest {
                matter_type,
                department,
                limit: limit.clamp(1, 100),
            })
            .send()
            .await
            .map_err(|_| "相似旧案召回暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if response.status() == reqwest::StatusCode::UNPROCESSABLE_ENTITY {
            return Err("旧案召回条件无效".to_string());
        }
        if !response.status().is_success() {
            return Err("相似旧案召回暂时不可用".to_string());
        }
        response
            .json::<Vec<ShiguanRecallMatch>>()
            .await
            .map_err(|_| "相似旧案召回响应格式无效".to_string())
    }

    async fn qintian_forecasts(&self) -> Result<Vec<QintianForecast>, String> {
        self.authenticated_get("/api/v1/qintianjian/forecasts", "正式推演")
            .await?
            .json::<QintianForecastList>()
            .await
            .map(|response| response.items)
            .map_err(|_| "正式推演响应格式无效".to_string())
    }

    async fn qintian_consult(
        &self,
        messages: &[QintianConsultMessage],
    ) -> Result<QintianConsultResponse, String> {
        if messages.is_empty() || messages.len() > 20 {
            return Err("即时问策消息数量无效".to_string());
        }
        for (index, message) in messages.iter().enumerate() {
            let expected_role = if index % 2 == 0 { "user" } else { "assistant" };
            if message.role != expected_role
                || message.content.trim().is_empty()
                || message.content.chars().count() > 4000
            {
                return Err("即时问策消息格式无效".to_string());
            }
        }
        if messages.last().map(|message| message.role.as_str()) != Some("user") {
            return Err("即时问策必须以用户问题结束".to_string());
        }
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .post(format!("{}/api/v1/qintianjian/consult", self.base_url))
            .bearer_auth(&session_id)
            .json(&QintianConsultRequest { messages })
            .send()
            .await
            .map_err(|_| "即时问策暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if response.status() == reqwest::StatusCode::UNPROCESSABLE_ENTITY {
            return Err("即时问策内容格式无效".to_string());
        }
        if !response.status().is_success() {
            return Err("钦天监暂时无法回应，请稍后再试".to_string());
        }
        let result = response
            .json::<QintianConsultResponse>()
            .await
            .map_err(|_| "即时问策响应格式无效".to_string())?;
        if result.status != "ok" || result.consultant != "钦天监" || result.reply.trim().is_empty()
        {
            return Err("即时问策响应格式无效".to_string());
        }
        Ok(result)
    }

    async fn qintian_forecast(&self, forecast_id: &str) -> Result<QintianForecast, String> {
        let safe_id = forecast_id.trim();
        if safe_id.is_empty()
            || !safe_id.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err("推演编号无效".to_string());
        }
        self.authenticated_get(
            &format!("/api/v1/qintianjian/forecasts/{safe_id}"),
            "推演详情",
        )
        .await?
        .json::<QintianForecast>()
        .await
        .map_err(|_| "推演详情响应格式无效".to_string())
    }

    async fn qintian_pending_triggers(&self) -> Result<Vec<QintianPendingTrigger>, String> {
        self.authenticated_get("/api/v1/qintianjian/triggers/pending", "待验证触发器")
            .await?
            .json::<QintianPendingTriggerList>()
            .await
            .map(|response| response.items)
            .map_err(|_| "待验证触发器响应格式无效".to_string())
    }

    async fn create_qintian_forecast(
        &self,
        input: &serde_json::Value,
    ) -> Result<QintianForecast, String> {
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!("{}/api/v1/qintianjian/forecasts", self.base_url))
            .bearer_auth(&session_id)
            .json(input)
            .send()
            .await
            .map_err(|_| "创建正式推演暂时无法连接".to_string())?;
        self.decode_authenticated(
            response,
            &session_id,
            "创建正式推演",
            "正式推演响应格式无效",
        )
        .await
    }

    async fn review_qintian_forecast(
        &self,
        forecast_id: &str,
        input: &serde_json::Value,
    ) -> Result<QintianReview, String> {
        let forecast_id = safe_opaque_id(forecast_id, "推演编号")?;
        let session_id = self.require_session().await?;
        let response = self
            .client
            .post(format!(
                "{}/api/v1/qintianjian/forecasts/{forecast_id}/reviews",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .json(input)
            .send()
            .await
            .map_err(|_| "提交人工复核暂时无法连接".to_string())?;
        self.decode_authenticated(
            response,
            &session_id,
            "提交人工复核",
            "人工复核响应格式无效",
        )
        .await
    }

    async fn hubu_work_products(&self) -> Result<Vec<HubuWorkProductSummary>, String> {
        self.authenticated_get("/api/v1/report-artifacts?limit=50", "户部成果")
            .await?
            .json::<HubuWorkProductList>()
            .await
            .map(|response| response.items)
            .map_err(|_| "户部成果响应格式无效".to_string())
    }

    async fn hubu_work_product(&self, artifact_id: &str) -> Result<HubuWorkProduct, String> {
        let safe_id = artifact_id.trim();
        if safe_id.len() != 32
            || !safe_id
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err("成果编号无效".to_string());
        }
        self.authenticated_get(
            &format!("/api/v1/report-artifacts/{safe_id}/work-product"),
            "WorkProduct 详情",
        )
        .await?
        .json::<HubuWorkProduct>()
        .await
        .map_err(|_| "WorkProduct 详情响应格式无效".to_string())
    }

    async fn hubu_download_artifact(
        &self,
        artifact_id: &str,
    ) -> Result<HubuArtifactDownload, String> {
        let safe_id = artifact_id.trim();
        if safe_id.len() != 32
            || !safe_id
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err("成果编号无效".to_string());
        }
        let response = self
            .authenticated_get(
                &format!("/api/v1/report-artifacts/{safe_id}/download"),
                "成果文件",
            )
            .await?;
        let mime_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .to_string();
        let bytes = response
            .bytes()
            .await
            .map_err(|_| "成果文件读取失败".to_string())?
            .to_vec();
        if bytes.is_empty() {
            return Err("成果文件为空，已拒绝下载".to_string());
        }
        Ok(HubuArtifactDownload {
            file_name: format!("{safe_id}.xlsx"),
            mime_type,
            bytes,
        })
    }

    async fn hubu_confirm_artifact(
        &self,
        artifact_id: &str,
        decision: &str,
        structured_reason: &str,
    ) -> Result<HubuWorkProduct, String> {
        let safe_id = artifact_id.trim();
        if safe_id.len() != 32
            || !safe_id
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err("成果编号无效".to_string());
        }
        if !matches!(decision, "CONFIRMED" | "REVISION_REQUIRED" | "ESCALATED") {
            return Err("成果确认决定无效".to_string());
        }
        let reason = structured_reason.trim();
        if reason.is_empty() || reason.chars().count() > 2000 {
            return Err("请填写 1 至 2000 字的确认理由".to_string());
        }
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .post(format!(
                "{}/api/v1/report-artifacts/{safe_id}/confirmation",
                self.base_url
            ))
            .bearer_auth(&session_id)
            .json(&HubuConfirmationRequest {
                decision,
                structured_reason: reason,
            })
            .send()
            .await
            .map_err(|_| "成果确认暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if response.status() == reqwest::StatusCode::CONFLICT {
            return Err("该成果已确认或当前状态不允许再次确认".to_string());
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err("成果不存在或不属于当前账户".to_string());
        }
        if !response.status().is_success() {
            return Err("成果确认暂时不可用".to_string());
        }
        response
            .json::<HubuWorkProduct>()
            .await
            .map_err(|_| "成果确认响应格式无效".to_string())
    }

    async fn cash_safety_evaluate(
        &self,
        input: &serde_json::Value,
    ) -> Result<CashSafetyAssessment, String> {
        let Some(session_id) = self.session_id.read().await.clone() else {
            return Err("请先登录朝堂账户".to_string());
        };
        let response = self
            .client
            .post(format!("{}/api/v1/hubu/cash-safety/create", self.base_url))
            .bearer_auth(&session_id)
            .json(input)
            .send()
            .await
            .map_err(|_| "现金安全评估暂时无法连接".to_string())?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            self.clear_request_session(&session_id).await;
            return Err("朝堂会话已失效，请重新登录".to_string());
        }
        if response.status() == reqwest::StatusCode::UNPROCESSABLE_ENTITY {
            return Err("现金安全输入不完整或格式无效".to_string());
        }
        if !response.status().is_success() {
            return Err("现金安全评估暂时不可用".to_string());
        }
        response
            .json::<CashSafetyAssessment>()
            .await
            .map_err(|_| "现金安全评估响应格式无效".to_string())
    }

    async fn jinyiwei_summary(&self) -> Result<JinyiweiSummary, String> {
        self.authenticated_get("/api/v1/jinyiwei/summary", "锦衣卫调查总览")
            .await?
            .json::<JinyiweiSummary>()
            .await
            .map_err(|_| "锦衣卫调查总览响应格式无效".to_string())
    }

    async fn jinyiwei_investigations(
        &self,
        status: Option<&str>,
    ) -> Result<JinyiweiInvestigationPage, String> {
        let mut path = "/api/v1/jinyiwei/investigations?limit=50&offset=0".to_string();
        if let Some(status) = status.filter(|value| !value.trim().is_empty()) {
            if !matches!(status, "RESOLVED" | "PARTIAL" | "BLOCKED" | "UNAVAILABLE") {
                return Err("锦衣卫调查状态无效".to_string());
            }
            path.push_str("&status=");
            path.push_str(status);
        }
        self.authenticated_get(&path, "锦衣卫调查")
            .await?
            .json::<JinyiweiInvestigationPage>()
            .await
            .map_err(|_| "锦衣卫调查响应格式无效".to_string())
    }

    async fn jinyiwei_investigation(
        &self,
        investigation_id: &str,
    ) -> Result<JinyiweiInvestigationDetail, String> {
        let safe_id = investigation_id.trim();
        if safe_id.is_empty()
            || safe_id.len() > 128
            || !safe_id.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
            })
        {
            return Err("锦衣卫调查编号无效".to_string());
        }
        self.authenticated_get(
            &format!("/api/v1/jinyiwei/investigations/{safe_id}"),
            "锦衣卫调查详情",
        )
        .await?
        .json::<JinyiweiInvestigationDetail>()
        .await
        .map_err(|_| "锦衣卫调查详情响应格式无效".to_string())
    }

    async fn skill_catalog(&self) -> Result<ChaotangSkillCatalog, String> {
        self.authenticated_get("/api/v1/skills", "Skills 目录")
            .await?
            .json::<ChaotangSkillCatalog>()
            .await
            .map_err(|_| "Skills 目录响应格式无效".to_string())
    }

    async fn mcp_catalog(&self) -> Result<ChaotangMcpCatalog, String> {
        self.authenticated_get("/api/v1/mcp", "MCP 目录")
            .await?
            .json::<ChaotangMcpCatalog>()
            .await
            .map_err(|_| "MCP 目录响应格式无效".to_string())
    }

    async fn connector_catalog(&self) -> Result<ChaotangConnectorCatalog, String> {
        self.authenticated_get("/api/v1/connectors", "数据连接器目录")
            .await?
            .json::<ChaotangConnectorCatalog>()
            .await
            .map_err(|_| "数据连接器目录响应格式无效".to_string())
    }
}

#[tauri::command]
pub async fn chaotang_health(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<ChaotangHealth, String> {
    state.health().await
}

#[tauri::command]
pub async fn chaotang_readiness(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<ChaotangReadiness, String> {
    state.readiness().await
}

#[tauri::command]
pub async fn chaotang_login(
    state: tauri::State<'_, ChaotangProviderState>,
    identifier: String,
    password: String,
) -> Result<ChaotangUser, String> {
    state.login(identifier.trim(), &password).await
}

#[tauri::command]
pub async fn chaotang_register(
    state: tauri::State<'_, ChaotangProviderState>,
    username: String,
    email: String,
    password: String,
) -> Result<ChaotangUser, String> {
    state
        .register(username.trim(), email.trim(), &password)
        .await
}

#[tauri::command]
pub async fn chaotang_current_user(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<Option<ChaotangUser>, String> {
    state.current_user().await
}

#[tauri::command]
pub async fn chaotang_logout(state: tauri::State<'_, ChaotangProviderState>) -> Result<(), String> {
    state.logout().await
}

#[tauri::command]
pub async fn chaotang_dadian_overview(
    state: tauri::State<'_, ChaotangProviderState>,
    department: Option<String>,
) -> Result<DadianOverview, String> {
    state.dadian_overview(department.as_deref()).await
}

#[tauri::command]
pub async fn chaotang_daily_memorial_latest(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<Option<DailyMemorialLatest>, String> {
    state.daily_memorial_latest().await
}

#[tauri::command]
pub async fn chaotang_confirm_daily_memorial(
    state: tauri::State<'_, ChaotangProviderState>,
    input: ConfirmDailyMemorialInput,
) -> Result<ConfirmDailyMemorialResponse, String> {
    state.confirm_daily_memorial(&input).await
}

#[tauri::command]
pub async fn chaotang_decree_jobs(
    state: tauri::State<'_, ChaotangProviderState>,
    input: Option<DecreeJobListInput>,
) -> Result<DecreeJobPage, String> {
    state.decree_jobs(input.as_ref()).await
}

#[tauri::command]
pub async fn chaotang_set_decree_history_archived(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    archived: bool,
) -> Result<DecreeHistoryAnnotation, String> {
    state.set_decree_history_archived(&job_id, archived).await
}

#[tauri::command]
pub async fn chaotang_decree_job(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<DecreeJob, String> {
    state.decree_job(&job_id).await
}

#[tauri::command]
pub async fn chaotang_decree_workspace(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<DecreeWorkspace, String> {
    state.decree_workspace(&job_id).await
}

#[tauri::command]
pub async fn chaotang_fusion_capabilities(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<FusionCapabilities, String> {
    let response = state
        .authenticated_get("/api/v1/fusion-capabilities", "融合能力状态")
        .await?;
    response
        .json::<FusionCapabilities>()
        .await
        .map_err(|_| "融合能力状态格式无效".to_string())
}

#[tauri::command]
pub async fn chaotang_download_workspace_artifact(
    state: tauri::State<'_, ChaotangProviderState>,
    path: String,
) -> Result<HubuArtifactDownload, String> {
    state.download_workspace_artifact(&path).await
}

#[tauri::command]
pub async fn chaotang_save_workspace_artifact(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
    artifact_id: String,
) -> Result<crate::artifact_save::SaveResult, String> {
    // Use a fixed opaque session for both reads, never a webview-provided credential or URL.
    let session = state.require_session().await?;
    let snapshot = ChaotangProviderState {
        auth_generation: Arc::new(AtomicU64::new(0)),
        owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
        session_store: crate::session_store::SessionStore::disabled(),
        client: state.client.clone(),
        base_url: state.base_url.clone(),
        session_id: Arc::new(tokio::sync::RwLock::new(Some(session.clone()))),
    };
    let workspace = snapshot.decree_workspace(&job_id).await?;
    let artifact = artifact_for_save(&workspace, &job_id, &artifact_id)?;
    let hash = artifact
        .sha256
        .as_deref()
        .ok_or("成果摘要不可用")?
        .to_string();
    let path = artifact.download_path.as_deref().ok_or("成果下载不可用")?;
    let download = snapshot.download_workspace_artifact(path).await?;
    crate::artifact_save::verify_bytes(&download.bytes, &hash)?;
    if state.session_id.read().await.as_deref() != Some(session.as_str()) {
        return Err("账户已切换，请重新保存成果".into());
    }
    let name = artifact.display_name.clone();
    #[cfg(target_os = "windows")]
    let owner = window.hwnd().map_err(|_| "无法获取保存窗口")?.0 as isize;
    #[cfg(not(target_os = "windows"))]
    let owner = 0isize;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .run_on_main_thread(move || {
            let _ = sender.send(crate::artifact_save::choose_destination(owner, &name));
        })
        .map_err(|_| "无法打开保存窗口")?;
    let Some(destination) = receiver.await.map_err(|_| "保存窗口已关闭")?? else {
        return Ok(crate::artifact_save::SaveResult::cancelled());
    };
    // Logout/account changes during the dialog revoke the pending output. Hold the read guard
    // through reauthorization + the short disk commit so a concurrent switch cannot race it.
    let current = state.session_id.read().await;
    if current.as_deref() != Some(session.as_str()) {
        return Err("账户已切换，成果未保存".into());
    }
    let fresh_workspace = snapshot.decree_workspace(&job_id).await?;
    let fresh = artifact_for_save(&fresh_workspace, &job_id, &artifact_id)?;
    if fresh.sha256.as_deref() != Some(hash.as_str())
        || fresh.version != artifact.version
        || fresh.download_path != artifact.download_path
    {
        return Err("成果版本已变化，请重新保存".into());
    }
    let saved = tokio::task::spawn_blocking(move || {
        crate::artifact_save::atomic_save(&destination, &download.bytes, &hash)
    })
    .await
    .map_err(|_| "保存任务中断")?;
    drop(current);
    saved
}

#[tauri::command]
pub async fn chaotang_cancel_decree_job(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<DecreeJob, String> {
    state.cancel_decree_job(&job_id).await
}

#[tauri::command]
pub async fn chaotang_retry_decree_job(
    state: tauri::State<'_, ChaotangProviderState>,
    job_id: String,
) -> Result<DecreeJob, String> {
    state.retry_decree_job(&job_id).await
}

#[tauri::command]
pub async fn chaotang_chancellor_consult(
    state: tauri::State<'_, ChaotangProviderState>,
    messages: Vec<ChancellorConsultMessage>,
) -> Result<ChancellorConsultResponse, String> {
    state.chancellor_consult(&messages).await
}

#[tauri::command]
pub async fn chaotang_chancellor_draft(
    state: tauri::State<'_, ChaotangProviderState>,
    input: ChancellorDraftInput,
) -> Result<ChancellorDraftResponse, String> {
    state.chancellor_draft(&input).await
}

#[tauri::command]
pub async fn chaotang_issue_chancellor_decree(
    state: tauri::State<'_, ChaotangProviderState>,
    input: IssueChancellorDecreeInput,
) -> Result<AcceptedDecree, String> {
    if input.idempotency_key.trim().is_empty() || input.idempotency_key.len() > 128 {
        return Err("幂等键格式无效".to_string());
    }
    state.issue_chancellor_decree(&input).await
}

#[tauri::command]
pub async fn chaotang_junjichu_cases(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<Vec<JunjichuCase>, String> {
    state.junjichu_cases().await
}

#[tauri::command]
pub async fn chaotang_junjichu_case(
    state: tauri::State<'_, ChaotangProviderState>,
    case_id: String,
) -> Result<JunjichuCase, String> {
    state.junjichu_case(&case_id).await
}

#[tauri::command]
pub async fn chaotang_shiguan_archives(
    state: tauri::State<'_, ChaotangProviderState>,
    archive_type: Option<String>,
    limit: Option<u64>,
) -> Result<Vec<ShiguanArchive>, String> {
    state
        .shiguan_archives(archive_type.as_deref(), limit.unwrap_or(50))
        .await
}

#[tauri::command]
pub async fn chaotang_shiguan_archive(
    state: tauri::State<'_, ChaotangProviderState>,
    archive_id: String,
) -> Result<ShiguanArchive, String> {
    state.shiguan_archive(&archive_id).await
}

#[tauri::command]
pub async fn chaotang_shiguan_review(
    state: tauri::State<'_, ChaotangProviderState>,
    archive_id: String,
    status: String,
    reviewed_at: String,
    note: Option<String>,
) -> Result<ShiguanReviewStatus, String> {
    state
        .shiguan_review(&archive_id, &status, &reviewed_at, note.as_deref())
        .await
}

#[tauri::command]
pub async fn chaotang_shiguan_decision(
    state: tauri::State<'_, ChaotangProviderState>,
    archive_id: String,
    decision: String,
) -> Result<ShiguanArchiveDecision, String> {
    state.shiguan_decision(&archive_id, &decision).await
}

#[tauri::command]
pub async fn chaotang_shiguan_statistics(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<ShiguanStatistics, String> {
    state.shiguan_statistics().await
}

#[tauri::command]
pub async fn chaotang_shiguan_outcomes_overview(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<serde_json::Value, String> {
    state.shiguan_outcomes_overview().await
}

#[tauri::command]
pub async fn chaotang_shiguan_create_outcome(
    state: tauri::State<'_, ChaotangProviderState>,
    archive_id: String,
    payload: OutcomeCreateCommand,
) -> Result<serde_json::Value, String> {
    state.shiguan_create_outcome(&archive_id, payload).await
}

#[tauri::command]
pub async fn chaotang_candidate_history(
    state: tauri::State<'_, ChaotangProviderState>,
    experiment_id: String,
) -> Result<serde_json::Value, String> {
    state.candidate_history(&experiment_id).await
}
#[tauri::command]
pub async fn chaotang_append_candidate_event(
    state: tauri::State<'_, ChaotangProviderState>,
    experiment_id: String,
    payload: CandidateCommand,
) -> Result<serde_json::Value, String> {
    state.append_candidate_event(&experiment_id, payload).await
}

#[tauri::command]
pub async fn chaotang_runtime_rehearsal_history(
    state: tauri::State<'_, ChaotangProviderState>,
    experiment_id: String,
) -> Result<serde_json::Value, String> {
    state.runtime_rehearsal_history(&experiment_id).await
}

#[tauri::command]
pub async fn chaotang_append_runtime_rehearsal_event(
    state: tauri::State<'_, ChaotangProviderState>,
    experiment_id: String,
    payload: RuntimeRehearsalCommand,
) -> Result<serde_json::Value, String> {
    state
        .append_runtime_rehearsal_event(&experiment_id, payload)
        .await
}

#[tauri::command]
pub async fn chaotang_hanlin_experiment(
    state: tauri::State<'_, ChaotangProviderState>,
    experiment_id: String,
) -> Result<serde_json::Value, String> {
    state.hanlin_experiment(&experiment_id).await
}

#[tauri::command]
pub async fn chaotang_shiguan_recall(
    state: tauri::State<'_, ChaotangProviderState>,
    matter_type: Option<String>,
    department: Option<String>,
    limit: Option<u64>,
) -> Result<Vec<ShiguanRecallMatch>, String> {
    state
        .shiguan_recall(
            matter_type.as_deref(),
            department.as_deref(),
            limit.unwrap_or(10),
        )
        .await
}

#[tauri::command]
pub async fn chaotang_qintian_forecasts(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<Vec<QintianForecast>, String> {
    state.qintian_forecasts().await
}

#[tauri::command]
pub async fn chaotang_qintian_consult(
    state: tauri::State<'_, ChaotangProviderState>,
    messages: Vec<QintianConsultMessage>,
) -> Result<QintianConsultResponse, String> {
    state.qintian_consult(&messages).await
}

#[tauri::command]
pub async fn chaotang_qintian_forecast(
    state: tauri::State<'_, ChaotangProviderState>,
    forecast_id: String,
) -> Result<QintianForecast, String> {
    state.qintian_forecast(&forecast_id).await
}

#[tauri::command]
pub async fn chaotang_qintian_pending_triggers(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<Vec<QintianPendingTrigger>, String> {
    state.qintian_pending_triggers().await
}

#[tauri::command]
pub async fn chaotang_create_qintian_forecast(
    state: tauri::State<'_, ChaotangProviderState>,
    input: serde_json::Value,
) -> Result<QintianForecast, String> {
    state.create_qintian_forecast(&input).await
}

#[tauri::command]
pub async fn chaotang_review_qintian_forecast(
    state: tauri::State<'_, ChaotangProviderState>,
    forecast_id: String,
    input: serde_json::Value,
) -> Result<QintianReview, String> {
    state.review_qintian_forecast(&forecast_id, &input).await
}

#[tauri::command]
pub async fn chaotang_hubu_work_products(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<Vec<HubuWorkProductSummary>, String> {
    state.hubu_work_products().await
}

#[tauri::command]
pub async fn chaotang_hubu_work_product(
    state: tauri::State<'_, ChaotangProviderState>,
    artifact_id: String,
) -> Result<HubuWorkProduct, String> {
    state.hubu_work_product(&artifact_id).await
}

#[tauri::command]
pub async fn chaotang_hubu_download_artifact(
    state: tauri::State<'_, ChaotangProviderState>,
    artifact_id: String,
) -> Result<HubuArtifactDownload, String> {
    state.hubu_download_artifact(&artifact_id).await
}

#[tauri::command]
pub async fn chaotang_hubu_confirm_artifact(
    state: tauri::State<'_, ChaotangProviderState>,
    artifact_id: String,
    decision: String,
    structured_reason: String,
) -> Result<HubuWorkProduct, String> {
    state
        .hubu_confirm_artifact(&artifact_id, &decision, &structured_reason)
        .await
}

#[tauri::command]
pub async fn chaotang_cash_safety_evaluate(
    state: tauri::State<'_, ChaotangProviderState>,
    input: serde_json::Value,
) -> Result<CashSafetyAssessment, String> {
    state.cash_safety_evaluate(&input).await
}

#[tauri::command]
pub async fn chaotang_jinyiwei_summary(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<JinyiweiSummary, String> {
    state.jinyiwei_summary().await
}

#[tauri::command]
pub async fn chaotang_jinyiwei_investigations(
    state: tauri::State<'_, ChaotangProviderState>,
    status: Option<String>,
) -> Result<JinyiweiInvestigationPage, String> {
    state.jinyiwei_investigations(status.as_deref()).await
}

#[tauri::command]
pub async fn chaotang_jinyiwei_investigation(
    state: tauri::State<'_, ChaotangProviderState>,
    investigation_id: String,
) -> Result<JinyiweiInvestigationDetail, String> {
    state.jinyiwei_investigation(&investigation_id).await
}

#[tauri::command]
pub async fn chaotang_skill_catalog(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<ChaotangSkillCatalog, String> {
    state.skill_catalog().await
}

#[tauri::command]
pub async fn chaotang_mcp_catalog(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<ChaotangMcpCatalog, String> {
    state.mcp_catalog().await
}

#[tauri::command]
pub async fn chaotang_connector_catalog(
    state: tauri::State<'_, ChaotangProviderState>,
) -> Result<ChaotangConnectorCatalog, String> {
    state.connector_catalog().await
}

#[cfg(test)]
mod tests {

    fn candidate_fixture() -> serde_json::Value {
        serde_json::json!({"action":"APPROVE","expected_revision":0,"idempotency_key":"retry-key-123","snapshot_digest":format!("sha256:{}","a".repeat(64)),"evaluation_digest":format!("sha256:{}","b".repeat(64)),"reason":"reviewed"})
    }
    #[test]
    fn candidate_ledger_rejects_unknown_fields_and_invalid_bounds() {
        let valid = candidate_fixture();
        for action in [
            "APPROVE",
            "REJECT",
            "ENABLE",
            "CHECK_HEALTH",
            "DEGRADE",
            "ROLLBACK",
        ] {
            let mut v = valid.clone();
            v["action"] = action.into();
            serde_json::from_value::<CandidateCommand>(v)
                .unwrap()
                .validate()
                .unwrap();
        }
        for key in ["owner", "runtime", "publish", "url"] {
            let mut v = valid.clone();
            v[key] = true.into();
            assert!(serde_json::from_value::<CandidateCommand>(v).is_err());
        }
        for (key, value) in [
            ("action", serde_json::json!("PUBLISH")),
            ("expected_revision", serde_json::json!(-1)),
            ("expected_revision", serde_json::json!(true)),
            ("expected_revision", serde_json::json!(0.5)),
            ("expected_revision", serde_json::json!(1001)),
            ("idempotency_key", serde_json::json!("../outside")),
            ("snapshot_digest", serde_json::json!("bad")),
            ("evaluation_digest", serde_json::json!("sha256:bad")),
            ("reason", serde_json::json!(" ")),
            ("reason", serde_json::json!("x".repeat(2001))),
        ] {
            let mut v = valid.clone();
            v[key] = value;
            assert!(
                serde_json::from_value::<CandidateCommand>(v)
                    .map_err(|e| e.to_string())
                    .and_then(|p| p.validate())
                    .is_err(),
                "{key}"
            );
        }
    }
    #[tokio::test]
    async fn candidate_ledger_authenticated_get_post_preserve_contract() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = advisory_state(
            format!("http://{}", listener.local_addr().unwrap()),
            Some("fixture-session"),
        );
        let server = tokio::spawn(async move {
            for method in ["GET", "POST"] {
                let (mut stream, request) = read_test_request_capture(&listener).await;
                let request = String::from_utf8(request).unwrap();
                assert_eq!(
                    request.lines().next().unwrap(),
                    format!(
                        "{method} /api/v1/hanlin/experiments/experiment:123/candidate-events HTTP/1.1"
                    )
                );
                assert!(
                    request
                        .to_ascii_lowercase()
                        .contains("authorization: bearer fixture-session\r\n")
                );
                if method == "POST" {
                    assert_eq!(
                        serde_json::from_str::<serde_json::Value>(
                            request.split("\r\n\r\n").nth(1).unwrap()
                        )
                        .unwrap(),
                        candidate_fixture()
                    );
                }
                let body = r#"{"scope":"LOCAL_ISOLATED","runtime_health":"NOT_RUN"}"#;
                stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }
        });
        let raw = serde_json::json!({"scope":"LOCAL_ISOLATED","runtime_health":"NOT_RUN"});
        assert_eq!(
            state.candidate_history("experiment:123").await.unwrap(),
            raw
        );
        assert_eq!(
            state
                .append_candidate_event(
                    "experiment:123",
                    serde_json::from_value(candidate_fixture()).unwrap()
                )
                .await
                .unwrap(),
            raw
        );
        server.await.unwrap();
    }

    #[tokio::test]
    async fn runtime_rehearsal_authenticated_get_post_preserve_fixed_contract() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = advisory_state(
            format!("http://{}", listener.local_addr().unwrap()),
            Some("fixture-session"),
        );
        let fixture = serde_json::json!({
            "action":"RUN_DEPARTMENT",
            "expected_revision":2,
            "idempotency_key":"runtime-key-123",
            "candidate_event_digest":format!("sha256:{}","c".repeat(64)),
            "reason":"start isolated process"
        });
        let server_fixture = fixture.clone();
        let server = tokio::spawn(async move {
            for method in ["GET", "POST"] {
                let (mut stream, request) = read_test_request_capture(&listener).await;
                let request = String::from_utf8(request).unwrap();
                assert_eq!(
                    request.lines().next().unwrap(),
                    format!(
                        "{method} /api/v1/hanlin/experiments/experiment:123/runtime-rehearsal-events HTTP/1.1"
                    )
                );
                assert!(
                    request
                        .to_ascii_lowercase()
                        .contains("authorization: bearer fixture-session\r\n")
                );
                if method == "POST" {
                    assert_eq!(
                        serde_json::from_str::<serde_json::Value>(
                            request.split("\r\n\r\n").nth(1).unwrap()
                        )
                        .unwrap(),
                        server_fixture
                    );
                }
                let body = r#"{"scope":"LOCAL_PROCESS_ISOLATED","publish_allowed":false}"#;
                stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            }
        });
        let raw = serde_json::json!({
            "scope":"LOCAL_PROCESS_ISOLATED",
            "publish_allowed":false
        });
        assert_eq!(
            state
                .runtime_rehearsal_history("experiment:123")
                .await
                .unwrap(),
            raw
        );
        assert_eq!(
            state
                .append_runtime_rehearsal_event(
                    "experiment:123",
                    serde_json::from_value(fixture).unwrap()
                )
                .await
                .unwrap(),
            raw
        );
        server.await.unwrap();
    }

    #[tokio::test]
    async fn outcome_create_posts_authenticated_owner_contract() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = advisory_state(
            format!("http://{}", listener.local_addr().unwrap()),
            Some("fixture-session"),
        );
        let fixture = serde_json::json!({
            "outcome":"OBSERVING",
            "occurred_at":"2026-09-21T08:00:00-05:00",
            "idempotency_key":"outcome-key-123",
            "supersedes_event_id":null
        });
        let server_fixture = fixture.clone();
        let response_fixture = serde_json::json!({
            "event_id":"0123456789abcdef0123456789abcdef",
            "archive_id":"archive-123",
            "outcome":"OBSERVING",
            "source":"OWNER_ATTESTATION",
            "attestation":"AUTHENTICATED_OWNER_ASSERTION",
            "event_type":"RECORDED",
            "evidence_count":1,
            "archive_evidence_digest":format!("sha256:{}", "a".repeat(64)),
            "event_digest":format!("sha256:{}", "b".repeat(64))
        });
        let server_response = response_fixture.clone();
        let server = tokio::spawn(async move {
            let (mut stream, request) = read_test_request_capture(&listener).await;
            let request = String::from_utf8(request).unwrap();
            assert_eq!(
                request.lines().next().unwrap(),
                "POST /api/v1/shiguan/archives/archive-123/outcomes HTTP/1.1"
            );
            assert!(
                request
                    .to_ascii_lowercase()
                    .contains("authorization: bearer fixture-session\r\n")
            );
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(
                    request.split("\r\n\r\n").nth(1).unwrap()
                )
                .unwrap(),
                server_fixture
            );
            let body = server_response.to_string();
            stream
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(), body
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
        });
        assert_eq!(
            state
                .shiguan_create_outcome("archive-123", serde_json::from_value(fixture).unwrap())
                .await
                .unwrap(),
            response_fixture
        );
        server.await.unwrap();

        for archive_id in ["", "../outside", "archive?owner=b", "https://elsewhere/x"] {
            assert_eq!(
                state
                    .shiguan_create_outcome(
                        archive_id,
                        serde_json::from_value(serde_json::json!({
                            "outcome":"OBSERVING",
                            "occurred_at":"2026-09-21T08:00:00Z",
                            "idempotency_key":"outcome-key-456",
                            "supersedes_event_id":null
                        }))
                        .unwrap()
                    )
                    .await
                    .unwrap_err(),
                "史馆档案编号格式无效"
            );
        }
    }
    #[tokio::test]
    async fn candidate_ledger_invalid_inputs_and_missing_auth_do_not_send() {
        let state = advisory_state("http://127.0.0.1:1".into(), None);
        for id in ["", "../outside", "experiment?owner=b", "https://bad/x"] {
            assert_eq!(
                state.candidate_history(id).await.unwrap_err(),
                "实验编号无效"
            );
            assert_eq!(
                state
                    .append_candidate_event(
                        id,
                        serde_json::from_value(candidate_fixture()).unwrap()
                    )
                    .await
                    .unwrap_err(),
                "实验编号无效"
            );
        }
        assert_eq!(
            state.candidate_history("experiment_123").await.unwrap_err(),
            "请先登录朝堂账户"
        );
        assert_eq!(
            state
                .append_candidate_event(
                    "experiment_123",
                    serde_json::from_value(candidate_fixture()).unwrap()
                )
                .await
                .unwrap_err(),
            "请先登录朝堂账户"
        );
    }
    #[tokio::test]
    async fn candidate_ledger_conflict_and_late_401_redact_and_preserve_new_session() {
        for status in [409, 401] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let state = advisory_state(
                format!("http://{}", listener.local_addr().unwrap()),
                Some("session-a"),
            );
            let sessions = state.session_id.clone();
            let server = tokio::spawn(async move {
                let mut stream = read_test_request(&listener).await;
                *sessions.write().await = Some("session-b".into());
                let body = r#"{"detail":"secret-body"}"#;
                stream.write_all(format!("HTTP/1.1 {status} Error\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            });
            let err = state
                .append_candidate_event(
                    "experiment_123",
                    serde_json::from_value(candidate_fixture()).unwrap(),
                )
                .await
                .unwrap_err();
            assert!(!err.contains("secret-body"));
            if status == 409 {
                assert!(err.contains("409"));
            }
            assert_eq!(state.session_id.read().await.as_deref(), Some("session-b"));
            server.await.unwrap();
        }
    }

    fn advisory_state(base_url: String, session: Option<&str>) -> ChaotangProviderState {
        ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(std::time::Duration::from_secs(3))
                .build()
                .unwrap(),
            base_url,
            session_id: Arc::new(tokio::sync::RwLock::new(session.map(str::to_owned))),
        }
    }

    #[tokio::test]
    async fn advisory_reads_use_fixed_authenticated_get_and_preserve_raw_contract() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = advisory_state(
            format!("http://{}", listener.local_addr().unwrap()),
            Some("fixture-session"),
        );
        let raw = serde_json::json!({"advisory_only":true,"source_snapshot":{"outcome_digest":"sha256:fixture"},"by_cause":{"user_rejected":2}});
        let body = raw.to_string();
        let server = tokio::spawn(async move {
            for path in [
                "/api/v1/shiguan/outcomes/overview",
                "/api/v1/hanlin/experiments/experiment:2026.09-21",
            ] {
                let (mut stream, request) = read_test_request_capture(&listener).await;
                let request = String::from_utf8(request).unwrap();
                assert_eq!(
                    request.lines().next().unwrap(),
                    format!("GET {path} HTTP/1.1")
                );
                assert!(
                    request
                        .to_ascii_lowercase()
                        .contains("authorization: bearer fixture-session\r\n")
                );
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                stream.write_all(response.as_bytes()).await.unwrap();
            }
        });
        assert_eq!(state.shiguan_outcomes_overview().await.unwrap(), raw);
        assert_eq!(
            state
                .hanlin_experiment("experiment:2026.09-21")
                .await
                .unwrap(),
            raw
        );
        server.await.unwrap();
    }

    #[tokio::test]
    async fn advisory_reads_validate_identity_and_require_session_before_network() {
        let state = advisory_state("http://127.0.0.1:1".into(), None);
        assert_eq!(
            state.shiguan_outcomes_overview().await.unwrap_err(),
            "请先登录朝堂账户"
        );
        assert_eq!(
            state.hanlin_experiment("experiment_123").await.unwrap_err(),
            "请先登录朝堂账户"
        );
        for id in [
            "",
            "short",
            "../outside",
            "https://elsewhere/x",
            "experiment?owner=b",
            &"x".repeat(129),
        ] {
            assert_eq!(
                state.hanlin_experiment(id).await.unwrap_err(),
                "实验编号无效"
            );
        }
    }

    #[tokio::test]
    async fn advisory_reads_reject_http_failures_without_leaking_backend_body() {
        for status in [401, 404, 503] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let state = advisory_state(
                format!("http://{}", listener.local_addr().unwrap()),
                Some("fixture-session"),
            );
            let server = tokio::spawn(async move {
                let mut stream = read_test_request(&listener).await;
                let body = r#"{"detail":"secret-do-not-display"}"#;
                stream.write_all(format!("HTTP/1.1 {status} Error\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
            });
            let error = state.hanlin_experiment("experiment_123").await.unwrap_err();
            assert!(!error.contains("secret-do-not-display"));
            assert_eq!(state.session_id.read().await.is_none(), status == 401);
            server.await.unwrap();
        }
    }
    #[tokio::test]
    async fn native_history_list_encodes_search_and_pagination() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let query = "研发 &owner_id=other/+?x=1";
        let server = tokio::spawn(async move {
            let (mut stream, request) = read_test_request_capture(&listener).await;
            let text = String::from_utf8(request).unwrap();
            let first = text.lines().next().unwrap();
            assert!(first.starts_with("GET /api/v1/decree-jobs?"));
            assert!(
                text.to_ascii_lowercase()
                    .contains("authorization: bearer fixture-session")
            );
            let target = first.split_whitespace().nth(1).unwrap();
            let url = reqwest::Url::parse(&format!("http://localhost{target}")).unwrap();
            let fields: HashMap<_, _> = url.query_pairs().into_owned().collect();
            assert_eq!(fields.get("q").map(String::as_str), Some(query));
            assert_eq!(fields.get("limit").map(String::as_str), Some("20"));
            assert_eq!(fields.get("offset").map(String::as_str), Some("40"));
            assert_eq!(fields.get("archived").map(String::as_str), Some("archived"));
            assert!(!fields.contains_key("owner_id"));
            send_test_response(
                &mut stream,
                "200 OK",
                r#"{"items":[],"total":80,"limit":20,"offset":40}"#,
            )
            .await;
        });
        let state = ChaotangProviderState::from_backend_url(&format!("http://{address}")).unwrap();
        *state.session_id.write().await = Some("fixture-session".into());
        let input = DecreeJobListInput {
            q: Some(query.into()),
            limit: Some(20),
            offset: Some(40),
            archived: Some(DecreeHistoryFilter::Archived),
        };
        let result = state.decree_jobs(Some(&input)).await.unwrap();
        assert_eq!(result.offset, 40);
        assert_eq!(result.total, 80);
        server.await.unwrap();
    }

    #[tokio::test]
    async fn native_history_annotation_uses_authenticated_put_without_owner_fields() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, request) = read_test_request_capture(&listener).await;
            let text = String::from_utf8(request).unwrap();
            assert!(text.starts_with("PUT /api/v1/decree-jobs/j1/history-annotation HTTP/1.1"));
            assert!(
                text.to_ascii_lowercase()
                    .contains("authorization: bearer fixture-session")
            );
            let body: serde_json::Value =
                serde_json::from_str(text.split_once("\r\n\r\n").unwrap().1).unwrap();
            assert_eq!(body, serde_json::json!({"archived":true}));
            send_test_response(
                &mut stream,
                "200 OK",
                r#"{"job_id":"j1","history_archived":true,"updated_at":"2026-09-19T00:00:00Z"}"#,
            )
            .await;
        });
        let state = ChaotangProviderState::from_backend_url(&format!("http://{address}")).unwrap();
        *state.session_id.write().await = Some("fixture-session".into());
        assert!(
            state
                .set_decree_history_archived("../other", true)
                .await
                .is_err()
        );
        let result = state.set_decree_history_archived("j1", true).await.unwrap();
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json["jobId"], "j1");
        assert_eq!(json["historyArchived"], true);
        assert_eq!(json["updatedAt"], "2026-09-19T00:00:00Z");
        server.await.unwrap();
    }

    #[test]
    fn history_native_metadata_survives_bridge() {
        assert!(
            serde_json::from_value::<DecreeJobListInput>(serde_json::json!({"archived":"invalid"}))
                .is_err()
        );
        let legacy: DecreeJobPage =
            serde_json::from_value(serde_json::json!({"items":[],"total":0,"limit":50})).unwrap();
        assert_eq!(legacy.offset, 0);
        let page: DecreeJobPage = serde_json::from_value(serde_json::json!({
            "items":[], "total":80, "limit":50, "offset":50
        }))
        .unwrap();
        assert_eq!(serde_json::to_value(page).unwrap()["offset"], 50);
        let job: DecreeJob = serde_json::from_value(serde_json::json!({
            "job_id":"j1","state":"SUCCEEDED","stage":"complete","attempt_count":1,
            "provider_request_count":0,"cancel_requested":false,"created_at":"now","updated_at":"now",
            "history_archived":true
        })).unwrap();
        assert_eq!(serde_json::to_value(job).unwrap()["historyArchived"], true);
    }

    #[test]
    fn approved_draft_survives_job_bridge_with_nested_camel_case() {
        let mut raw = serde_json::json!({"job_id":"job","state":"SUCCEEDED","stage":"complete","attempt_count":1,"provider_request_count":0,"cancel_requested":false,"created_at":"now","updated_at":"now"});
        let old: DecreeJob = serde_json::from_value(raw.clone()).unwrap();
        assert!(
            serde_json::to_value(old)
                .unwrap()
                .get("approvedDraft")
                .is_none()
        );
        raw["approved_draft"] = serde_json::json!({"status":"ready","version":2,"fingerprint":"fp","understanding":"goal","expert_example":"example","recommendation_reason":"reason","assumptions":[],"revision_prompt":"revise","decree_text":"original","draft":{"objective":"goal","scope":[],"exclusions":[],"input_materials":["input"],"material_gaps":[],"key_questions":[],"departments":[{"department":"工部","bureaus":["技术司"],"role":"delivery","reason":"r","responsibility":"review","expected_output":"report"}],"execution_steps":[],"deliverables":[],"completion_criteria":["accepted"],"permissions_and_limits":["read only"],"current_status":"ready"}});
        let job: DecreeJob = serde_json::from_value(raw).unwrap();
        let json = serde_json::to_value(job).unwrap();
        assert_eq!(json["approvedDraft"]["version"], 2);
        assert_eq!(
            json["approvedDraft"]["draft"]["inputMaterials"],
            serde_json::json!(["input"])
        );
        assert_eq!(
            json["approvedDraft"]["draft"]["departments"][0]["expectedOutput"],
            "report"
        );
        assert!(
            json["approvedDraft"]["draft"]
                .get("input_materials")
                .is_none()
        );
    }

    #[tokio::test]
    async fn stale_unauthorized_responses_preserve_the_new_login() {
        for mode in [
            "current_user",
            "current_user_success",
            "get",
            "decode",
            "overview",
            "logout",
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let (observed, received) = tokio::sync::oneshot::channel();
            let (release, released) = tokio::sync::oneshot::channel();
            let server = tokio::spawn(async move {
                let mut old_request = read_test_request(&listener).await;
                observed.send(()).unwrap();
                let mut login = read_test_request(&listener).await;
                send_test_response(&mut login, "200 OK", new_session_response()).await;
                released.await.unwrap();
                let (status, body) = match mode {
                    "logout" => ("200 OK", ""),
                    "current_user_success" => (
                        "200 OK",
                        r#"{"id":"old-user","username":"old-user","email":"old@example.invalid"}"#,
                    ),
                    _ => ("401 Unauthorized", ""),
                };
                send_test_response(&mut old_request, status, body).await;
            });
            let state = ChaotangProviderState {
                auth_generation: Arc::new(AtomicU64::new(0)),
                owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
                session_store: crate::session_store::SessionStore::disabled(),
                client: reqwest::Client::builder().no_proxy().build().unwrap(),
                base_url: format!("http://{address}"),
                session_id: Arc::new(tokio::sync::RwLock::new(Some("old-session".into()))),
            };
            let old = state.clone();
            let pending = tokio::spawn(async move {
                match mode {
                    "current_user" | "current_user_success" => {
                        assert!(old.current_user().await.is_err())
                    }
                    "get" => assert!(old.authenticated_get("/test", "test").await.is_err()),
                    "decode" => assert!(old.chancellor_consult(&[]).await.is_err()),
                    "logout" => assert!(old.logout().await.is_ok()),
                    _ => assert!(old.dadian_overview(None).await.is_err()),
                }
            });
            received.await.unwrap();
            assert_eq!(
                state.login("new-user", "fixture-only").await.unwrap().id,
                "new-user"
            );
            release.send(()).unwrap();
            pending.await.unwrap();
            server.await.unwrap();
            assert_eq!(
                state.session_id.read().await.as_deref(),
                Some("new-session"),
                "{mode}"
            );
        }
    }

    #[tokio::test]
    async fn logout_requires_a_successful_http_receipt() {
        for (status, accepted) in [
            ("200 OK", true),
            ("204 No Content", true),
            ("401 Unauthorized", false),
            ("403 Forbidden", false),
            ("500 Internal Server Error", false),
            ("503 Service Unavailable", false),
        ] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let mut request = read_test_request(&listener).await;
                send_test_response(&mut request, status, "").await;
            });
            let state = ChaotangProviderState {
                auth_generation: Arc::new(AtomicU64::new(0)),
                owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
                session_store: crate::session_store::SessionStore::disabled(),
                client: reqwest::Client::builder().no_proxy().build().unwrap(),
                base_url: format!("http://{address}"),
                session_id: Arc::new(tokio::sync::RwLock::new(Some("test-session".into()))),
            };
            let result = state.logout().await;
            assert_eq!(result.is_ok(), accepted, "{status}");
            if !accepted {
                assert!(result.unwrap_err().contains("后端未确认退出"));
            }
            assert!(state.session_id.read().await.is_none(), "{status}");
            server.await.unwrap();
        }
    }

    #[tokio::test]
    async fn late_login_cannot_resurrect_a_logged_out_session() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (observed, received) = tokio::sync::oneshot::channel();
        let (release, released) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let mut login = read_test_request(&listener).await;
            observed.send(()).unwrap();
            released.await.unwrap();
            send_test_response(&mut login, "200 OK", new_session_response()).await;
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::builder().no_proxy().build().unwrap(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(None)),
        };
        let old = state.clone();
        let pending = tokio::spawn(async move { old.login("new-user", "fixture-only").await });
        received.await.unwrap();
        state.logout().await.unwrap();
        release.send(()).unwrap();
        assert!(pending.await.unwrap().is_err());
        server.await.unwrap();
        assert!(state.session_id.read().await.is_none());
    }

    fn new_session_response() -> &'static str {
        r#"{"user":{"id":"new-user","username":"new-user","email":"fixture@example.invalid"},"session_id":"new-session"}"#
    }

    async fn send_test_response(stream: &mut tokio::net::TcpStream, status: &str, body: &str) {
        stream.write_all(format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await.unwrap();
    }

    #[tokio::test]
    async fn proxy_pollution_subprocess_child() {
        let mode = std::env::var("CHAOTANG_PROXY_FIXTURE_CHILD").unwrap_or_default();
        if mode == "default" {
            let state = ChaotangProviderState::from_environment().unwrap();
            assert_eq!(state.base_url, DEFAULT_BASE_URL);
            return;
        }
        if mode != "loopback" {
            return;
        }
        let state = ChaotangProviderState::from_environment().unwrap();
        assert_eq!(
            state.login("new-user", "fixture-only").await.unwrap().id,
            "new-user"
        );
    }

    #[tokio::test]
    async fn loopback_login_bypasses_polluted_proxy_environment() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let closed_proxy = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let proxy = format!("http://{}", closed_proxy.local_addr().unwrap());
        drop(closed_proxy);
        let server = tokio::spawn(async move {
            let mut login = read_test_request(&listener).await;
            send_test_response(&mut login, "200 OK", new_session_response()).await;
        });
        let mut child = tokio::process::Command::new(std::env::current_exe().unwrap());
        child
            .args([
                "--exact",
                "chaotang_provider::tests::proxy_pollution_subprocess_child",
                "--nocapture",
            ])
            .kill_on_drop(true)
            .env("CHAOTANG_PROXY_FIXTURE_CHILD", "loopback")
            .env("CHAOTANG_BACKEND_BASE_URL", format!("http://{address}"))
            .env_remove("REQUEST_METHOD");
        for key in [
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "http_proxy",
            "https_proxy",
            "all_proxy",
        ] {
            child.env(key, &proxy);
        }
        child.env("NO_PROXY", "").env("no_proxy", "");
        let result = tokio::time::timeout(Duration::from_secs(12), child.output())
            .await
            .unwrap()
            .unwrap();
        if !result.status.success() {
            server.abort();
        }
        assert!(
            result.status.success(),
            "isolated proxy test failed: {}",
            String::from_utf8_lossy(&result.stdout)
        );
        server.await.unwrap();
    }

    #[test]
    fn native_save_requires_job_owned_published_hashed_artifact() {
        let mut workspace: DecreeWorkspace = serde_json::from_value(serde_json::json!({
            "job_id":"j1","agents_available":false,"agents":[],"sources":[],
            "artifacts":[{"id":"a1","display_name":"报告.md","kind":"md","state":"published",
              "download_path":"/api/v1/fusion-artifacts/a1/download","sha256":"a".repeat(64),"version":1}]
        })).unwrap();
        assert!(artifact_for_save(&workspace, "j1", "a1").is_ok());
        assert!(artifact_for_save(&workspace, "j2", "a1").is_err());
        assert!(artifact_for_save(&workspace, "j1", "other").is_err());
        workspace.artifacts[0].download_path =
            Some("/api/v1/fusion-artifacts/other/download".into());
        assert!(artifact_for_save(&workspace, "j1", "a1").is_err());
        workspace.artifacts[0].download_path = Some("https://evil.invalid/file".into());
        assert!(artifact_for_save(&workspace, "j1", "a1").is_err());
        workspace.artifacts[0].download_path = Some("/api/v1/fusion-artifacts/a1/download".into());
        workspace.artifacts[0].state = "draft".into();
        assert!(artifact_for_save(&workspace, "j1", "a1").is_err());
        workspace.artifacts[0].state = "published".into();
        workspace.artifacts[0].sha256 = None;
        assert!(artifact_for_save(&workspace, "j1", "a1").is_err());
    }

    #[test]
    fn legacy_metadata_response_remains_readable() {
        let job: DecreeJob = serde_json::from_value(serde_json::json!({
            "job_id":"old","state":"SUCCEEDED","stage":"complete","attempt_count":1,
            "provider_request_count":0,"cancel_requested":false,"created_at":"now","updated_at":"now"
        })).unwrap();
        assert!(job.title.is_none());
        assert!(job.decree_text.is_none());
        let artifact: WorkspaceArtifact = serde_json::from_value(serde_json::json!({
            "id":"old","display_name":"report.xlsx","kind":"xlsx","state":"published"
        }))
        .unwrap();
        assert!(artifact.sha256.is_none());
        assert!(artifact.version.is_none());
    }

    #[test]
    fn completion_metadata_survives_native_bridge() {
        let job: DecreeJob = serde_json::from_value(serde_json::json!({
            "job_id":"j1","state":"SUCCEEDED","stage":"complete","attempt_count":1,
            "provider_request_count":0,"cancel_requested":false,"result":null,"error":null,
            "created_at":"now","updated_at":"now","title":"验收报告","decree_text":"整理材料",
            "draft_fingerprint":"fp1","reply_id":"r1","runtime_attempt_id":"a1","retry_of_job_id":"j0"
        })).unwrap();
        let json = serde_json::to_value(job).unwrap();
        assert_eq!(json["title"], "验收报告");
        assert_eq!(json["decreeText"], "整理材料");
        assert_eq!(json["draftFingerprint"], "fp1");
        assert_eq!(json["replyId"], "r1");
        assert_eq!(json["runtimeAttemptId"], "a1");
        assert_eq!(json["retryOfJobId"], "j0");
        let artifact: WorkspaceArtifact = serde_json::from_value(serde_json::json!({
            "id":"a1","display_name":"report.md","kind":"md","state":"PUBLISHED",
            "sha256":"abc","version":2
        }))
        .unwrap();
        assert_eq!(serde_json::to_value(artifact).unwrap()["sha256"], "abc");
    }

    #[test]
    fn workspace_download_rejects_external_and_traversal_paths() {
        for path in [
            "https://evil.test/file",
            "//evil.test/file",
            "/api/v1/report-artifacts/../download",
            "/api/v1/report-artifacts/%2e%2e/download",
            "/api/v1/report-artifacts/id/download?x=1",
            "/api/v1/auth/me",
            "/api/v1/report-artifacts/ id/download",
        ] {
            assert!(safe_workspace_download_path(path).is_err(), "{path}");
        }
        assert!(safe_workspace_download_path("/api/v1/report-artifacts/test-1/download").is_ok());
        assert!(safe_workspace_download_path("/api/v1/fusion-artifacts/test-1/download").is_ok());
    }

    #[test]
    fn workspace_maps_snake_case_contract_for_webview() {
        let data: DecreeWorkspace = serde_json::from_value(serde_json::json!({
            "job_id":"j1", "agents_available":false,"agents":[],
            "artifacts":[{"id":"a","display_name":"report.md","kind":"md","state":"PUBLISHED","download_path":"/api/v1/fusion-artifacts/a/download"}],
            "sources":[{"id":"s","title":"approved instruction","kind":"instruction","content":"test"}]
        })).unwrap();
        let json = serde_json::to_value(data).unwrap();
        assert_eq!(json["jobId"], "j1");
        assert_eq!(json["agentsAvailable"], false);
        assert_eq!(json["artifacts"][0]["displayName"], "report.md");
    }

    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    async fn read_test_request(listener: &tokio::net::TcpListener) -> tokio::net::TcpStream {
        read_test_request_capture(listener).await.0
    }

    async fn read_test_request_capture(
        listener: &tokio::net::TcpListener,
    ) -> (tokio::net::TcpStream, Vec<u8>) {
        tokio::time::timeout(Duration::from_secs(3), async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            loop {
                let mut chunk = [0u8; 4096];
                let count = stream.read(&mut chunk).await.unwrap();
                assert!(count > 0, "test client closed before sending its request");
                request.extend_from_slice(&chunk[..count]);
                assert!(
                    request.len() <= 65536,
                    "test request exceeded fixture limit"
                );
                if let Some(end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                    let headers = std::str::from_utf8(&request[..end]).unwrap();
                    let length = headers
                        .lines()
                        .filter_map(|line| line.split_once(':'))
                        .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
                        .map(|(_, value)| value.trim().parse::<usize>().unwrap())
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            // Closing a Windows socket with unread request bytes resets the connection.
            (stream, request)
        })
        .await
        .expect("local HTTP fixture did not receive a complete request")
    }

    #[test]
    fn defaults_to_cloud_backend() {
        let result = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "chaotang_provider::tests::proxy_pollution_subprocess_child",
            ])
            .env("CHAOTANG_PROXY_FIXTURE_CHILD", "default")
            .env_remove("CHAOTANG_BACKEND_BASE_URL")
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "default environment subprocess failed"
        );
    }

    #[tokio::test]
    async fn accepts_the_backend_health_contract() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"status":"ok","service":"chaotang-os-backend","version":"1.0.0"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(None)),
        };
        let health = state.health().await.unwrap();

        assert_eq!(health.status, "ok");
        assert_eq!(health.service, "chaotang-os-backend");
        assert_eq!(health.version, "1.0.0");
    }

    #[tokio::test]
    async fn login_keeps_the_opaque_session_in_native_state() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"user":{"id":"user-1","username":"test","email":"test@example.com"},"session_id":"native-only-session"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(None)),
        };

        let user = state.login("test", "password").await.unwrap();
        assert_eq!(user.username, "test");
        assert_eq!(
            state.session_id.read().await.as_deref(),
            Some("native-only-session")
        );
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn persisted_session_restores_current_user_and_logout_removes_it() {
        let root = std::env::temp_dir().join(format!(
            "chaotang-provider-session-restart-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let store = crate::session_store::SessionStore::for_test(&root);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut login, request) = read_test_request_capture(&listener).await;
            assert!(
                String::from_utf8(request)
                    .unwrap()
                    .starts_with("POST /api/v1/auth/login ")
            );
            send_test_response(
                &mut login,
                "200 OK",
                r#"{"user":{"id":"user-1","username":"test","email":"test@example.com"},"session_id":"opaque-native-session-123456"}"#,
            )
            .await;

            let (mut current, request) = read_test_request_capture(&listener).await;
            let request = String::from_utf8(request).unwrap();
            assert!(request.starts_with("GET /api/v1/auth/me "));
            assert!(
                request
                    .to_ascii_lowercase()
                    .contains("authorization: bearer opaque-native-session-123456\r\n")
            );
            send_test_response(
                &mut current,
                "200 OK",
                r#"{"id":"user-1","username":"test","email":"test@example.com"}"#,
            )
            .await;

            let (mut logout, request) = read_test_request_capture(&listener).await;
            let request = String::from_utf8(request).unwrap();
            assert!(request.starts_with("POST /api/v1/auth/logout "));
            assert!(
                request
                    .to_ascii_lowercase()
                    .contains("authorization: bearer opaque-native-session-123456\r\n")
            );
            send_test_response(&mut logout, "200 OK", "").await;
        });

        let first = ChaotangProviderState::from_backend_url_with_store(
            &format!("http://{address}"),
            store.clone(),
        )
        .unwrap();
        assert_eq!(first.login("test", "password").await.unwrap().id, "user-1");
        drop(first);

        let restarted = ChaotangProviderState::from_backend_url_with_store(
            &format!("http://{address}"),
            store.clone(),
        )
        .unwrap();
        assert_eq!(
            restarted.current_user().await.unwrap().unwrap().username,
            "test"
        );
        restarted.logout().await.unwrap();
        assert_eq!(store.load(), None);
        server.await.unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn restored_session_is_removed_after_backend_unauthorized() {
        let root = std::env::temp_dir().join(format!(
            "chaotang-provider-session-unauthorized-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let store = crate::session_store::SessionStore::for_test(&root);
        store.save("opaque-expired-session-123456").unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut current, request) = read_test_request_capture(&listener).await;
            let request = String::from_utf8(request).unwrap();
            assert!(request.starts_with("GET /api/v1/auth/me "));
            assert!(
                request
                    .to_ascii_lowercase()
                    .contains("authorization: bearer opaque-expired-session-123456\r\n")
            );
            send_test_response(&mut current, "401 Unauthorized", "").await;
        });
        let restarted = ChaotangProviderState::from_backend_url_with_store(
            &format!("http://{address}"),
            store.clone(),
        )
        .unwrap();
        assert!(restarted.current_user().await.unwrap().is_none());
        assert_eq!(store.load(), None);
        server.await.unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn dadian_overview_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"reply_count":1,"department_counts":[{"department":"户部","count":1}],"recent_replies":[{"id":"reply-1","title":"月度核算","participating_departments":["户部"],"reply_conclusion":"账目已核验","reply_time":"2026-08-28T08:00:00Z","created_at":"2026-08-28T08:00:00Z","respondent":"户部尚书"}],"pending_review_count":1,"today_focus":"审阅月度核算回奏"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let overview = state.dadian_overview(None).await.unwrap();
        assert_eq!(overview.reply_count, 1);
        assert_eq!(overview.department_counts[0].department, "户部");
        assert_eq!(overview.recent_replies[0].reply_conclusion, "账目已核验");

        let webview_value = serde_json::to_value(overview).unwrap();
        assert_eq!(webview_value["replyCount"], 1);
        assert_eq!(webview_value["pendingReviewCount"], 1);
        assert!(webview_value.get("reply_count").is_none());
    }

    #[tokio::test]
    async fn readiness_preserves_backend_codes_when_not_ready() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"codes":["provider_credential_missing"]}"#;
            let response = format!(
                "HTTP/1.1 503 Service Unavailable\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(None)),
        };

        let readiness = state.readiness().await.unwrap();
        assert!(!readiness.ready);
        assert_eq!(readiness.codes, ["provider_credential_missing"]);
    }

    #[tokio::test]
    async fn daily_memorial_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"status":"READY_FOR_REVIEW","draft":{"id":"0123456789abcdef0123456789abcdef","report_date":"2026-08-28","source_window_start":"2026-08-27T00:00:00+08:00","source_window_end":"2026-08-28T00:00:00+08:00","version":1,"fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bureau_result_count":39,"ministry_result_count":6,"content":"今日奏报正文","fact_refs":["fact-1"]},"memorial_id":null,"failure_code":null}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let latest = state.daily_memorial_latest().await.unwrap().unwrap();
        assert_eq!(latest.status, "READY_FOR_REVIEW");
        assert_eq!(latest.draft.as_ref().unwrap().bureau_result_count, 39);

        let webview_value = serde_json::to_value(latest).unwrap();
        assert_eq!(webview_value["draft"]["reportDate"], "2026-08-28");
        assert_eq!(webview_value["draft"]["ministryResultCount"], 6);
        assert!(webview_value["draft"].get("report_date").is_none());
    }

    #[tokio::test]
    async fn shiguan_archive_list_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"[{"id":"archive-1","type":"REPLY","title":"核算回奏","content":"完整正文","matter_type":"月度核算","department":"户部","source_kind":"DECREE","source_text":"核验账目","participating_departments":["户部"],"reply_process":"户部办理","reply_conclusion":"账目无误","reply_time":"2026-08-28T08:00:00Z","respondent":"户部尚书","created_at":"2026-08-28T08:00:00Z","review_status":{"status":"OBSERVING","reviewed_at":"2026-08-28T09:00:00Z","note":null}}]"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let archives = state.shiguan_archives(Some("REPLY"), 50).await.unwrap();
        assert_eq!(archives[0].archive_type, "REPLY");
        assert_eq!(archives[0].reply_conclusion.as_deref(), Some("账目无误"));

        let webview_value = serde_json::to_value(&archives[0]).unwrap();
        assert_eq!(webview_value["archiveType"], "REPLY");
        assert_eq!(
            webview_value["reviewStatus"]["reviewedAt"],
            "2026-08-28T09:00:00Z"
        );
        assert!(webview_value.get("review_status").is_none());
    }

    #[tokio::test]
    async fn qintian_forecast_list_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"items":[{"id":"forecast-1","created_at":"2026-08-28T08:00:00Z","subject":{"kind":"REPLY","id":"reply-1","title":"市场研判","content":"回奏正文"},"question":"未来一月风险如何","judgment":"基准情景可控","confidence":"MEDIUM","confidence_basis":"证据有限","status":"COMPLETED","review_at":"2026-09-28T08:00:00Z","methodology_version":"qintianjian-v1","scenarios":[{"kind":"OPTIMISTIC","summary":"向好","impact":"正面","time_window":"一月","counterfactual":"需求回落"},{"kind":"BASELINE","summary":"平稳","impact":"中性","time_window":"一月","counterfactual":"成本上升"},{"kind":"PESSIMISTIC","summary":"承压","impact":"负面","time_window":"一月","counterfactual":"需求收缩"}],"assumptions":[{"statement":"政策稳定","critical":true}],"triggers":[{"id":"trigger-1","signal":"需求","threshold":"下降10%","window":"30天","review_at":"2026-09-28T08:00:00Z","status":"PENDING"}],"reviews":[],"human_signoff_required":true,"disclaimer":"仅供决策参考"}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let forecasts = state.qintian_forecasts().await.unwrap();
        assert_eq!(forecasts[0].scenarios.len(), 3);
        assert_eq!(forecasts[0].confidence, "MEDIUM");

        let webview_value = serde_json::to_value(&forecasts[0]).unwrap();
        assert_eq!(webview_value["methodologyVersion"], "qintianjian-v1");
        assert_eq!(webview_value["scenarios"][0]["timeWindow"], "一月");
        assert!(webview_value.get("created_at").is_none());
    }

    #[tokio::test]
    async fn hubu_work_product_list_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"items":[{"artifact_id":"0123456789abcdef0123456789abcdef","work_product_id":"work-product-1","run_id":"run-1","reply_id":"reply-1","capability_id":"accounting-report","version":1,"work_status":"READY_FOR_HUMAN_CONFIRMATION","confirmation_status":"PENDING","artifact_state":"PUBLISHED","decision":"审阅管理报告","content_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","created_at":"2026-08-28T08:00:00Z","confirmation_receipt_count":0}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let products = state.hubu_work_products().await.unwrap();
        assert_eq!(products[0].artifact_state, "PUBLISHED");
        assert_eq!(products[0].confirmation_status, "PENDING");

        let webview_value = serde_json::to_value(&products[0]).unwrap();
        assert_eq!(
            webview_value["artifactId"],
            "0123456789abcdef0123456789abcdef"
        );
        assert_eq!(webview_value["confirmationReceiptCount"], 0);
        assert!(webview_value.get("artifact_id").is_none());
    }

    #[tokio::test]
    async fn hubu_download_returns_verified_bytes_to_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = b"PK\x03\x04verified-xlsx";
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(response.as_bytes()).await.unwrap();
            stream.write_all(body).await.unwrap();
            stream.shutdown().await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let artifact_id = "0123456789abcdef0123456789abcdef";
        let download = state.hubu_download_artifact(artifact_id).await.unwrap();
        assert_eq!(download.file_name, format!("{artifact_id}.xlsx"));
        assert_eq!(download.bytes, b"PK\x03\x04verified-xlsx");

        let webview_value = serde_json::to_value(download).unwrap();
        assert_eq!(webview_value["fileName"], format!("{artifact_id}.xlsx"));
        assert!(webview_value.get("file_name").is_none());
    }

    #[tokio::test]
    async fn hubu_confirmation_maps_append_only_receipt_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"artifact_id":"0123456789abcdef0123456789abcdef","work_product_id":"wp-1","version":1,"run_id":"run-1","reply_id":"reply-1","capability_id":"accounting-management-report","work_status":"READY_FOR_HUMAN_CONFIRMATION","confirmation_status":"CONFIRMED","artifact_state":"PUBLISHED","decision":"报告可发布","facts":[],"assumptions":[],"recommendations":[],"evidence_used":[],"missing_evidence":[],"conflicts":[],"risk_register":[],"artifact_manifest":[],"artifact_gate":{"status":"PASSED","reason_codes":[],"missing_kinds":[],"unexpected_kinds":[]},"content_digest":"sha256:digest","created_at":"2026-08-28T08:00:00Z","confirmation_receipts":[{"sequence":1,"decision":"CONFIRMED","structured_reason":"勾稽检查通过","created_at":"2026-08-28T09:00:00Z"}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let result = state
            .hubu_confirm_artifact(
                "0123456789abcdef0123456789abcdef",
                "CONFIRMED",
                "勾稽检查通过",
            )
            .await
            .unwrap();
        assert_eq!(result.confirmation_status, "CONFIRMED");
        assert_eq!(result.confirmation_receipts.len(), 1);
        assert_eq!(result.artifact_gate.status, "PASSED");

        let webview_value = serde_json::to_value(result).unwrap();
        assert_eq!(webview_value["confirmationStatus"], "CONFIRMED");
        assert_eq!(webview_value["artifactGate"]["status"], "PASSED");
        assert_eq!(webview_value["confirmationReceipts"][0]["sequence"], 1);
    }

    #[tokio::test]
    async fn cash_safety_evaluation_maps_zero_effect_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"kind":"hubu.cash-safety-assessment.v1","risk_level":"WATCH","runway_state":"CALCULATED","available_cash":"85000.00","monthly_net_burn":"10000.00","runway_months":"8.50","forecast_ending_cash":"74000.00","daily_forecast":[{"forecast_date":"2026-08-29","ending_cash":"85000.00"}],"check_codes":["INPUT_VALID"],"evidence_links":["bank-statement-1"],"missing_evidence_codes":[],"risk_reason_codes":["RUNWAY_BELOW_12_MONTHS"],"recommendations":[{"code":"PROTECT_LIQUIDITY","title":"保护流动性","action":"暂停非必要支出"},{"code":"VERIFY_MOVEMENTS","title":"核验计划动作","action":"复核未来现金动作"},{"code":"MONITOR_RUNWAY","title":"跟踪 runway","action":"每周重新评估"}],"rule_version":"hubu-cash-safety-v1","external_effects":"NONE","payment_executed":false,"ledger_posted":false,"persistence_status":"PERSISTED","artifact_id":"artifact-1","work_product_id":"work-product-1","work_status":"READY_FOR_HUMAN_CONFIRMATION","confirmation_status":"PENDING"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let result = state
            .cash_safety_evaluate(&serde_json::json!({"kind": "hubu.cash-safety-review.v1"}))
            .await
            .unwrap();
        assert_eq!(result.risk_level, "WATCH");
        assert_eq!(result.recommendations.len(), 3);
        assert_eq!(result.external_effects, "NONE");
        assert!(!result.payment_executed);
        assert!(!result.ledger_posted);
        assert_eq!(result.persistence_status, "PERSISTED");
        assert_eq!(result.artifact_id.as_deref(), Some("artifact-1"));

        let webview_value = serde_json::to_value(result).unwrap();
        assert_eq!(webview_value["riskLevel"], "WATCH");
        assert_eq!(webview_value["dailyForecast"][0]["endingCash"], "85000.00");
        assert!(webview_value.get("risk_level").is_none());
    }

    #[tokio::test]
    async fn jinyiwei_summary_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"total_investigations":3,"resolved_count":1,"partial_count":1,"blocked_count":1,"unavailable_count":0,"distinct_evidence_count":5,"pending_adoption_count":2,"confirmed_adoption_count":1}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let summary = state.jinyiwei_summary().await.unwrap();
        assert_eq!(summary.total_investigations, 3);
        assert_eq!(summary.distinct_evidence_count, 5);

        let webview_value = serde_json::to_value(summary).unwrap();
        assert_eq!(webview_value["totalInvestigations"], 3);
        assert_eq!(webview_value["pendingAdoptionCount"], 2);
        assert!(webview_value.get("total_investigations").is_none());
    }

    #[tokio::test]
    async fn skill_catalog_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"items":[{"skill_id":"consult","version":"1.0.0","agent_id":"chancellor","layer":"chancellor","source":"chancellor_runtime","purpose":"Consult","enabled":true,"allowed_services":["consult_model"],"forbidden_actions":["execute"],"allowed_entrypoints":["POST /api/v1/chancellor-consult"]}],"total":1,"enabled_count":1,"disabled_count":0,"layer_counts":{"chancellor":1,"council":0,"ministry":0,"bureau":0}}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let catalog = state.skill_catalog().await.unwrap();
        assert_eq!(catalog.items[0].skill_id, "consult");
        let webview_value = serde_json::to_value(catalog).unwrap();
        assert_eq!(webview_value["enabledCount"], 1);
        assert_eq!(
            webview_value["items"][0]["allowedServices"][0],
            "consult_model"
        );
        assert!(webview_value.get("enabled_count").is_none());
    }

    #[tokio::test]
    async fn mcp_catalog_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"servers":[{"server_id":"westock","display_name":"腾讯自选股","transport":"STREAMABLE_HTTP","source_kind":"PROFESSIONAL_DATA","access_policy":"SERVICE_AUTHENTICATED_FREE","enabled":true,"approval_version":"v1","health":"NOT_PROBED","tools":[{"tool_name":"data_quote","enabled":true,"effect":"READ_ONLY","approval_version":"v1","resolver_only":false,"fact_categories":["MARKET_QUOTE"],"data_scopes":["EXTERNAL_PUBLIC"],"jurisdictions":["CN"],"priority":20}]}],"server_count":1,"tool_count":1,"enabled_tool_count":1}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let catalog = state.mcp_catalog().await.unwrap();
        assert_eq!(catalog.servers[0].tools[0].effect, "READ_ONLY");
        let webview_value = serde_json::to_value(catalog).unwrap();
        assert_eq!(webview_value["serverCount"], 1);
        assert_eq!(webview_value["servers"][0]["serverId"], "westock");
        assert!(webview_value.get("server_count").is_none());
    }

    #[tokio::test]
    async fn connector_catalog_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"items":[{"connector_id":"public-api:wikidata_entity_search","display_name":"wikidata_entity_search","kind":"PUBLIC_API","publisher":"Wikidata","enabled":true,"access_policy":"FREE_PUBLIC_NO_CREDENTIALS","credential_status":"NOT_REQUIRED","sync_mode":"ON_DEMAND","last_sync_at":null,"categories":["ENTITY_REFERENCE"],"coverage":["GLOBAL"],"quality_ceiling":"SECONDARY","health":"NOT_PROBED"}],"total":1,"enabled_count":1,"credential_free_count":1}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let catalog = state.connector_catalog().await.unwrap();
        assert_eq!(catalog.items[0].credential_status, "NOT_REQUIRED");
        let webview_value = serde_json::to_value(catalog).unwrap();
        assert_eq!(webview_value["credentialFreeCount"], 1);
        assert_eq!(
            webview_value["items"][0]["connectorId"],
            "public-api:wikidata_entity_search"
        );
        assert!(webview_value.get("credential_free_count").is_none());
    }

    #[tokio::test]
    async fn chancellor_draft_maps_backend_contract_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"status":"DRAFT_READY","version":2,"fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","understanding":"建设桌面工作台","expert_example":"先形成可审阅交付物","recommendation_reason":"需要中书省统筹","assumptions":[],"revision_prompt":"","draft":{"objective":"完成工作台","scope":["客户端"],"exclusions":[],"input_materials":["技术文档"],"material_gaps":[],"key_questions":["接口边界"],"departments":[{"department":"中书省","bureaus":["秘书省"],"role":"统筹","reason":"统一规划","responsibility":"拟旨","expected_output":"执行方案"}],"execution_steps":["接入"],"deliverables":["客户端"],"completion_criteria":["测试通过"],"permissions_and_limits":["不得越权"],"current_status":"READY"},"decree_text":"着中书省办理"}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let draft = state
            .chancellor_draft(&ChancellorDraftInput {
                messages: vec![ChancellorConsultMessage {
                    role: "user".to_string(),
                    content: "建设桌面工作台".to_string(),
                }],
                version: 2,
            })
            .await
            .unwrap();
        assert_eq!(draft.status, "DRAFT_READY");
        assert_eq!(
            draft.draft.as_ref().unwrap().departments[0].department,
            "中书省"
        );

        let webview_value = serde_json::to_value(draft).unwrap();
        assert_eq!(webview_value["decreeText"], "着中书省办理");
        assert_eq!(
            webview_value["draft"]["materialGaps"],
            serde_json::json!([])
        );
        assert!(webview_value.get("decree_text").is_none());
    }

    #[tokio::test]
    async fn issued_decree_maps_accepted_job_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"{"job_id":"job-1","state":"QUEUED","status_url":"/api/v1/decree-jobs/job-1","cancel_url":"/api/v1/decree-jobs/job-1/cancel","accepted_at":"2026-08-28T10:00:00Z","replayed":false}"#;
            let response = format!(
                "HTTP/1.1 202 Accepted\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let accepted = state
            .issue_chancellor_decree(&IssueChancellorDecreeInput {
                decree_text: "着中书省办理".to_string(),
                draft_version: 2,
                draft_fingerprint:
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
                idempotency_key: "desktop-test-key".to_string(),
            })
            .await
            .unwrap();
        assert_eq!(accepted.job_id, "job-1");

        let webview_value = serde_json::to_value(accepted).unwrap();
        assert_eq!(webview_value["statusUrl"], "/api/v1/decree-jobs/job-1");
        assert_eq!(webview_value["replayed"], false);
        assert!(webview_value.get("job_id").is_none());
    }

    #[tokio::test]
    async fn junjichu_cases_map_safe_case_fields_for_the_webview() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let mut stream = read_test_request(&listener).await;
            let body = r#"[{"id":"case-1","decree_text":"核验月度账目","departments":["户部","工部"],"status":"ARCHIVED","processing_path":["户部","工部","军机处","丞相"],"completed_ministry_opinions":[{"department":"户部","bureau_opinions":[{"bureau":"度支司","opinion":"账目相符"}],"opinion":"建议通过"}],"council_verdict":"会审通过","reply_id":"reply-1","failure_reason":null,"created_at":"2026-08-28T08:00:00Z","updated_at":"2026-08-28T09:00:00Z"}]"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });
        let state = ChaotangProviderState {
            auth_generation: Arc::new(AtomicU64::new(0)),
            owner_runtime: Arc::new(crate::fusion_owner_runtime::OwnerRuntime::default()),
            session_store: crate::session_store::SessionStore::disabled(),
            client: reqwest::Client::new(),
            base_url: format!("http://{address}"),
            session_id: Arc::new(tokio::sync::RwLock::new(Some("session-1".to_string()))),
        };

        let cases = state.junjichu_cases().await.unwrap();
        assert_eq!(cases[0].completed_ministry_opinions[0].department, "户部");
        let webview_value = serde_json::to_value(&cases[0]).unwrap();
        assert_eq!(webview_value["replyId"], "reply-1");
        assert_eq!(
            webview_value["completedMinistryOpinions"][0]["bureauOpinions"][0]["bureau"],
            "度支司"
        );
        assert!(webview_value.get("decree_text").is_none());
    }
}

#[cfg(test)]
mod fusion_transport_contract_tests {
    use super::*;
    #[test]
    fn errors_use_only_known_reasons() {
        assert_eq!(
            public_service_error(
                &serde_json::json!({"reason":"model_unavailable","message":"secret-response"})
            ),
            Some("模型服务未能返回有效结果，请检查服务后再重试")
        );
        assert_eq!(
            public_service_error(
                &serde_json::json!({"detail":{"code":"provider_budget_exceeded"}})
            ),
            Some("模型请求预算已用完，请调整预算后再继续")
        );
        assert_eq!(
            public_service_error(&serde_json::json!({"reason":"secret-response"})),
            None
        );
    }
    #[test]
    fn workspace_optional_tools_preserve_compatibility_and_camel_case() {
        let old = serde_json::json!({"job_id":"job","artifacts":[],"agents_available":false,"agents":[],"sources":[]});
        let parsed: DecreeWorkspace = serde_json::from_value(old.clone()).unwrap();
        assert!(parsed.tools.is_none());
        let mut current = old;
        current["tools"] = serde_json::json!([{"id":"t","agent_id":"a","name":"subagent","state":"failed","sequence":1,"state_reason":"execution_cancelled"}]);
        let parsed: DecreeWorkspace = serde_json::from_value(current).unwrap();
        let output = serde_json::to_value(parsed).unwrap();
        assert_eq!(output["tools"][0]["agentId"], "a");
        assert_eq!(output["tools"][0]["stateReason"], "execution_cancelled");
    }
}
