import type { CandidateLedgerClient } from '@/shared/components/chaotang/hanlinCandidateContract';
import type { RuntimeRehearsalClient } from '@/shared/components/chaotang/hanlinRuntimeRehearsalContract';
import {
  candidateExperimentId,
  candidateCommand,
  runtimeRehearsalCommand,
} from './candidateLedgerInput.ts';
import { invoke as nativeInvoke } from '@tauri-apps/api/core';
import { TASK_FILES_COMMANDS } from './taskFilesCommands';
import { TASK_SESSION_COMMAND } from './taskSessionCommands';
import { TASK_DIFF_COMMAND } from './taskDiffCommands';
import { TASK_EXECUTION_COMMANDS } from './taskExecutionCommands';
import { TASK_TERMINAL_COMMANDS } from './taskTerminalCommands';
import {
  buildOutcomeCreateCommand,
  normalizeOutcomeArchiveId,
  type AdvisoryReadClient,
} from '@/shared/components/chaotang/hanlinOutcomeContract';
import {
  taskFileListInput,
  taskFileReadInput,
  taskArtifactImportInput,
  type TaskFilesClient,
  type TaskFileList,
  type TaskFileRead,
  type TaskArtifactImport,
} from '@/shared/components/chaotang/taskFilesContract';
import {
  taskSessionHistoryInput,
  type TaskSessionClient,
  type TaskSessionHistory,
} from '@/shared/components/chaotang/taskSessionContract';
import {
  taskDiffInput,
  type TaskDiffClient,
  type TaskDiff,
} from '@/shared/components/chaotang/taskDiffContract';
import {
  taskApprovalResponseInput,
  taskExecutionReadInput,
  taskExecutionStartInput,
  type TaskApprovalList,
  type TaskExecution,
  type TaskExecutionClient,
} from '@/shared/components/chaotang/taskExecutionContract';
import {
  taskTerminalCloseInput,
  taskTerminalReadInput,
  taskTerminalResizeInput,
  taskTerminalStartInput,
  taskTerminalWriteInput,
  type TaskTerminal,
  type TaskTerminalClient,
  type TaskTerminalRead,
} from '@/shared/components/chaotang/taskTerminalContract';
import {
  assertDesktopRuntime,
  DesktopRuntimeUnavailableError,
} from './desktopRuntimeGuard';
import type {
  ChaotangClient,
  WorkspaceArtifactSave,
  FusionCapabilities,
  DecreeWorkspace,
  DecreeDesktopResources,
  ChaotangHealth,
  ChaotangReadiness,
  ChaotangUser,
  DailyMemorialLatest,
  DecreeJobPage,
  DecreeHistoryAnnotation,
  DadianOverview,
  ShiguanArchive,
  ShiguanArchiveType,
  ShiguanRecallInput,
  ShiguanRecallMatch,
  ShiguanStatistics,
  ShiguanReviewStatus,
  ShiguanArchiveDecision,
  QintianForecast,
  QintianConsultMessage,
  QintianConsultResponse,
  QintianPendingTrigger,
  HubuWorkProduct,
  HubuWorkProductSummary,
  HubuArtifactDownload,
  JinyiweiInvestigationDetail,
  JinyiweiInvestigationPage,
  JinyiweiInvestigationStatus,
  JinyiweiSummary,
  ChaotangSkillCatalog,
  ChaotangMcpCatalog,
  ChaotangConnectorCatalog,
  CashSafetyAssessment,
  CashSafetyInput,
  ChancellorConsultMessage,
  ChancellorConsultResponse,
  ChancellorDraftInput,
  ChancellorDraftResponse,
  IssueChancellorDecreeInput,
  AcceptedDecree,
  DecreeJob,
  JunjichuCase,
  ConfirmDailyMemorialResponse,
  QintianReview,
} from '@/shared/providers/ChaotangProvider';

async function invoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  assertDesktopRuntime();
  return nativeInvoke<T>(command, args);
}

// Tauri rejects with strings; expose Error consistently to query/mutation UI.
async function courtInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (cause) {
    if (cause instanceof DesktopRuntimeUnavailableError) throw cause;
    throw new Error(
      typeof cause === 'string' ? cause : '朝堂请求失败，请检查服务状态'
    );
  }
}

export const tauriChaotangClient: ChaotangClient &
  AdvisoryReadClient &
  CandidateLedgerClient &
  RuntimeRehearsalClient &
  TaskFilesClient &
  TaskSessionClient &
  TaskDiffClient &
  TaskExecutionClient &
  TaskTerminalClient = {
  startTaskTerminal: async (input) =>
    courtInvoke<TaskTerminal>(
      TASK_TERMINAL_COMMANDS.start,
      taskTerminalStartInput(input)
    ),
  readTaskTerminal: async (input) =>
    courtInvoke<TaskTerminalRead>(
      TASK_TERMINAL_COMMANDS.read,
      taskTerminalReadInput(input)
    ),
  writeTaskTerminal: async (input) =>
    courtInvoke(TASK_TERMINAL_COMMANDS.write, taskTerminalWriteInput(input)),
  resizeTaskTerminal: async (input) =>
    courtInvoke(TASK_TERMINAL_COMMANDS.resize, taskTerminalResizeInput(input)),
  closeTaskTerminal: async (input) =>
    courtInvoke(TASK_TERMINAL_COMMANDS.close, taskTerminalCloseInput(input)),
  startTaskExecution: async (input) =>
    courtInvoke<TaskExecution>(
      TASK_EXECUTION_COMMANDS.start,
      taskExecutionStartInput(input)
    ),
  readTaskExecution: async (input) =>
    courtInvoke<TaskExecution>(
      TASK_EXECUTION_COMMANDS.read,
      taskExecutionReadInput(input)
    ),
  cancelTaskExecution: async (input) =>
    courtInvoke<TaskExecution>(
      TASK_EXECUTION_COMMANDS.cancel,
      taskExecutionReadInput(input)
    ),
  taskExecutionApprovals: async (input) =>
    courtInvoke<TaskApprovalList>(
      TASK_EXECUTION_COMMANDS.approvals,
      taskExecutionReadInput(input)
    ),
  respondTaskExecutionApproval: async (input) =>
    courtInvoke<unknown>(
      TASK_EXECUTION_COMMANDS.respondApproval,
      taskApprovalResponseInput(input)
    ),
  taskDiff: async (input) =>
    courtInvoke<TaskDiff>(TASK_DIFF_COMMAND, taskDiffInput(input)),
  taskSessionHistory: async (input) =>
    courtInvoke<TaskSessionHistory>(
      TASK_SESSION_COMMAND,
      taskSessionHistoryInput(input)
    ),
  listTaskFiles: async (input) =>
    courtInvoke<TaskFileList>(
      TASK_FILES_COMMANDS.list,
      taskFileListInput(input)
    ),
  readTaskFile: async (input) =>
    courtInvoke<TaskFileRead>(
      TASK_FILES_COMMANDS.read,
      taskFileReadInput(input)
    ),
  importTaskArtifact: async (input) =>
    courtInvoke<TaskArtifactImport>(
      TASK_FILES_COMMANDS.import,
      taskArtifactImportInput(input)
    ),
  linkDecreeWorkspace: (jobId) =>
    courtInvoke<DecreeDesktopResources>('chaotang_link_decree_workspace', {
      jobId,
    }),
  decreeDesktopResources: (jobId) =>
    courtInvoke<DecreeDesktopResources>('chaotang_decree_desktop_resources', {
      jobId,
    }),
  saveWorkspaceArtifact: (jobId, artifactId) =>
    courtInvoke<WorkspaceArtifactSave>('chaotang_save_workspace_artifact', {
      jobId,
      artifactId,
    }),
  fusionCapabilities: () =>
    courtInvoke<FusionCapabilities>('chaotang_fusion_capabilities'),
  reviewDecreeDelivery: (jobId) =>
    courtInvoke<unknown>('chaotang_review_decree_delivery', { jobId }),
  decreeWorkspace: (jobId) =>
    courtInvoke<DecreeWorkspace>('chaotang_decree_workspace', { jobId }),
  downloadWorkspaceArtifact: async (path) => {
    const artifact = await invoke<HubuArtifactDownload>(
      'chaotang_download_workspace_artifact',
      { path }
    );
    return new Blob([new Uint8Array(artifact.bytes)], {
      type: artifact.mimeType,
    });
  },
  health: () => invoke<ChaotangHealth>('chaotang_health'),
  readiness: () => invoke<ChaotangReadiness>('chaotang_readiness'),
  dadianOverview: (department) =>
    invoke<DadianOverview>('chaotang_dadian_overview', { department }),
  dailyMemorialLatest: () =>
    invoke<DailyMemorialLatest | null>('chaotang_daily_memorial_latest'),
  confirmDailyMemorial: (input) =>
    invoke<ConfirmDailyMemorialResponse>('chaotang_confirm_daily_memorial', {
      input,
    }),
  decreeJobs: (input) =>
    courtInvoke<DecreeJobPage>('chaotang_decree_jobs', { input }),
  setDecreeHistoryArchived: (jobId, archived) =>
    courtInvoke<DecreeHistoryAnnotation>(
      'chaotang_set_decree_history_archived',
      { jobId, archived }
    ),
  decreeJob: (jobId) =>
    courtInvoke<DecreeJob>('chaotang_decree_job', { jobId }),
  cancelDecreeJob: (jobId) =>
    courtInvoke<DecreeJob>('chaotang_cancel_decree_job', { jobId }),
  retryDecreeJob: (jobId) =>
    courtInvoke<DecreeJob>('chaotang_retry_decree_job', { jobId }),
  chancellorConsult: (messages: ChancellorConsultMessage[]) =>
    courtInvoke<ChancellorConsultResponse>('chaotang_chancellor_consult', {
      messages,
    }),
  chancellorDraft: (input: ChancellorDraftInput) =>
    courtInvoke<ChancellorDraftResponse>('chaotang_chancellor_draft', {
      input,
    }),
  issueChancellorDecree: (input: IssueChancellorDecreeInput) =>
    courtInvoke<AcceptedDecree>('chaotang_issue_chancellor_decree', { input }),
  junjichuCases: () => invoke<JunjichuCase[]>('chaotang_junjichu_cases'),
  junjichuCase: (caseId) =>
    invoke<JunjichuCase>('chaotang_junjichu_case', { caseId }),
  shiguanArchives: (archiveType?: ShiguanArchiveType, limit?: number) =>
    invoke<ShiguanArchive[]>('chaotang_shiguan_archives', {
      archiveType,
      limit,
    }),
  shiguanArchive: (archiveId) =>
    invoke<ShiguanArchive>('chaotang_shiguan_archive', { archiveId }),
  shiguanReview: (archiveId, input) =>
    invoke<ShiguanReviewStatus>('chaotang_shiguan_review', {
      archiveId,
      status: input.status,
      reviewedAt: input.reviewedAt,
      note: input.note,
    }),
  shiguanDecision: (archiveId, decision) =>
    invoke<ShiguanArchiveDecision>('chaotang_shiguan_decision', {
      archiveId,
      decision,
    }),
  shiguanStatistics: () =>
    invoke<ShiguanStatistics>('chaotang_shiguan_statistics'),
  candidateHistory: async (experimentId) =>
    courtInvoke<unknown>('chaotang_candidate_history', {
      experimentId: candidateExperimentId(experimentId),
    }),
  appendCandidateEvent: async (experimentId, payload) =>
    courtInvoke<unknown>('chaotang_append_candidate_event', {
      experimentId: candidateExperimentId(experimentId),
      payload: candidateCommand(payload),
    }),
  runtimeRehearsalHistory: async (experimentId) =>
    courtInvoke<unknown>('chaotang_runtime_rehearsal_history', {
      experimentId: candidateExperimentId(experimentId),
    }),
  appendRuntimeRehearsalEvent: async (experimentId, payload) =>
    courtInvoke<unknown>('chaotang_append_runtime_rehearsal_event', {
      experimentId: candidateExperimentId(experimentId),
      payload: runtimeRehearsalCommand(payload),
    }),
  shiguanOutcomesOverview: () =>
    courtInvoke<unknown>('chaotang_shiguan_outcomes_overview'),
  shiguanCreateOutcome: (archiveId, payload) =>
    courtInvoke<unknown>('chaotang_shiguan_create_outcome', {
      archiveId: normalizeOutcomeArchiveId(archiveId),
      payload: buildOutcomeCreateCommand(
        payload.outcome,
        payload.occurred_at,
        payload.idempotency_key,
        payload.supersedes_event_id
      ),
    }),
  hanlinExperiment: async (experimentId) => {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(experimentId))
      throw new Error('实验编号无效');
    return courtInvoke<unknown>('chaotang_hanlin_experiment', { experimentId });
  },
  shiguanRecall: ({ matterType, department, limit }: ShiguanRecallInput) =>
    invoke<ShiguanRecallMatch[]>('chaotang_shiguan_recall', {
      matterType,
      department,
      limit,
    }),
  qintianForecasts: () =>
    invoke<QintianForecast[]>('chaotang_qintian_forecasts'),
  qintianConsult: (messages: QintianConsultMessage[]) =>
    invoke<QintianConsultResponse>('chaotang_qintian_consult', { messages }),
  qintianForecast: (forecastId) =>
    invoke<QintianForecast>('chaotang_qintian_forecast', { forecastId }),
  qintianPendingTriggers: () =>
    invoke<QintianPendingTrigger[]>('chaotang_qintian_pending_triggers'),
  createQintianForecast: (input) =>
    invoke<QintianForecast>('chaotang_create_qintian_forecast', { input }),
  reviewQintianForecast: (forecastId, input) =>
    invoke<QintianReview>('chaotang_review_qintian_forecast', {
      forecastId,
      input,
    }),
  hubuWorkProducts: () =>
    invoke<HubuWorkProductSummary[]>('chaotang_hubu_work_products'),
  hubuWorkProduct: (artifactId) =>
    invoke<HubuWorkProduct>('chaotang_hubu_work_product', { artifactId }),
  hubuDownloadArtifact: (artifactId) =>
    invoke<HubuArtifactDownload>('chaotang_hubu_download_artifact', {
      artifactId,
    }),
  hubuConfirmArtifact: (artifactId, decision, structuredReason) =>
    invoke<HubuWorkProduct>('chaotang_hubu_confirm_artifact', {
      artifactId,
      decision,
      structuredReason,
    }),
  cashSafetyEvaluate: (input: CashSafetyInput) =>
    invoke<CashSafetyAssessment>('chaotang_cash_safety_evaluate', { input }),
  jinyiweiSummary: () => invoke<JinyiweiSummary>('chaotang_jinyiwei_summary'),
  jinyiweiInvestigations: (status?: JinyiweiInvestigationStatus) =>
    invoke<JinyiweiInvestigationPage>('chaotang_jinyiwei_investigations', {
      status,
    }),
  jinyiweiInvestigation: (investigationId) =>
    invoke<JinyiweiInvestigationDetail>('chaotang_jinyiwei_investigation', {
      investigationId,
    }),
  skillCatalog: () => invoke<ChaotangSkillCatalog>('chaotang_skill_catalog'),
  mcpCatalog: () => invoke<ChaotangMcpCatalog>('chaotang_mcp_catalog'),
  connectorCatalog: () =>
    invoke<ChaotangConnectorCatalog>('chaotang_connector_catalog'),
  login: (identifier, password) =>
    invoke<ChaotangUser>('chaotang_login', { identifier, password }),
  register: (username, email, password) =>
    invoke<ChaotangUser>('chaotang_register', { username, email, password }),
  currentUser: () => invoke<ChaotangUser | null>('chaotang_current_user'),
  logout: () => invoke('chaotang_logout'),
};
