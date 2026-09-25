import { createAuthQueue } from '@/shared/lib/chaotangFusion';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ChaotangHealth {
  status: string;
  service: string;
  version: string;
  baseUrl: string;
}

export interface DecreeWorkspace {
  jobId: string;
  artifacts: Array<{
    id: string;
    displayName: string;
    kind: string;
    state: string;
    downloadPath?: string | null;
  }>;
  agentsAvailable: boolean;
  agents: Array<{
    id: string;
    parentId?: string | null;
    name: string;
    role: string;
    state: string;
    taskSummary: string;
    stateReason?: string | null;
  }>;
  tools?: Array<{
    id: string;
    agentId: string;
    name: string;
    state: 'running' | 'succeeded' | 'failed';
    sequence: number;
    stateReason?: string | null;
  }>;
  sources: Array<{
    id: string;
    title: string;
    kind: 'instruction' | 'attachment' | 'link';
    content?: string | null;
    url?: string | null;
    downloadPath?: string | null;
  }>;
}

export interface FusionCapabilities {
  execution: {
    mode: 'legacy' | 'external';
    nodeAvailable: boolean;
    hostAvailable: boolean;
    availabilityScope: 'file_presence';
  };
  networkEnabled: boolean;
  registryStatus: 'VALID' | 'INVALID';
  connectors: Array<{
    id: string;
    enabled: boolean;
    credentialStatus: 'PRESENT' | 'MISSING' | 'NOT_REQUIRED' | 'UNAVAILABLE';
    approvalRevision: string;
    approvedTools: Array<{
      id: string;
      enabled: boolean;
      approvalRevision: string;
    }>;
    probeStatus: 'UNVERIFIED';
  }>;
}

export interface WorkspaceArtifactSave {
  status: 'saved' | 'cancelled';
  path?: string;
  sha256?: string;
  bytes?: number;
}

export interface DecreeDesktopResources {
  jobId: string;
  binding: {
    bindingId: string;
    jobId: string;
    installationId: string;
    workspaceId: string;
    sessionId: string;
    resourceFingerprint: string;
    businessAttemptId: string | null;
    createdAt: string;
  };
  workspace: {
    id: string;
    name: string | null;
    branch: string;
    archived: boolean;
    useWorktree: boolean;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    id: string;
    workspaceId: string;
    name: string | null;
    executor: string | null;
    createdAt: string;
    updatedAt: string;
  };
  filesAvailable: true;
  executionAvailable: true;
  terminalAvailable: true;
  previewAvailable: true;
}

export interface ChaotangClient {
  linkDecreeWorkspace?(jobId: string): Promise<DecreeDesktopResources>;
  decreeDesktopResources?(jobId: string): Promise<DecreeDesktopResources>;
  saveWorkspaceArtifact?(
    jobId: string,
    artifactId: string
  ): Promise<WorkspaceArtifactSave>;
  fusionCapabilities?(): Promise<FusionCapabilities>;
  decreeWorkspace?(jobId: string): Promise<DecreeWorkspace>;
  downloadWorkspaceArtifact?(path: string): Promise<Blob>;

  health(): Promise<ChaotangHealth>;
  readiness(): Promise<ChaotangReadiness>;
  dadianOverview(department?: string): Promise<DadianOverview>;
  dailyMemorialLatest(): Promise<DailyMemorialLatest | null>;
  confirmDailyMemorial(
    input: ConfirmDailyMemorialInput
  ): Promise<ConfirmDailyMemorialResponse>;
  decreeJobs(input?: DecreeJobHistoryQuery): Promise<DecreeJobPage>;
  setDecreeHistoryArchived(
    jobId: string,
    archived: boolean
  ): Promise<DecreeHistoryAnnotation>;
  decreeJob(jobId: string): Promise<DecreeJob>;
  cancelDecreeJob(jobId: string): Promise<DecreeJob>;
  retryDecreeJob(jobId: string): Promise<DecreeJob>;
  chancellorConsult(
    messages: ChancellorConsultMessage[]
  ): Promise<ChancellorConsultResponse>;
  chancellorDraft(
    input: ChancellorDraftInput
  ): Promise<ChancellorDraftResponse>;
  issueChancellorDecree(
    input: IssueChancellorDecreeInput
  ): Promise<AcceptedDecree>;
  junjichuCases(): Promise<JunjichuCase[]>;
  junjichuCase(caseId: string): Promise<JunjichuCase>;
  shiguanArchives(
    archiveType?: ShiguanArchiveType,
    limit?: number
  ): Promise<ShiguanArchive[]>;
  shiguanArchive(archiveId: string): Promise<ShiguanArchive>;
  shiguanStatistics(): Promise<ShiguanStatistics>;
  shiguanRecall(input: ShiguanRecallInput): Promise<ShiguanRecallMatch[]>;
  shiguanReview(
    archiveId: string,
    input: ShiguanReviewInput
  ): Promise<ShiguanReviewStatus>;
  shiguanDecision(
    archiveId: string,
    decision: ShiguanArchiveDecisionValue
  ): Promise<ShiguanArchiveDecision>;
  qintianForecasts(): Promise<QintianForecast[]>;
  qintianConsult(
    messages: QintianConsultMessage[]
  ): Promise<QintianConsultResponse>;
  qintianForecast(forecastId: string): Promise<QintianForecast>;
  qintianPendingTriggers(): Promise<QintianPendingTrigger[]>;
  createQintianForecast(input: QintianForecastInput): Promise<QintianForecast>;
  reviewQintianForecast(
    forecastId: string,
    input: QintianReviewInput
  ): Promise<QintianReview>;
  hubuWorkProducts(): Promise<HubuWorkProductSummary[]>;
  hubuWorkProduct(artifactId: string): Promise<HubuWorkProduct>;
  hubuDownloadArtifact(artifactId: string): Promise<HubuArtifactDownload>;
  hubuConfirmArtifact(
    artifactId: string,
    decision: HubuConfirmationDecision,
    structuredReason: string
  ): Promise<HubuWorkProduct>;
  cashSafetyEvaluate(input: CashSafetyInput): Promise<CashSafetyAssessment>;
  jinyiweiSummary(): Promise<JinyiweiSummary>;
  jinyiweiInvestigations(
    status?: JinyiweiInvestigationStatus
  ): Promise<JinyiweiInvestigationPage>;
  jinyiweiInvestigation(
    investigationId: string
  ): Promise<JinyiweiInvestigationDetail>;
  skillCatalog(): Promise<ChaotangSkillCatalog>;
  mcpCatalog(): Promise<ChaotangMcpCatalog>;
  connectorCatalog(): Promise<ChaotangConnectorCatalog>;
  login(identifier: string, password: string): Promise<ChaotangUser>;
  register(
    username: string,
    email: string,
    password: string
  ): Promise<ChaotangUser>;
  currentUser(): Promise<ChaotangUser | null>;
  logout(): Promise<void>;
}

export interface ChaotangReadiness {
  ready: boolean;
  codes: string[];
}

export type DailyMemorialStatus =
  | 'PENDING'
  | 'GENERATING'
  | 'READY_FOR_REVIEW'
  | 'SKIPPED_NO_FACTS'
  | 'FAILED'
  | 'CONFIRMED';

export interface DailyMemorialDraft {
  id: string;
  reportDate: string;
  sourceWindowStart: string;
  sourceWindowEnd: string;
  version: number;
  fingerprint: string;
  bureauResultCount: number;
  ministryResultCount: number;
  content: string;
  factRefs: string[];
}

export interface DailyMemorialLatest {
  status: DailyMemorialStatus;
  draft: DailyMemorialDraft | null;
  memorialId: string | null;
  failureCode: string | null;
}
export interface ConfirmDailyMemorialInput {
  draftId: string;
  version: number;
  fingerprint: string;
}
export interface ConfirmDailyMemorialResponse {
  status: 'CONFIRMED';
  draftId: string;
  memorialId: string;
}

export type DecreeJobState =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED';

export interface DecreeJobError {
  code: string;
  stage: string;
  category: string;
}

export interface DecreeJob {
  approvedDraft?: ChancellorDraftResponse | null;
  historyArchived?: boolean;
  title?: string | null;
  decreeText?: string | null;
  draftFingerprint?: string | null;
  replyId?: string | null;
  runtimeAttemptId?: string | null;
  retryOfJobId?: string | null;
  jobId: string;
  state: DecreeJobState;
  stage: string;
  attemptCount: number;
  providerRequestCount: number;
  cancelRequested: boolean;
  result: Record<string, unknown> | null;
  error: DecreeJobError | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecreeJobPage {
  items: DecreeJob[];
  total: number;
  limit: number;
  offset: number;
}

export interface DecreeJobHistoryQuery {
  q?: string;
  limit?: number;
  offset?: number;
  archived?: 'active' | 'archived' | 'all';
}

export interface DecreeHistoryAnnotation {
  jobId: string;
  historyArchived: boolean;
  updatedAt: string | null;
}

export interface ChancellorConsultMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChancellorConsultResponse {
  status: 'ok';
  consultant: '丞相';
  reply: string;
}

export interface ChancellorDraftInput {
  messages: Array<{ role: 'user'; content: string }>;
  version: number;
}

export interface ChancellorDepartmentRecommendation {
  department: string;
  bureaus: string[];
  role: string;
  reason: string;
  responsibility: string;
  expectedOutput: string;
}

export interface ChancellorDraftEdict {
  objective: string;
  scope: string[];
  exclusions: string[];
  inputMaterials: string[];
  materialGaps: string[];
  keyQuestions: string[];
  departments: ChancellorDepartmentRecommendation[];
  executionSteps: string[];
  deliverables: string[];
  completionCriteria: string[];
  permissionsAndLimits: string[];
  currentStatus: string;
}

export interface ChancellorDraftResponse {
  status: string;
  version: number;
  fingerprint: string;
  understanding: string;
  expertExample: string;
  recommendationReason: string;
  assumptions: string[];
  revisionPrompt: string;
  draft: ChancellorDraftEdict | null;
  decreeText: string | null;
}

export interface IssueChancellorDecreeInput {
  decreeText: string;
  draftVersion: number;
  draftFingerprint: string;
  idempotencyKey: string;
}

export interface AcceptedDecree {
  jobId: string;
  state: 'QUEUED';
  statusUrl: string;
  cancelUrl: string;
  acceptedAt: string;
  replayed: boolean;
}

export type JunjichuCaseStatus =
  | 'MINISTRY_REVIEWING'
  | 'COUNCIL_REVIEWING'
  | 'CHANCELLOR_FINALIZING'
  | 'ARCHIVED'
  | 'FAILED';

export interface JunjichuBureauOpinion {
  bureau: string;
  opinion: string;
}

export interface JunjichuMinistryOpinion {
  department: string;
  bureauOpinions: JunjichuBureauOpinion[];
  opinion: string;
}

export interface JunjichuCase {
  id: string;
  decreeText: string;
  departments: string[];
  status: JunjichuCaseStatus;
  processingPath: string[];
  completedMinistryOpinions: JunjichuMinistryOpinion[];
  councilVerdict: string | null;
  replyId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ShiguanArchiveType = 'MEMORIAL' | 'REPLY';

export interface ShiguanReviewStatus {
  status: 'ACHIEVED' | 'NOT_ACHIEVED' | 'PARTIAL' | 'OBSERVING';
  reviewedAt: string;
  note: string | null;
}

export type ShiguanReviewStatusValue = ShiguanReviewStatus['status'];

export interface ShiguanReviewInput {
  status: ShiguanReviewStatusValue;
  reviewedAt: string;
  note?: string;
}

export type ShiguanArchiveDecisionValue =
  | 'APPROVED'
  | 'REJECTED'
  | 'ADOPTED'
  | 'RETURNED_FOR_RECONSIDERATION';

export interface ShiguanArchiveDecision {
  decision: ShiguanArchiveDecisionValue;
  decidedAt: string;
}

export interface ShiguanArchive {
  id: string;
  archiveType: ShiguanArchiveType;
  title: string;
  content: string;
  matterType: string;
  department: string;
  lessonsLearned: string | null;
  pitfalls: string | null;
  sourceKind: 'DECREE' | 'MEMORIAL' | null;
  sourceText: string | null;
  participatingDepartments: string[] | null;
  replyProcess: string | null;
  replyConclusion: string | null;
  replyTime: string | null;
  respondent: string | null;
  createdAt: string;
  reviewStatus: ShiguanReviewStatus | null;
  decisionStatus: ShiguanArchiveDecision | null;
}

export interface ShiguanStatistics {
  total: number;
  achieved: number;
  notAchieved: number;
  partial: number;
  observing: number;
  pendingReview: number;
  successRate: number | null;
}

export interface ShiguanRecallInput {
  matterType?: string;
  department?: string;
  limit?: number;
}

export interface ShiguanRecallMatch {
  archiveId: string;
  matchReason: string;
  historicalConclusion: string;
  evidenceLabels: string[];
  reviewStatus: ShiguanReviewStatus | null;
  lessonsLearned: string | null;
  pitfalls: string | null;
}

export interface QintianSubject {
  kind: 'DECREE' | 'DRAFT' | 'REPLY';
  id: string;
  title: string;
  content: string;
}

export interface QintianConsultMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QintianConsultResponse {
  status: 'ok';
  consultant: '钦天监';
  reply: string;
}

export interface QintianScenario {
  kind: 'OPTIMISTIC' | 'BASELINE' | 'PESSIMISTIC';
  summary: string;
  impact: string;
  timeWindow: string;
  counterfactual: string;
}

export interface QintianAssumption {
  statement: string;
  critical: boolean;
}

export interface QintianTrigger {
  id: string;
  signal: string;
  threshold: string;
  window: string;
  reviewAt: string;
  status: 'PENDING' | 'REVIEWED';
}

export interface QintianReview {
  id: string;
  forecastId: string;
  triggerId: string;
  decision: 'KEEP' | 'INVALIDATE' | 'REQUEST_RERUN' | 'ESCALATE_TO_CHANCELLOR';
  observation: string;
  judgmentInvalidated: boolean;
  createdAt: string;
}

export interface QintianForecast {
  id: string;
  createdAt: string;
  subject: QintianSubject;
  question: string;
  judgment: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceBasis: string;
  status: 'COMPLETED';
  reviewAt: string;
  methodologyVersion: string;
  scenarios: QintianScenario[];
  assumptions: QintianAssumption[];
  triggers: QintianTrigger[];
  reviews: QintianReview[];
  humanSignoffRequired: boolean;
  disclaimer: string;
}

export interface QintianPendingTrigger extends QintianTrigger {
  forecastId: string;
  forecastSummary: string;
  isDue: boolean;
  subject: QintianSubject;
  contextRef: Record<string, string>;
}
export interface QintianEvidenceRef {
  id: string;
  summary: string;
  source: string;
  asOf?: string;
}
export interface QintianForecastInput {
  idempotencyKey: string;
  subject: QintianSubject;
  question: string;
  evidenceRefs: QintianEvidenceRef[];
  reviewAt: string;
}
export interface QintianReviewInput {
  decision: QintianReview['decision'];
  triggerId: string;
  observation: string;
  judgmentInvalidated: boolean;
}

export interface HubuWorkProductSummary {
  artifactId: string;
  workProductId: string;
  runId: string;
  replyId: string | null;
  capabilityId: string;
  version: number;
  workStatus:
    | 'NEEDS_DATA'
    | 'NEEDS_REVIEW'
    | 'BLOCKED'
    | 'READY_FOR_HUMAN_CONFIRMATION'
    | 'REVISION_REQUIRED';
  confirmationStatus:
    | 'PENDING'
    | 'CONFIRMED'
    | 'REVISION_REQUIRED'
    | 'ESCALATED';
  artifactState: 'PENDING' | 'PUBLISHED' | 'ABORTED';
  decision: string;
  contentDigest: string;
  createdAt: string;
  confirmationReceiptCount: number;
}

export interface HubuConfirmationReceipt {
  sequence: number;
  decision: 'CONFIRMED' | 'REVISION_REQUIRED' | 'ESCALATED';
  structuredReason: string;
  createdAt: string;
}

export type HubuConfirmationDecision =
  | 'CONFIRMED'
  | 'REVISION_REQUIRED'
  | 'ESCALATED';

export interface HubuWorkProduct
  extends Omit<HubuWorkProductSummary, 'confirmationReceiptCount'> {
  facts: unknown[];
  assumptions: string[];
  recommendations: string[];
  evidenceUsed: string[];
  missingEvidence: string[];
  conflicts: string[];
  riskRegister: string[];
  artifactManifest: unknown[];
  artifactGate: HubuArtifactGate;
  accountingProjection: HubuAccountingProjection | null;
  shiguanArchiveId: string | null;
  confirmationReceipts: HubuConfirmationReceipt[];
}

export interface HubuArtifactGate {
  status: 'PASSED' | 'FAILED';
  reasonCodes: string[];
  missingKinds: string[];
  unexpectedKinds: string[];
}

export interface HubuAccountingControlTotal {
  name: string;
  status: string;
  actual: string | number | boolean | null;
  expected: string | number | boolean | null;
  difference: string | number | boolean | null;
  detail: string;
}

export interface HubuAccountingProjection {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  code?: string;
  reportPeriod?: string;
  overallStatus?: string;
  sheetNames?: string[];
  controlTotals?: HubuAccountingControlTotal[];
}

export interface HubuArtifactDownload {
  fileName: string;
  mimeType: string;
  bytes: number[];
}

export interface CashSafetyEvidenceAmount {
  amount: string;
  sourceReference: string | null;
  attested: boolean;
}

export interface CashSafetyMonthlyFlow {
  period: string;
  inflow: string;
  outflow: string;
  sourceReference: string | null;
  attested: boolean;
}

export interface CashSafetyScheduledMovement {
  id: string;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: string;
  dueDate: string;
  sourceReference: string | null;
  attested: boolean;
}

export interface CashSafetyInput {
  kind: 'hubu.cash-safety-review.v1';
  period: string;
  asOf: string;
  currency: 'CNY';
  balances: {
    cash: CashSafetyEvidenceAmount;
    bank: CashSafetyEvidenceAmount;
    reserved: CashSafetyEvidenceAmount;
  };
  monthlyFlows: CashSafetyMonthlyFlow[];
  scheduledMovements: CashSafetyScheduledMovement[];
}

export interface CashSafetyAssessment {
  kind: 'hubu.cash-safety-assessment.v1';
  riskLevel: 'NEEDS_EVIDENCE' | 'CRITICAL' | 'WATCH' | 'HEALTHY';
  runwayState: 'NOT_CALCULATED' | 'CALCULATED' | 'NO_NET_BURN';
  availableCash: string;
  monthlyNetBurn: string | null;
  runwayMonths: string | null;
  forecastEndingCash: string;
  dailyForecast: Array<{ forecastDate: string; endingCash: string }>;
  checkCodes: string[];
  evidenceLinks: string[];
  missingEvidenceCodes: string[];
  riskReasonCodes: string[];
  recommendations: Array<{ code: string; title: string; action: string }>;
  ruleVersion: 'hubu-cash-safety-v1';
  externalEffects: 'NONE';
  paymentExecuted: false;
  ledgerPosted: false;
  persistenceStatus: 'NOT_PERSISTED' | 'PERSISTED';
  artifactId: string | null;
  workProductId: string | null;
  workStatus: string | null;
  confirmationStatus: string | null;
}

export type JinyiweiInvestigationStatus =
  | 'RESOLVED'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'UNAVAILABLE';

export interface JinyiweiSummary {
  totalInvestigations: number;
  resolvedCount: number;
  partialCount: number;
  blockedCount: number;
  unavailableCount: number;
  distinctEvidenceCount: number;
  pendingAdoptionCount: number;
  confirmedAdoptionCount: number;
}

export interface JinyiweiInvestigationListItem {
  investigationId: string;
  requestId: string;
  requestingAgent: string;
  question: string;
  status: JinyiweiInvestigationStatus;
  startedAt: string;
  completedAt: string;
  sourceAttemptCount: number;
  evidenceCount: number;
  linkedReplyCount: number;
}

export interface JinyiweiInvestigationPage {
  items: JinyiweiInvestigationListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface JinyiweiEvidence {
  evidenceId: string;
  factKey: string;
  value: unknown;
  unit: string | null;
  asOf: string;
  publishedAt: string | null;
  retrievedAt: string;
  sourceUrl: string;
  publisher: string;
  sourceType: 'SHIGUAN' | 'MCP' | 'PUBLIC_API' | 'PUBLIC_WEB';
  coverage: string[] | null;
  licenseNote: string | null;
  quality: 'PRIMARY' | 'AUTHORITATIVE' | 'SECONDARY' | 'UNVERIFIED';
  stance: 'SUPPORTS' | 'CONTRADICTS';
  excerpt: string;
  contentHash: string;
  confidence: number;
  accessUrl: string | null;
  accessMetadata: unknown | null;
}

export interface JinyiweiAdoption {
  evidenceId: string;
  replyId: string;
  status: 'PENDING' | 'CONFIRMED';
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

export interface JinyiweiInvestigationDetail {
  packId: string;
  investigationId: string;
  status: JinyiweiInvestigationStatus;
  request: Record<string, unknown>;
  investigationPlan: Record<string, unknown>;
  evidenceByFact: Record<string, JinyiweiEvidence[]>;
  historicalEvidenceByFact: Record<string, JinyiweiEvidence[]>;
  resolvedFacts: string[];
  unresolvedFacts: string[];
  conflicts: unknown[];
  sourceAttempts: unknown[];
  investigationStartedAt: string;
  investigationCompletedAt: string;
  cache: Record<string, unknown>;
  doNotInfer: string[];
  adoptions: JinyiweiAdoption[];
}

export type ChaotangSkillLayer =
  | 'chancellor'
  | 'council'
  | 'ministry'
  | 'bureau';

export interface ChaotangSkillCatalogItem {
  skillId: string;
  version: string;
  agentId: string;
  layer: ChaotangSkillLayer;
  source: 'chancellor_runtime' | 'downstream_runtime';
  purpose: string;
  enabled: boolean;
  allowedServices: string[];
  forbiddenActions: string[];
  allowedEntrypoints: string[];
}

export interface ChaotangSkillCatalog {
  items: ChaotangSkillCatalogItem[];
  total: number;
  enabledCount: number;
  disabledCount: number;
  layerCounts: Record<ChaotangSkillLayer, number>;
}

export interface ChaotangMcpTool {
  toolName: string;
  enabled: boolean;
  effect: 'READ_ONLY';
  approvalVersion: string;
  resolverOnly: boolean;
  factCategories: string[];
  dataScopes: string[];
  jurisdictions: string[];
  priority: number;
}

export interface ChaotangMcpServer {
  serverId: string;
  displayName: string;
  transport: string;
  sourceKind: string;
  accessPolicy: string;
  enabled: boolean;
  approvalVersion: string;
  health: 'NOT_PROBED' | 'DISABLED';
  tools: ChaotangMcpTool[];
}

export interface ChaotangMcpCatalog {
  servers: ChaotangMcpServer[];
  serverCount: number;
  toolCount: number;
  enabledToolCount: number;
}

export interface ChaotangConnector {
  connectorId: string;
  displayName: string;
  kind: 'PUBLIC_API' | 'MCP';
  publisher: string;
  enabled: boolean;
  accessPolicy: string;
  credentialStatus: 'NOT_REQUIRED' | 'NOT_INSPECTED';
  syncMode: 'ON_DEMAND';
  lastSyncAt: string | null;
  categories: string[];
  coverage: string[];
  qualityCeiling: string | null;
  health: 'NOT_PROBED' | 'DISABLED';
}

export interface ChaotangConnectorCatalog {
  items: ChaotangConnector[];
  total: number;
  enabledCount: number;
  credentialFreeCount: number;
}

export interface DadianDepartmentCount {
  department: string;
  count: number;
}

export interface DadianRecentReply {
  id: string;
  title: string;
  participatingDepartments: string[];
  replyConclusion: string;
  replyTime: string;
  createdAt: string;
  respondent: string;
}

export interface DadianOverview {
  replyCount: number;
  departmentCounts: DadianDepartmentCount[];
  recentReplies: DadianRecentReply[];
  pendingReviewCount: number;
  todayFocus: string;
}

export interface ChaotangUser {
  id: string;
  username: string;
  email: string;
}

interface ChaotangProviderValue {
  health: ChaotangHealth | null;
  error: string | null;
  authError: string | null;
  isChecking: boolean;
  authGeneration: number;
  refresh(): Promise<void>;
  user: ChaotangUser | null;
  login(identifier: string, password: string): Promise<void>;
  register(username: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const ChaotangContext = createContext<ChaotangProviderValue>({
  health: null,
  error: '朝堂 Provider 未注入',
  authError: null,
  isChecking: false,
  authGeneration: 0,
  refresh: async () => undefined,
  user: null,
  login: async () => undefined,
  register: async () => undefined,
  logout: async () => undefined,
});

const ChaotangClientContext = createContext<ChaotangClient | undefined>(
  undefined
);

export function ChaotangProvider({
  client,
  children,
}: {
  client: ChaotangClient;
  children: ReactNode;
}) {
  const authGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const authQueue = useRef(createAuthQueue());
  const queryClient = useQueryClient();
  const clearAccountCache = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: ['chaotang'] });
    queryClient.removeQueries({ queryKey: ['chaotang'] });
    const mutations = queryClient.getMutationCache();
    mutations
      .getAll()
      .filter((item) => item.options.mutationKey?.[0] === 'chaotang')
      .forEach((item) => mutations.remove(item));
  }, [queryClient]);
  const [health, setHealth] = useState<ChaotangHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [authGenerationValue, setAuthGenerationValue] = useState(0);
  const [user, setUser] = useState<ChaotangUser | null>(null);

  const refresh = useCallback(async () => {
    if (authQueue.current.isPending()) return;
    const generation = authGeneration.current;
    const sequence = ++refreshSequence.current;
    const isCurrent = () =>
      generation === authGeneration.current &&
      sequence === refreshSequence.current;
    setIsChecking(true);
    try {
      const nextHealth = await client.health();
      if (!isCurrent()) return;
      setHealth(nextHealth);
      setError(null);
      const nextUser = await client.currentUser();
      if (isCurrent()) setUser(nextUser);
    } catch (cause) {
      if (!isCurrent()) return;
      setHealth(null);
      setError(cause instanceof Error ? cause.message : '朝堂后端当前不可用');
    } finally {
      if (isCurrent()) setIsChecking(false);
    }
  }, [client]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const generation = ++authGeneration.current;
      setAuthGenerationValue(generation);
      ++refreshSequence.current;
      setIsChecking(false);
      setError(null);
      setAuthError(null);
      try {
        setUser(null);
        const nextUser = await authQueue.current.run(async () => {
          await clearAccountCache();
          return client.login(identifier, password);
        });
        if (generation === authGeneration.current) setUser(nextUser);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (generation === authGeneration.current) setAuthError(message);
        throw new Error(message);
      }
    },
    [client, clearAccountCache]
  );
  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const generation = ++authGeneration.current;
      setAuthGenerationValue(generation);
      ++refreshSequence.current;
      setIsChecking(false);
      setError(null);
      setAuthError(null);
      try {
        setUser(null);
        const nextUser = await authQueue.current.run(async () => {
          await clearAccountCache();
          return client.register(username, email, password);
        });
        if (generation === authGeneration.current) setUser(nextUser);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (generation === authGeneration.current) setAuthError(message);
        throw new Error(message);
      }
    },
    [client, clearAccountCache]
  );
  const logout = useCallback(async () => {
    const generation = ++authGeneration.current;
    setAuthGenerationValue(generation);
    ++refreshSequence.current;
    setIsChecking(false);
    setError(null);
    setUser(null);
    try {
      await authQueue.current.run(async () => {
        await clearAccountCache();
        return client.logout();
      });
    } finally {
      if (generation === authGeneration.current) {
        setUser(null);
        setAuthError(null);
      }
    }
  }, [client, clearAccountCache]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The packaged Python sidecar starts concurrently with the desktop shell.
  // Retry while offline so the approved UI automatically changes to LIVE as
  // soon as the backend is ready, without requiring a reload.
  useEffect(() => {
    if (health) return;
    const retry = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(retry);
  }, [health, refresh]);

  const value = useMemo(
    () => ({
      health,
      error,
      authError,
      isChecking,
      authGeneration: authGenerationValue,
      refresh,
      user,
      login,
      register,
      logout,
    }),
    [
      authError,
      error,
      health,
      isChecking,
      authGenerationValue,
      refresh,
      user,
      login,
      register,
      logout,
    ]
  );

  return (
    <ChaotangClientContext.Provider value={client}>
      <ChaotangContext.Provider value={value}>
        {children}
      </ChaotangContext.Provider>
    </ChaotangClientContext.Provider>
  );
}

export function useChaotangProvider() {
  return useContext(ChaotangContext);
}

export function useChaotangClient() {
  const client = useContext(ChaotangClientContext);
  if (!client) {
    throw new Error('useChaotangClient must be used within ChaotangProvider');
  }
  return client;
}
