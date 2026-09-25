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
  let message =
    response.status === 401 ? '朝堂会话已失效，请重新登录' : '朝堂请求失败';
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
      if (response.status !== 401 && typeof code === 'string')
        message = messages[code];
    }
  } catch {
    /* Non-JSON error bodies are deliberately not displayed. */
  }
  return new Error(`${message}（HTTP ${response.status}）`);
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
    if (!item || typeof item !== 'object')
      throw new Error('史馆档案响应无效');
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
    method?: 'GET' | 'POST' | 'PUT',
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
    downloadWorkspaceArtifact: async (path) => {
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
      if (!response.ok) throw await responseError(response);
      return response.blob();
    },
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
      try {
        await request('/api/v1/auth/logout', {});
      } finally {
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
