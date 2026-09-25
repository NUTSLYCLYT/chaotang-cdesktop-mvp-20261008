export type TaskExecutionStartInput = { jobId: string; prompt: string };
export type TaskExecutionReadInput = { jobId: string; executionId: string };
export type TaskExecutionOutput = {
  kind: 'stdout' | 'stderr';
  text: string;
};
export type TaskExecution = {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  businessAttemptId: string | null;
  executionId: string;
  state: 'running' | 'completed' | 'failed' | 'killed';
  exitCode: number | null;
  startedAt: string;
  completedAt: string | null;
  profile: 'CODEX:CHAOTANG_SUPERVISED';
  entries: TaskExecutionOutput[];
  truncated: boolean;
};
export type TaskApprovalInfo = {
  approvalId: string;
  toolName: string;
  executionProcessId: string;
  isQuestion: boolean;
  createdAt: string;
  timeoutAt: string;
};
export type TaskApprovalList = {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  executionId: string;
  entries: TaskApprovalInfo[];
};
export type TaskQuestionAnswer = { question: string; answer: string[] };
export type TaskApprovalDecision =
  | { decision: 'approve' }
  | { decision: 'deny'; reason: string | null }
  | { decision: 'answer'; answers: TaskQuestionAnswer[] };
export type TaskApprovalResponseInput = {
  jobId: string;
  executionId: string;
  approvalId: string;
  response: TaskApprovalDecision;
};
export interface TaskExecutionClient {
  startTaskExecution(input: TaskExecutionStartInput): Promise<TaskExecution>;
  readTaskExecution(input: TaskExecutionReadInput): Promise<TaskExecution>;
  cancelTaskExecution(input: TaskExecutionReadInput): Promise<TaskExecution>;
  taskExecutionApprovals(
    input: TaskExecutionReadInput
  ): Promise<TaskApprovalList>;
  respondTaskExecutionApproval(
    input: TaskApprovalResponseInput
  ): Promise<unknown>;
}
export type TaskExecutionScope = Readonly<{
  ownerId: string;
  generation: string;
  bindingId: string;
  jobId: string;
  workspaceId: string;
  sessionId: string;
  businessAttemptId: string | null;
}>;

export class TaskExecutionContractError extends Error {
  readonly code = 'TASK_EXECUTION_CONTRACT_INVALID';
  constructor(message = '任务执行回执无效，请重新读取。') {
    super(message);
    this.name = 'TaskExecutionContractError';
  }
}
const fail = (): never => {
  throw new TaskExecutionContractError();
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

export function taskExecutionStartInput(
  value: unknown
): TaskExecutionStartInput {
  const input = record(value, ['jobId', 'prompt']);
  const prompt = text(input.prompt);
  if (prompt.length > 65_536) return fail();
  return { jobId: id(input.jobId), prompt };
}

export function taskExecutionReadInput(value: unknown): TaskExecutionReadInput {
  const input = record(value, ['jobId', 'executionId']);
  return { jobId: id(input.jobId), executionId: uuid(input.executionId) };
}

export function decodeTaskExecution(
  value: unknown,
  scope: TaskExecutionScope
): TaskExecution {
  const result = record(value, [
    'jobId',
    'workspaceId',
    'sessionId',
    'businessAttemptId',
    'executionId',
    'state',
    'exitCode',
    'startedAt',
    'completedAt',
    'profile',
    'entries',
    'truncated',
  ]);
  if (
    result.jobId !== scope.jobId ||
    result.workspaceId !== scope.workspaceId ||
    result.sessionId !== scope.sessionId ||
    !['running', 'completed', 'failed', 'killed'].includes(
      String(result.state)
    ) ||
    result.profile !== 'CODEX:CHAOTANG_SUPERVISED' ||
    !Array.isArray(result.entries) ||
    result.entries.length > 200 ||
    typeof result.truncated !== 'boolean' ||
    (result.exitCode !== null &&
      (typeof result.exitCode !== 'number' ||
        !Number.isSafeInteger(result.exitCode)))
  )
    return fail();
  const executionId = uuid(result.executionId);
  const businessAttemptId =
    result.businessAttemptId === null
      ? null
      : typeof result.businessAttemptId === 'string' &&
          /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(result.businessAttemptId)
        ? result.businessAttemptId
        : fail();
  const startedAt = timestamp(result.startedAt);
  const completedAt =
    result.completedAt === null ? null : timestamp(result.completedAt);
  if (
    (result.state === 'running' && completedAt !== null) ||
    (result.state !== 'running' && completedAt === null) ||
    (completedAt !== null && Date.parse(completedAt) < Date.parse(startedAt))
  )
    return fail();
  let outputBytes = 0;
  const entries = result.entries.map((raw): TaskExecutionOutput => {
    const entry = record(raw, ['kind', 'text']);
    if (!['stdout', 'stderr'].includes(String(entry.kind))) return fail();
    const content = typeof entry.text === 'string' ? entry.text : fail();
    if (content.includes('\0')) return fail();
    outputBytes += new TextEncoder().encode(content).byteLength;
    if (outputBytes > 512 * 1024) return fail();
    return {
      kind: entry.kind as TaskExecutionOutput['kind'],
      text: content,
    };
  });
  return {
    jobId: id(result.jobId),
    workspaceId: uuid(result.workspaceId),
    sessionId: uuid(result.sessionId),
    businessAttemptId,
    executionId,
    state: result.state as TaskExecution['state'],
    exitCode: result.exitCode as number | null,
    startedAt,
    completedAt,
    profile: 'CODEX:CHAOTANG_SUPERVISED',
    entries,
    truncated: result.truncated,
  };
}

export function decodeTaskExecutionApprovals(
  value: unknown,
  scope: TaskExecutionScope,
  executionId: string
): TaskApprovalList {
  const expectedExecution = uuid(executionId);
  const result = record(value, [
    'jobId',
    'workspaceId',
    'sessionId',
    'executionId',
    'entries',
  ]);
  if (
    result.jobId !== scope.jobId ||
    result.workspaceId !== scope.workspaceId ||
    result.sessionId !== scope.sessionId ||
    result.executionId !== expectedExecution ||
    !Array.isArray(result.entries) ||
    result.entries.length > 100
  )
    return fail();
  const seen = new Set<string>();
  const entries = result.entries.map((raw): TaskApprovalInfo => {
    const entry = record(raw, [
      'approvalId',
      'toolName',
      'executionProcessId',
      'isQuestion',
      'createdAt',
      'timeoutAt',
    ]);
    const approvalId = uuid(entry.approvalId);
    const toolName = text(entry.toolName);
    if (
      seen.has(approvalId) ||
      toolName.length > 1_024 ||
      entry.executionProcessId !== expectedExecution ||
      typeof entry.isQuestion !== 'boolean'
    )
      return fail();
    seen.add(approvalId);
    const createdAt = timestamp(entry.createdAt);
    const timeoutAt = timestamp(entry.timeoutAt);
    if (Date.parse(timeoutAt) < Date.parse(createdAt)) return fail();
    return {
      approvalId,
      toolName,
      executionProcessId: expectedExecution,
      isQuestion: entry.isQuestion,
      createdAt,
      timeoutAt,
    };
  });
  return {
    jobId: id(result.jobId),
    workspaceId: uuid(result.workspaceId),
    sessionId: uuid(result.sessionId),
    executionId: expectedExecution,
    entries,
  };
}

function approvalDecision(value: unknown): TaskApprovalDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const decision = (value as Record<string, unknown>).decision;
  if (decision === 'approve') {
    record(value, ['decision']);
    return { decision };
  }
  if (decision === 'deny') {
    const input = record(value, ['decision', 'reason']);
    const reason = input.reason === null ? null : text(input.reason);
    if (reason !== null && reason.length > 1_000) return fail();
    return { decision, reason };
  }
  if (decision === 'answer') {
    const input = record(value, ['decision', 'answers']);
    if (
      !Array.isArray(input.answers) ||
      input.answers.length === 0 ||
      input.answers.length > 20
    )
      return fail();
    const answers = input.answers.map((raw): TaskQuestionAnswer => {
      const answer = record(raw, ['question', 'answer']);
      const question = text(answer.question);
      if (
        question.length > 4_096 ||
        !Array.isArray(answer.answer) ||
        answer.answer.length === 0 ||
        answer.answer.length > 20
      )
        return fail();
      const values = answer.answer.map((item) => {
        const result = text(item);
        if (result.length > 4_096) return fail();
        return result;
      });
      return { question, answer: values };
    });
    return { decision, answers };
  }
  return fail();
}

export function taskApprovalResponseInput(
  value: unknown
): TaskApprovalResponseInput {
  const input = record(value, [
    'jobId',
    'executionId',
    'approvalId',
    'response',
  ]);
  return {
    jobId: id(input.jobId),
    executionId: uuid(input.executionId),
    approvalId: uuid(input.approvalId),
    response: approvalDecision(input.response),
  };
}

export function taskExecutionError(error: unknown): {
  kind: 'unlinked' | 'unsupported' | 'error';
  message: string;
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '任务执行请求失败，请重试。';
  if (message === 'OWNER_BINDING_NOT_FOUND')
    return { kind: 'unlinked', message: '技术工作区尚未关联。' };
  if (message === 'TASK_EXECUTION_UNSUPPORTED')
    return { kind: 'unsupported', message: '当前客户端暂不支持任务执行。' };
  if (message.includes('owner_execution_already_running'))
    return { kind: 'error', message: '该任务已有执行正在运行。' };
  if (message.includes('owner_execution_not_running'))
    return { kind: 'error', message: '该执行已经结束，无需再次停止。' };
  return { kind: 'error', message };
}

export type TaskExecutionScopeTicket = Readonly<{ scope: TaskExecutionScope }>;
export type TaskExecutionSettlement<T> =
  | { status: 'accepted'; value: T }
  | { status: 'discarded' }
  | { status: 'error'; error: unknown };
export function createTaskExecutionScopeGate(initial: TaskExecutionScope) {
  const snapshot = (value: TaskExecutionScope): TaskExecutionScope =>
    Object.freeze({
      ownerId: text(value.ownerId),
      generation: text(value.generation),
      bindingId: text(value.bindingId),
      jobId: id(value.jobId),
      workspaceId: uuid(value.workspaceId),
      sessionId: uuid(value.sessionId),
      businessAttemptId:
        value.businessAttemptId === null
          ? null
          : typeof value.businessAttemptId === 'string' &&
              /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(
                value.businessAttemptId
              )
            ? value.businessAttemptId
            : fail(),
    });
  let current = snapshot(initial),
    epoch = 0,
    disposed = false;
  const tickets = new WeakMap<TaskExecutionScopeTicket, number>();
  const active = (ticket: TaskExecutionScopeTicket) =>
    !disposed && tickets.get(ticket) === epoch;
  return {
    begin(): TaskExecutionScopeTicket {
      if (disposed)
        throw new TaskExecutionContractError('任务执行上下文已关闭。');
      const ticket = Object.freeze({ scope: current });
      tickets.set(ticket, epoch);
      return ticket;
    },
    replace(next: TaskExecutionScope) {
      if (disposed)
        throw new TaskExecutionContractError('任务执行上下文已关闭。');
      current = snapshot(next);
      epoch++;
    },
    dispose() {
      disposed = true;
      epoch++;
    },
    async settle<T, R>(
      ticket: TaskExecutionScopeTicket,
      operation: PromiseLike<T>,
      decode: (value: T) => R
    ): Promise<TaskExecutionSettlement<R>> {
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
