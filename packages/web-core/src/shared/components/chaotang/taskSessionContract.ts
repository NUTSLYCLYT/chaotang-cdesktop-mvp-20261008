export type TaskSessionHistoryInput = { jobId: string };
export type TaskSessionEvent = {
  eventId: string;
  kind:
    | 'setupscript'
    | 'cleanupscript'
    | 'archivescript'
    | 'codingagent'
    | 'devserver';
  state: 'running' | 'completed' | 'failed' | 'killed';
  exitCode: number | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
};
export type TaskSessionHistory = {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  entries: TaskSessionEvent[];
  truncated: boolean;
};
export interface TaskSessionClient {
  taskSessionHistory(
    input: TaskSessionHistoryInput
  ): Promise<TaskSessionHistory>;
}
export type TaskSessionScope = Readonly<{
  ownerId: string;
  generation: string;
  bindingId: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
}>;

export class TaskSessionContractError extends Error {
  readonly code = 'TASK_SESSION_CONTRACT_INVALID';
  constructor(message = '任务会话记录无效，请重新读取。') {
    super(message);
    this.name = 'TaskSessionContractError';
  }
}
const fail = (): never => {
  throw new TaskSessionContractError();
};
const text = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : fail();
const id = (value: unknown): string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
    ? value
    : fail();
const uuid = (value: unknown): string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value
    : fail();
const timestamp = (value: unknown): string => {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    return fail();
  return result;
};
function record(
  value: unknown,
  fields: readonly string[]
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(result, field))
  )
    return fail();
  return result;
}

export function taskSessionHistoryInput(
  value: unknown
): TaskSessionHistoryInput {
  const input = record(value, ['jobId']);
  return { jobId: id(input.jobId) };
}

export function decodeTaskSessionHistory(
  value: unknown,
  scope: TaskSessionScope
): TaskSessionHistory {
  const result = record(value, [
    'jobId',
    'workspaceId',
    'sessionId',
    'entries',
    'truncated',
  ]);
  if (
    result.jobId !== scope.jobId ||
    result.workspaceId !== scope.workspaceId ||
    result.sessionId !== scope.sessionId ||
    !Array.isArray(result.entries) ||
    result.entries.length > 200 ||
    typeof result.truncated !== 'boolean'
  )
    return fail();
  const seen = new Set<string>();
  const entries = result.entries.map((raw): TaskSessionEvent => {
    const event = record(raw, [
      'eventId',
      'kind',
      'state',
      'exitCode',
      'startedAt',
      'completedAt',
      'createdAt',
    ]);
    const eventId = uuid(event.eventId);
    if (
      seen.has(eventId) ||
      ![
        'setupscript',
        'cleanupscript',
        'archivescript',
        'codingagent',
        'devserver',
      ].includes(String(event.kind)) ||
      !['running', 'completed', 'failed', 'killed'].includes(
        String(event.state)
      ) ||
      (event.exitCode !== null &&
        (typeof event.exitCode !== 'number' ||
          !Number.isSafeInteger(event.exitCode)))
    )
      return fail();
    seen.add(eventId);
    const startedAt = timestamp(event.startedAt);
    const completedAt =
      event.completedAt === null ? null : timestamp(event.completedAt);
    if (completedAt !== null && Date.parse(completedAt) < Date.parse(startedAt))
      return fail();
    return {
      eventId,
      kind: event.kind as TaskSessionEvent['kind'],
      state: event.state as TaskSessionEvent['state'],
      exitCode: event.exitCode as number | null,
      startedAt,
      completedAt,
      createdAt: timestamp(event.createdAt),
    };
  });
  return {
    jobId: id(result.jobId),
    workspaceId: uuid(result.workspaceId),
    sessionId: uuid(result.sessionId),
    entries,
    truncated: result.truncated,
  };
}

export function taskSessionError(error: unknown): {
  kind: 'unlinked' | 'unsupported' | 'error';
  message: string;
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '会话记录读取失败，请重试。';
  if (message === 'OWNER_BINDING_NOT_FOUND')
    return { kind: 'unlinked', message: '技术工作区尚未关联。' };
  if (message === 'TASK_SESSION_UNSUPPORTED')
    return { kind: 'unsupported', message: '当前客户端暂不支持会话记录。' };
  return { kind: 'error', message };
}

export type TaskSessionScopeTicket = Readonly<{ scope: TaskSessionScope }>;
export type TaskSessionSettlement<T> =
  | { status: 'accepted'; value: T }
  | { status: 'discarded' }
  | { status: 'error'; error: unknown };
export function createTaskSessionScopeGate(initial: TaskSessionScope) {
  const snapshot = (value: TaskSessionScope): TaskSessionScope =>
    Object.freeze({
      ownerId: text(value.ownerId),
      generation: text(value.generation),
      bindingId: text(value.bindingId),
      jobId: id(value.jobId),
      workspaceId: uuid(value.workspaceId),
      sessionId: uuid(value.sessionId),
    });
  let current = snapshot(initial),
    epoch = 0,
    disposed = false;
  const tickets = new WeakMap<TaskSessionScopeTicket, number>();
  const active = (ticket: TaskSessionScopeTicket) =>
    !disposed && tickets.get(ticket) === epoch;
  return {
    begin(): TaskSessionScopeTicket {
      if (disposed)
        throw new TaskSessionContractError('任务会话上下文已关闭。');
      const ticket = Object.freeze({ scope: current });
      tickets.set(ticket, epoch);
      return ticket;
    },
    replace(next: TaskSessionScope) {
      if (disposed)
        throw new TaskSessionContractError('任务会话上下文已关闭。');
      current = snapshot(next);
      epoch++;
    },
    dispose() {
      disposed = true;
      epoch++;
    },
    async settle<T, R>(
      ticket: TaskSessionScopeTicket,
      operation: PromiseLike<T>,
      decode: (value: T) => R
    ): Promise<TaskSessionSettlement<R>> {
      try {
        const value = await operation;
        if (!active(ticket)) return { status: 'discarded' };
        const decoded = decode(value);
        return active(ticket)
          ? { status: 'accepted', value: decoded }
          : { status: 'discarded' };
      } catch (error) {
        return active(ticket)
          ? { status: 'error', error }
          : { status: 'discarded' };
      }
    },
  };
}
