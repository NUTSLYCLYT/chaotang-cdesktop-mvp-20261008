export type TaskDiffInput = { jobId: string };
export type TaskDiffEntry = {
  path: string;
  oldPath: string | null;
  change:
    | 'added'
    | 'deleted'
    | 'modified'
    | 'renamed'
    | 'copied'
    | 'type_changed'
    | 'conflicted'
    | 'unreadable';
  binary: boolean;
};
export type TaskDiff = {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  state: 'not_git_repository' | 'no_baseline' | 'clean' | 'changed';
  repository: boolean;
  head: string | null;
  branch: string | null;
  entries: TaskDiffEntry[];
  patch: string;
  truncated: boolean;
};
export interface TaskDiffClient {
  taskDiff(input: TaskDiffInput): Promise<TaskDiff>;
}
export type TaskDiffScope = Readonly<{
  ownerId: string;
  generation: string;
  bindingId: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
}>;

export class TaskDiffContractError extends Error {
  readonly code = 'TASK_DIFF_CONTRACT_INVALID';
  constructor(message = '任务差异回执无效，请重新读取。') {
    super(message);
    this.name = 'TaskDiffContractError';
  }
}
const fail = (): never => {
  throw new TaskDiffContractError();
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
function relativePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 256 ||
    /[\\:\x00-\x1f\x7f<>"|?*]/.test(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    return fail();
  return value;
}
const head = (value: unknown): string =>
  typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
    ? value
    : fail();

export function taskDiffInput(value: unknown): TaskDiffInput {
  const input = record(value, ['jobId']);
  return { jobId: id(input.jobId) };
}

export function decodeTaskDiff(value: unknown, scope: TaskDiffScope): TaskDiff {
  const result = record(value, [
    'jobId',
    'workspaceId',
    'sessionId',
    'state',
    'repository',
    'head',
    'branch',
    'entries',
    'patch',
    'truncated',
  ]);
  if (
    result.jobId !== scope.jobId ||
    result.workspaceId !== scope.workspaceId ||
    result.sessionId !== scope.sessionId ||
    !Array.isArray(result.entries) ||
    result.entries.length > 40 ||
    typeof result.repository !== 'boolean' ||
    typeof result.patch !== 'string' ||
    new TextEncoder().encode(result.patch).byteLength > 10 * 1024 ||
    result.patch.includes('\0') ||
    typeof result.truncated !== 'boolean'
  )
    return fail();
  const branch = result.branch === null ? null : text(result.branch);
  if (branch !== null && branch.length > 255) return fail();
  const headValue = result.head === null ? null : head(result.head);
  const seen = new Set<string>();
  const changes = [
    'added',
    'deleted',
    'modified',
    'renamed',
    'copied',
    'type_changed',
    'conflicted',
    'unreadable',
  ];
  const entries = result.entries.map((raw): TaskDiffEntry => {
    const entry = record(raw, ['path', 'oldPath', 'change', 'binary']);
    const path = relativePath(entry.path);
    const oldPath = entry.oldPath === null ? null : relativePath(entry.oldPath);
    if (
      seen.has(path) ||
      oldPath === path ||
      !changes.includes(String(entry.change)) ||
      typeof entry.binary !== 'boolean'
    )
      return fail();
    seen.add(path);
    return {
      path,
      oldPath,
      change: entry.change as TaskDiffEntry['change'],
      binary: entry.binary,
    };
  });
  const state = result.state;
  const valid =
    (state === 'not_git_repository' &&
      !result.repository &&
      headValue === null &&
      branch === null &&
      entries.length === 0 &&
      result.patch === '' &&
      !result.truncated) ||
    (state === 'no_baseline' &&
      result.repository &&
      headValue === null &&
      entries.length === 0 &&
      result.patch === '' &&
      !result.truncated) ||
    (state === 'clean' &&
      result.repository &&
      headValue !== null &&
      entries.length === 0 &&
      result.patch === '' &&
      !result.truncated) ||
    (state === 'changed' &&
      result.repository &&
      headValue !== null &&
      entries.length > 0 &&
      (result.patch !== '' || entries.every((entry) => entry.binary)));
  if (!valid) return fail();
  return {
    jobId: id(result.jobId),
    workspaceId: uuid(result.workspaceId),
    sessionId: uuid(result.sessionId),
    state,
    repository: result.repository,
    head: headValue,
    branch,
    entries,
    patch: result.patch,
    truncated: result.truncated,
  };
}

export function taskDiffError(error: unknown): {
  kind: 'unlinked' | 'unsupported' | 'error';
  message: string;
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '任务差异读取失败，请重试。';
  if (message === 'OWNER_BINDING_NOT_FOUND')
    return { kind: 'unlinked', message: '技术工作区尚未关联。' };
  if (message === 'TASK_DIFF_UNSUPPORTED')
    return { kind: 'unsupported', message: '当前客户端暂不支持任务差异。' };
  if (message === 'TASK_DIFF_TOO_LARGE')
    return { kind: 'error', message: '任务差异过大，无法安全显示。' };
  if (message === 'TASK_DIFF_UNAVAILABLE')
    return { kind: 'error', message: '任务差异暂时无法读取。' };
  return { kind: 'error', message };
}

export type TaskDiffScopeTicket = Readonly<{ scope: TaskDiffScope }>;
export type TaskDiffSettlement<T> =
  | { status: 'accepted'; value: T }
  | { status: 'discarded' }
  | { status: 'error'; error: unknown };
export function createTaskDiffScopeGate(initial: TaskDiffScope) {
  const snapshot = (value: TaskDiffScope): TaskDiffScope =>
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
  const tickets = new WeakMap<TaskDiffScopeTicket, number>();
  const active = (ticket: TaskDiffScopeTicket) =>
    !disposed && tickets.get(ticket) === epoch;
  return {
    begin(): TaskDiffScopeTicket {
      if (disposed) throw new TaskDiffContractError('任务差异上下文已关闭。');
      const ticket = Object.freeze({ scope: current });
      tickets.set(ticket, epoch);
      return ticket;
    },
    replace(next: TaskDiffScope) {
      if (disposed) throw new TaskDiffContractError('任务差异上下文已关闭。');
      current = snapshot(next);
      epoch++;
    },
    dispose() {
      disposed = true;
      epoch++;
    },
    async settle<T, R>(
      ticket: TaskDiffScopeTicket,
      operation: PromiseLike<T>,
      decode: (value: T) => R
    ): Promise<TaskDiffSettlement<R>> {
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
