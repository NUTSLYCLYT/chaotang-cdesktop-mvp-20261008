/** Pending native integration: final task-file receipts only, never chunk frames. */
export type TaskFileListInput = { jobId: string; relativePath: string };
export type TaskFileReadInput = TaskFileListInput;
export type TaskArtifactImportInput = TaskFileReadInput & {
  artifactId: string;
};
export type TaskFileEntry = {
  relativePath: string;
  name: string;
  kind: 'file' | 'directory';
  bytes: number | null;
  modifiedAt: string | null;
};
export type TaskFileList = {
  jobId: string;
  workspaceId: string;
  relativePath: string;
  entries: TaskFileEntry[];
  truncated: boolean;
};
export type TaskFileRead = {
  jobId: string;
  workspaceId: string;
  entry: TaskFileEntry;
} & (
  | {
      kind: 'text';
      sha256: string;
      text: string;
      encoding: 'utf-8';
      truncated: boolean;
    }
  | {
      kind: 'not_previewable';
      sha256: string;
      reason: 'binary' | 'unsupported_encoding';
    }
  | {
      kind: 'not_previewable';
      sha256: null;
      reason: 'too_large';
    }
);
export type TaskArtifactImport = {
  status: 'imported' | 'already_present';
  jobId: string;
  workspaceId: string;
  entry: TaskFileEntry;
  sha256: string;
  source: { artifactId: string; sha256: string; version: number };
};
export interface TaskFilesClient {
  listTaskFiles(input: TaskFileListInput): Promise<TaskFileList>;
  readTaskFile(input: TaskFileReadInput): Promise<TaskFileRead>;
  importTaskArtifact(
    input: TaskArtifactImportInput
  ): Promise<TaskArtifactImport>;
}
export type TaskFileScope = Readonly<{
  ownerId: string;
  generation: string;
  bindingId: string;
  jobId: string;
  workspaceId: string;
}>;

export class TaskFilesContractError extends Error {
  readonly code = 'TASK_FILES_CONTRACT_INVALID';
  constructor(message = '任务文件请求或回执无效，请重新读取。') {
    super(message);
    this.name = 'TaskFilesContractError';
  }
}
const fail = (): never => {
  throw new TaskFilesContractError();
};
const text = (v: unknown): string =>
  typeof v === 'string' && v.trim() ? v : fail();
const id = (v: unknown): string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v) ? v : fail();
const flag = (v: unknown): boolean => (typeof v === 'boolean' ? v : fail());
const size = (v: unknown): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail();
const hash = (v: unknown): string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) ? v : fail();
function record(
  value: unknown,
  fields: readonly string[]
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== fields.length ||
    fields.some((key) => !Object.hasOwn(v, key))
  )
    return fail();
  return v;
}
function relativePath(value: unknown, allowRoot = false): string {
  if (value === '' && allowRoot) return '';
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4096 ||
    /[\\:\x00-\x1f\x7f<>"|?*]/.test(value)
  )
    return fail();
  if (
    value
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[. ]$/.test(part) ||
          /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)
      )
  )
    return fail();
  return value;
}
export function taskFileListInput(value: unknown): TaskFileListInput {
  const v = record(value, ['jobId', 'relativePath']);
  return {
    jobId: id(v.jobId),
    relativePath: relativePath(v.relativePath, true),
  };
}
export function taskFileReadInput(value: unknown): TaskFileReadInput {
  const v = record(value, ['jobId', 'relativePath']);
  return { jobId: id(v.jobId), relativePath: relativePath(v.relativePath) };
}
export function taskArtifactImportInput(
  value: unknown
): TaskArtifactImportInput {
  const v = record(value, ['jobId', 'artifactId', 'relativePath']);
  return {
    jobId: id(v.jobId),
    artifactId: id(v.artifactId),
    relativePath: relativePath(v.relativePath),
  };
}
function entry(value: unknown): TaskFileEntry {
  const v = record(value, [
    'relativePath',
    'name',
    'kind',
    'bytes',
    'modifiedAt',
  ]);
  const path = relativePath(v.relativePath);
  if (
    v.name !== path.split('/').at(-1) ||
    (v.kind !== 'file' && v.kind !== 'directory')
  )
    return fail();
  const bytes = v.bytes === null ? null : size(v.bytes);
  if (v.kind === 'directory' && bytes !== null) return fail();
  const modifiedAt = v.modifiedAt === null ? null : text(v.modifiedAt);
  if (
    modifiedAt !== null &&
    (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(modifiedAt) ||
      !Number.isFinite(Date.parse(modifiedAt)))
  )
    return fail();
  return {
    relativePath: path,
    name: v.name as string,
    kind: v.kind,
    bytes,
    modifiedAt,
  };
}
function identity(v: Record<string, unknown>, scope: TaskFileScope) {
  if (v.jobId !== scope.jobId || v.workspaceId !== scope.workspaceId)
    return fail();
  return { jobId: id(v.jobId), workspaceId: text(v.workspaceId) };
}
export function decodeTaskFileList(
  value: unknown,
  scope: TaskFileScope,
  path: string
): TaskFileList {
  const v = record(value, [
    'jobId',
    'workspaceId',
    'relativePath',
    'entries',
    'truncated',
  ]);
  const requested = relativePath(path, true);
  if (v.relativePath !== requested || !Array.isArray(v.entries)) return fail();
  const seen = new Set<string>();
  const entries = v.entries.map((raw) => {
    const item = entry(raw);
    const parent = item.relativePath.includes('/')
      ? item.relativePath.slice(0, item.relativePath.lastIndexOf('/'))
      : '';
    if (parent !== requested || seen.has(item.relativePath)) return fail();
    seen.add(item.relativePath);
    return item;
  });
  return {
    ...identity(v, scope),
    relativePath: requested,
    entries,
    truncated: flag(v.truncated),
  };
}
export function decodeTaskFileRead(
  value: unknown,
  scope: TaskFileScope,
  path: string
): TaskFileRead {
  const kind =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>).kind
      : undefined;
  const base = ['jobId', 'workspaceId', 'entry', 'sha256', 'kind'];
  const v = record(
    value,
    kind === 'text'
      ? [...base, 'text', 'encoding', 'truncated']
      : [...base, 'reason']
  );
  const file = entry(v.entry);
  if (
    file.kind !== 'file' ||
    file.bytes === null ||
    file.relativePath !== relativePath(path)
  )
    return fail();
  const result = { ...identity(v, scope), entry: file };
  if (kind === 'text') {
    if (typeof v.text !== 'string' || v.encoding !== 'utf-8') return fail();
    const truncated = flag(v.truncated),
      previewBytes = new TextEncoder().encode(v.text).byteLength;
    if (
      previewBytes > file.bytes ||
      (!truncated && previewBytes !== file.bytes)
    )
      return fail();
    return {
      ...result,
      kind: 'text',
      sha256: hash(v.sha256),
      text: v.text,
      encoding: 'utf-8',
      truncated,
    };
  }
  if (kind !== 'not_previewable') return fail();
  if (v.reason === 'too_large') {
    if (v.sha256 !== null) return fail();
    return {
      ...result,
      kind: 'not_previewable',
      sha256: null,
      reason: 'too_large',
    };
  }
  if (v.reason !== 'binary' && v.reason !== 'unsupported_encoding')
    return fail();
  return {
    ...result,
    kind: 'not_previewable',
    sha256: hash(v.sha256),
    reason: v.reason,
  };
}
export function decodeTaskArtifactImport(
  value: unknown,
  scope: TaskFileScope,
  input: TaskArtifactImportInput
): TaskArtifactImport {
  const requested = taskArtifactImportInput(input);
  const v = record(value, [
    'status',
    'jobId',
    'workspaceId',
    'entry',
    'sha256',
    'source',
  ]);
  const file = entry(v.entry),
    source = record(v.source, ['artifactId', 'sha256', 'version']);
  if (
    requested.jobId !== scope.jobId ||
    file.kind !== 'file' ||
    file.bytes === null ||
    file.relativePath !== requested.relativePath ||
    source.artifactId !== requested.artifactId ||
    (v.status !== 'imported' && v.status !== 'already_present')
  )
    return fail();
  const sha256 = hash(v.sha256),
    sourceHash = hash(source.sha256),
    version = size(source.version);
  if (sha256 !== sourceHash || version < 1) return fail();
  return {
    ...identity(v, scope),
    status: v.status,
    entry: file,
    sha256,
    source: { artifactId: requested.artifactId, sha256: sourceHash, version },
  };
}

/** Exact codes only: all unrecognized native/permission/transport failures stay errors. */
export function taskFilesError(error: unknown): {
  kind: 'unlinked' | 'unprovisioned' | 'unsupported' | 'error';
  message: string;
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '任务文件操作失败，请重试。';
  if (message === 'OWNER_BINDING_NOT_FOUND')
    return { kind: 'unlinked', message: '技术工作区尚未关联。' };
  if (message === 'TASK_FILES_UNPROVISIONED')
    return { kind: 'unprovisioned', message: '当前任务的文件目录尚未建立。' };
  if (message === 'TASK_FILES_UNSUPPORTED')
    return { kind: 'unsupported', message: '当前客户端暂不支持任务文件。' };
  return { kind: 'error', message };
}

export type TaskFileScopeTicket = Readonly<{ scope: TaskFileScope }>;
export type TaskFileSettlement<T> =
  | { status: 'accepted'; value: T }
  | { status: 'discarded' }
  | { status: 'error'; error: unknown };
export function createTaskFileScopeGate(initial: TaskFileScope) {
  const snapshot = (value: TaskFileScope): TaskFileScope =>
    Object.freeze({
      ownerId: text(value.ownerId),
      generation: text(value.generation),
      bindingId: text(value.bindingId),
      jobId: id(value.jobId),
      workspaceId: text(value.workspaceId),
    });
  let current = snapshot(initial),
    epoch = 0,
    disposed = false;
  const laneVersions = new Map<string, number>();
  const tickets = new WeakMap<
    TaskFileScopeTicket,
    { epoch: number; lane: string; version: number }
  >();
  const active = (ticket: TaskFileScopeTicket) => {
    const issued = tickets.get(ticket);
    return (
      !disposed &&
      issued?.epoch === epoch &&
      laneVersions.get(issued.lane) === issued.version
    );
  };
  return {
    begin(lane = 'default'): TaskFileScopeTicket {
      if (disposed) throw new TaskFilesContractError('任务文件上下文已关闭。');
      const version = (laneVersions.get(lane) ?? 0) + 1;
      laneVersions.set(lane, version);
      const ticket = Object.freeze({ scope: current });
      tickets.set(ticket, { epoch, lane, version });
      return ticket;
    },
    replace(next: TaskFileScope) {
      if (disposed) throw new TaskFilesContractError('任务文件上下文已关闭。');
      current = snapshot(next);
      epoch++;
      laneVersions.clear();
    },
    dispose() {
      disposed = true;
      epoch++;
      laneVersions.clear();
    },
    async settle<T, R>(
      ticket: TaskFileScopeTicket,
      operation: PromiseLike<T>,
      decode: (value: T) => R
    ): Promise<TaskFileSettlement<R>> {
      try {
        const value = await operation;
        if (!active(ticket)) return { status: 'discarded' };
        const result = decode(value);
        return active(ticket)
          ? { status: 'accepted', value: result }
          : { status: 'discarded' };
      } catch (error) {
        return active(ticket)
          ? { status: 'error', error }
          : { status: 'discarded' };
      }
    },
  };
}
