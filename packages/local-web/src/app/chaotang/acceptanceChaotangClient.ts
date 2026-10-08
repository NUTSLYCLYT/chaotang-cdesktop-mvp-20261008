import type { CandidateLedgerClient } from '@/shared/components/chaotang/hanlinCandidateContract';
import {
  candidateExperimentId,
  candidateCommand,
  runtimeRehearsalCommand,
} from './candidateLedgerInput.ts';
import type {
  ChaotangClient,
  ChaotangUser,
  ChaotangHealth,
  ShiguanArchive,
  HubuWorkProductSummary,
  QintianForecast,
  QintianConsultMessage,
  QintianConsultResponse,
  QintianPendingTrigger,
  QintianForecastInput,
  QintianReviewInput,
} from '@/shared/providers/ChaotangProvider';
import type { TaskFilesClient } from '@/shared/components/chaotang/taskFilesContract';
import type { TaskSessionClient } from '@/shared/components/chaotang/taskSessionContract';
import type { TaskDiffClient } from '@/shared/components/chaotang/taskDiffContract';
import type { TaskExecutionClient } from '@/shared/components/chaotang/taskExecutionContract';
import {
  buildOutcomeCreateCommand,
  normalizeOutcomeArchiveId,
  type AdvisoryReadClient,
} from '@/shared/components/chaotang/hanlinOutcomeContract';
import type { RuntimeRehearsalClient } from '@/shared/components/chaotang/hanlinRuntimeRehearsalContract';

// Only fixed, locally authored copy is shown. Backend messages can contain secrets.
async function responseError(response: Response): Promise<Error> {
  const messages: Record<string, string> = {
    AUTH_STORAGE_UNAVAILABLE: '账户服务暂时不可用，请稍后重试',
    config_unavailable: '模型配置不可用，请检查服务配置',
    model_unavailable: '模型服务未能返回有效结果，请检查服务后再重试',
    provider_budget_exceeded: '模型请求预算已用完，请调整预算后再继续',
    job_not_found: '任务不存在或当前账户无权查看',
    job_unavailable: '任务服务暂时不可用，请稍后查看任务记录',
    validation_failed: '提交内容未通过校验，请检查目标与资料',
    job_retry_rejected: '当前任务不符合修复后重试条件',
    job_history_archive_rejected:
      '只有结束的任务可以归档或恢复历史记录，请刷新状态后重试',
  };
  const statusMessages: Record<number, string> = {
    401: '朝堂会话已失效，请重新登录',
    404: '记录不存在或当前账户无权查看，请返回列表刷新',
    409: '当前状态不允许此操作，请刷新并查看最新结果',
    422: '输入不完整或格式无效，请检查填写内容',
    503: '服务暂时不可用，请稍后重试；已保存的数据不会因此清除',
  };
  let message = statusMessages[response.status] ?? '朝堂请求失败';
  let safeCode: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const detail =
        record.detail && typeof record.detail === 'object'
          ? (record.detail as Record<string, unknown>)
          : {};
      const code = [
        record.reason,
        record.code,
        detail.reason,
        detail.code,
      ].find(
        (value) => typeof value === 'string' && Object.hasOwn(messages, value)
      );
      if (response.status !== 401 && typeof code === 'string') {
        message = messages[code];
        safeCode = code;
      }
    }
  } catch {
    /* Non-JSON error bodies are deliberately not displayed. */
  }
  return Object.assign(
    new Error(`${message}（HTTP ${response.status}）`),
    safeCode ? { code: safeCode } : {}
  );
}

function mapResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mapResponse);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      key === 'result' ? item : mapResponse(item),
    ])
  );
}

function normalizeShiguanArchives(value: unknown): ShiguanArchive[] {
  if (!Array.isArray(value)) throw new Error('史馆档案响应无效');
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('史馆档案响应无效');
    const record = item as Record<string, unknown>;
    // The HTTP backend calls this field `type`; the native command serializes
    // the same domain field as `archiveType`. Keep the provider contract stable
    // across the two transports instead of leaking transport names into UI.
    const archiveType = record.archiveType ?? record.type;
    if (archiveType !== 'MEMORIAL' && archiveType !== 'REPLY')
      throw new Error('史馆档案类型无效');
    return { ...record, archiveType } as unknown as ShiguanArchive;
  });
}

function resourceId(value: string, artifact = false): string {
  const id = value.trim();
  if (!(artifact ? /^[a-fA-F0-9]{32}$/ : /^[A-Za-z0-9_-]{1,128}$/).test(id))
    throw new Error('资源编号无效');
  return encodeURIComponent(id);
}

// Qintian list endpoints answer with `{ items: [...] }`. Unwrap the envelope
// but refuse anything else so a malformed payload never masquerades as [].
function unwrapListItems<T>(value: unknown): T[] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('钦天监列表响应无效');
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error('钦天监列表响应无效');
  return items as T[];
}

// Consult keeps the caller's original array; only reject histories the backend
// schema would refuse so an obviously invalid question never hits the network.
function assertQintianConsultMessages(messages: QintianConsultMessage[]): void {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20)
    throw new Error('咨询消息数量须为 1–20');
  for (const message of messages) {
    if (
      !message ||
      typeof message !== 'object' ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.length < 1 ||
      message.content.length > 4000
    )
      throw new Error('咨询消息无效');
  }
}

/** Development-only HTTP transport to the explicitly configured loopback proxy. */
export function createAcceptanceChaotangClient(
  native: ChaotangClient &
    Partial<
      TaskFilesClient & TaskSessionClient & TaskDiffClient & TaskExecutionClient
    >,
  transport: typeof fetch,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): ChaotangClient &
  AdvisoryReadClient &
  CandidateLedgerClient &
  RuntimeRehearsalClient &
  Partial<
    TaskFilesClient & TaskSessionClient & TaskDiffClient & TaskExecutionClient
  > {
  const sessionKey = 'fusion.acceptance.session';
  async function request<T>(
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH',
    preserveRaw = false
  ): Promise<T> {
    const token = storage.getItem(sessionKey);
    const response = await transport('/fusion-api' + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(90_000),
      redirect: 'error',
      credentials: 'omit',
    });
    if (!response.ok) {
      if (response.status === 401 && storage.getItem(sessionKey) === token)
        storage.removeItem(sessionKey);
      throw await responseError(response);
    }
    if (response.status === 204) return undefined as T;
    const result: unknown = await response.json();
    return (preserveRaw ? result : mapResponse(result)) as T;
  }
  async function authenticate(path: string, body: unknown) {
    storage.removeItem(sessionKey);
    const session = await request<{ user: ChaotangUser; sessionId: string }>(
      path,
      body
    );
    if (
      !session.user?.id ||
      typeof session.sessionId !== 'string' ||
      !session.sessionId
    )
      throw new Error('登录响应无效');
    storage.setItem(sessionKey, session.sessionId);
    return session.user;
  }

  async function downloadArtifact(path: string): Promise<Blob> {
    if (
      !/^\/api\/v1\/(?:report-artifacts|fusion-artifacts)\/[a-zA-Z0-9_-]+\/download$/.test(
        path
      )
    )
      throw new Error('成果下载路径无效');
    const token = storage.getItem(sessionKey);
    if (!token) throw new Error('请先登录');
    const response = await transport('/fusion-api' + path, {
      headers: { Authorization: 'Bearer ' + token },
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      if (response.status === 401 && storage.getItem(sessionKey) === token)
        storage.removeItem(sessionKey);
      throw await responseError(response);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error('成果文件为空，已拒绝下载');
    return blob;
  }
  return {
    ...native,
    // Browser handoff cannot attest to a file saved by the native runtime.
    saveWorkspaceArtifact: undefined,
    linkDecreeWorkspace: undefined,
    decreeDesktopResources: undefined,
    listTaskFiles: undefined,
    readTaskFile: undefined,
    importTaskArtifact: undefined,
    taskSessionHistory: undefined,
    taskDiff: undefined,
    startTaskExecution: undefined,
    readTaskExecution: undefined,
    cancelTaskExecution: undefined,
    taskExecutionApprovals: undefined,
    respondTaskExecutionApproval: undefined,
    fusionCapabilities: () => request('/api/v1/fusion-capabilities'),
    reviewDecreeDelivery: (id) =>
      request(
        '/api/v1/hanlin/decree-jobs/' + resourceId(id) + '/task-review',
        undefined,
        {},
        'POST',
        true
      ),
    junjichuCases: () => request('/api/v1/junjichu/cases'),
    junjichuCase: (id) => request('/api/v1/junjichu/cases/' + resourceId(id)),
    qintianForecasts: async () =>
      unwrapListItems<QintianForecast>(
        await request('/api/v1/qintianjian/forecasts')
      ),
    qintianConsult: (messages: QintianConsultMessage[]) => {
      assertQintianConsultMessages(messages);
      return request<QintianConsultResponse>('/api/v1/qintianjian/consult', {
        messages,
      });
    },
    qintianForecast: (forecastId) =>
      request('/api/v1/qintianjian/forecasts/' + resourceId(forecastId)),
    qintianPendingTriggers: async () =>
      unwrapListItems<QintianPendingTrigger>(
        await request('/api/v1/qintianjian/triggers/pending')
      ),
    createQintianForecast: (input: QintianForecastInput) =>
      request('/api/v1/qintianjian/forecasts', {
        idempotency_key: input.idempotencyKey,
        subject: input.subject,
        question: input.question,
        evidence_refs: input.evidenceRefs.map((ref) => ({
          id: ref.id,
          summary: ref.summary,
          source: ref.source,
          ...(ref.asOf === undefined ? {} : { as_of: ref.asOf }),
        })),
        review_at: input.reviewAt,
      }),
    reviewQintianForecast: (forecastId, input: QintianReviewInput) =>
      request(
        '/api/v1/qintianjian/forecasts/' + resourceId(forecastId) + '/reviews',
        {
          decision: input.decision,
          trigger_id: input.triggerId,
          observation: input.observation,
          judgment_invalidated: input.judgmentInvalidated,
        }
      ),
    dadianOverview: (department) =>
      request(
        '/api/v1/shiguan/dadian-overview' +
          (department
            ? '?' + new URLSearchParams({ department }).toString()
            : '')
      ),
    jinyiweiSummary: () => request('/api/v1/jinyiwei/summary'),
    jinyiweiInvestigations: (status) => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (status !== undefined) {
        if (!['RESOLVED', 'PARTIAL', 'BLOCKED', 'UNAVAILABLE'].includes(status))
          throw new Error('锦衣卫调查状态无效');
        params.set('status', status);
      }
      return request('/api/v1/jinyiwei/investigations?' + params.toString());
    },
    jinyiweiInvestigation: (id) =>
      request('/api/v1/jinyiwei/investigations/' + resourceId(id)),
    skillCatalog: () => request('/api/v1/skills'),
    mcpCatalog: () => request('/api/v1/mcp'),
    connectorCatalog: () => request('/api/v1/connectors'),
    cashSafetyEvaluate: (input) =>
      request('/api/v1/hubu/cash-safety/create', input),
    hubuWorkProducts: async () =>
      (
        await request<{ items: HubuWorkProductSummary[] }>(
          '/api/v1/report-artifacts?limit=50'
        )
      ).items,
    hubuWorkProduct: (id) =>
      request(
        '/api/v1/report-artifacts/' + resourceId(id, true) + '/work-product'
      ),
    hubuConfirmArtifact: (id, decision, structuredReason) =>
      request(
        '/api/v1/report-artifacts/' + resourceId(id, true) + '/confirmation',
        { decision, structured_reason: structuredReason }
      ),
    hubuDownloadArtifact: async (id) => {
      const safeId = resourceId(id, true);
      const blob = await downloadArtifact(
        '/api/v1/report-artifacts/' + safeId + '/download'
      );
      return {
        fileName: safeId + '.xlsx',
        mimeType: blob.type,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      };
    },
    shiguanArchive: async (id) =>
      normalizeShiguanArchives([
        await request('/api/v1/shiguan/archives/' + resourceId(id)),
      ])[0],
    shiguanStatistics: () => request('/api/v1/shiguan/statistics'),
    shiguanRecall: (input) =>
      request('/api/v1/shiguan/recall', {
        matter_type: input.matterType,
        department: input.department,
        limit: input.limit,
      }),
    shiguanReview: (id, input) =>
      request(
        '/api/v1/shiguan/archives/' + resourceId(id) + '/review',
        {
          status: input.status,
          reviewed_at: input.reviewedAt,
          note: input.note,
        },
        {},
        'PATCH'
      ),
    shiguanDecision: (id, decision) =>
      request(
        '/api/v1/shiguan/archives/' + resourceId(id) + '/decision',
        { decision },
        {},
        'PUT'
      ),
    shiguanArchives: (archiveType, limit = 50) => {
      if (
        archiveType !== undefined &&
        archiveType !== 'MEMORIAL' &&
        archiveType !== 'REPLY'
      )
        throw new Error('史馆档案类型无效');
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new Error('史馆档案数量须为 1–500');
      const params = new URLSearchParams();
      if (archiveType) params.set('type', archiveType);
      params.set('limit', String(limit));
      return request('/api/v1/shiguan/archives?' + params.toString()).then(
        normalizeShiguanArchives
      );
    },
    candidateHistory: async (experimentId) =>
      request(
        '/api/v1/hanlin/experiments/' +
          encodeURIComponent(candidateExperimentId(experimentId)) +
          '/candidate-events',
        undefined,
        {},
        'GET',
        true
      ),
    appendCandidateEvent: async (experimentId, payload) =>
      request(
        '/api/v1/hanlin/experiments/' +
          encodeURIComponent(candidateExperimentId(experimentId)) +
          '/candidate-events',
        candidateCommand(payload),
        {},
        'POST',
        true
      ),
    runtimeRehearsalHistory: async (experimentId) =>
      request(
        '/api/v1/hanlin/experiments/' +
          encodeURIComponent(candidateExperimentId(experimentId)) +
          '/runtime-rehearsal-events',
        undefined,
        {},
        'GET',
        true
      ),
    appendRuntimeRehearsalEvent: async (experimentId, payload) =>
      request(
        '/api/v1/hanlin/experiments/' +
          encodeURIComponent(candidateExperimentId(experimentId)) +
          '/runtime-rehearsal-events',
        runtimeRehearsalCommand(payload),
        {},
        'POST',
        true
      ),
    shiguanOutcomesOverview: () =>
      request('/api/v1/shiguan/outcomes/overview', undefined, {}, 'GET', true),
    shiguanCreateOutcome: (archiveId, payload) =>
      request(
        '/api/v1/shiguan/archives/' +
          encodeURIComponent(normalizeOutcomeArchiveId(archiveId)) +
          '/outcomes',
        buildOutcomeCreateCommand(
          payload.outcome,
          payload.occurred_at,
          payload.idempotency_key,
          payload.supersedes_event_id
        ),
        {},
        'POST',
        true
      ),
    hanlinExperiment: async (experimentId) => {
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(experimentId))
        throw new Error('实验编号无效');
      return request(
        '/api/v1/hanlin/experiments/' + encodeURIComponent(experimentId),
        undefined,
        {},
        'GET',
        true
      );
    },
    decreeWorkspace: (id) =>
      request('/api/v1/decree-jobs/' + encodeURIComponent(id) + '/workspace'),
    downloadWorkspaceArtifact: downloadArtifact,
    health: async () => ({
      ...(await request<ChaotangHealth>('/health')),
      baseUrl: '本地验收代理',
    }),
    login: (identifier, password) =>
      authenticate('/api/v1/auth/login', { identifier, password }),
    register: (username, email, password) =>
      authenticate('/api/v1/auth/register', { username, email, password }),
    currentUser: async () => {
      if (!storage.getItem(sessionKey)) return null;
      return request<ChaotangUser>('/api/v1/auth/me');
    },
    logout: async () => {
      const token = storage.getItem(sessionKey);
      try {
        await request('/api/v1/auth/logout', {});
      } finally {
        if (storage.getItem(sessionKey) === token)
          storage.removeItem(sessionKey);
      }
    },
    chancellorConsult: (messages) =>
      request('/api/v1/chancellor-consult', { messages }),
    chancellorDraft: (input) => request('/api/v1/chancellor-drafts', input),
    issueChancellorDecree: (input) =>
      request(
        '/api/v1/decrees/chancellor',
        {
          decree_text: input.decreeText,
          draft_version: input.draftVersion,
          draft_fingerprint: input.draftFingerprint,
        },
        { 'Idempotency-Key': input.idempotencyKey }
      ),
    decreeJobs: (input = {}) => {
      const params = new URLSearchParams();
      if (input.q !== undefined) params.set('q', input.q);
      if (input.limit !== undefined) params.set('limit', String(input.limit));
      if (input.offset !== undefined)
        params.set('offset', String(input.offset));
      if (input.archived !== undefined) params.set('archived', input.archived);
      return request(
        '/api/v1/decree-jobs' + (params.size ? '?' + params.toString() : '')
      );
    },
    setDecreeHistoryArchived: (id, archived) =>
      request(
        '/api/v1/decree-jobs/' + encodeURIComponent(id) + '/history-annotation',
        { archived },
        {},
        'PUT'
      ),
    decreeJob: (id) => request('/api/v1/decree-jobs/' + encodeURIComponent(id)),
    cancelDecreeJob: (id) =>
      request('/api/v1/decree-jobs/' + encodeURIComponent(id) + '/cancel', {}),
    retryDecreeJob: (id) =>
      request('/api/v1/decree-jobs/' + encodeURIComponent(id) + '/retry', {}),
  };
}
