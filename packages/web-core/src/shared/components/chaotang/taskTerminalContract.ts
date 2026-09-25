export interface TaskTerminal {
  jobId: string;
  workspaceId: string;
  sessionId: string;
  terminalId: string;
  active: boolean;
  nextSequence: number;
}

export interface TaskTerminalEntry {
  sequence: number;
  dataBase64: string;
}

export interface TaskTerminalRead extends TaskTerminal {
  earliestSequence: number;
  truncated: boolean;
  entries: TaskTerminalEntry[];
}

export interface TaskTerminalClient {
  startTaskTerminal(input: {
    jobId: string;
    cols: number;
    rows: number;
  }): Promise<TaskTerminal>;
  readTaskTerminal(input: {
    jobId: string;
    terminalId: string;
    afterSequence: number;
  }): Promise<TaskTerminalRead>;
  writeTaskTerminal(input: {
    jobId: string;
    terminalId: string;
    data: string;
  }): Promise<unknown>;
  resizeTaskTerminal(input: {
    jobId: string;
    terminalId: string;
    cols: number;
    rows: number;
  }): Promise<unknown>;
  closeTaskTerminal(input: {
    jobId: string;
    terminalId: string;
  }): Promise<unknown>;
}

function text(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label}不能为空`);
  return value;
}

function dimensions(cols: number, rows: number) {
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 20 ||
    cols > 400 ||
    rows < 5 ||
    rows > 200
  )
    throw new Error('终端尺寸无效');
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length === 0 || bytes.length > 4096)
    throw new Error('终端输入不能为空或超过 4KB');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function taskTerminalStartInput(input: {
  jobId: string;
  cols: number;
  rows: number;
}) {
  dimensions(input.cols, input.rows);
  return {
    jobId: text(input.jobId, '任务编号'),
    cols: input.cols,
    rows: input.rows,
  };
}

export function taskTerminalReadInput(input: {
  jobId: string;
  terminalId: string;
  afterSequence: number;
}) {
  if (!Number.isSafeInteger(input.afterSequence) || input.afterSequence < 0)
    throw new Error('终端输出游标无效');
  return {
    jobId: text(input.jobId, '任务编号'),
    terminalId: text(input.terminalId, '终端编号'),
    afterSequence: input.afterSequence,
  };
}

export function taskTerminalWriteInput(input: {
  jobId: string;
  terminalId: string;
  data: string;
}) {
  return {
    jobId: text(input.jobId, '任务编号'),
    terminalId: text(input.terminalId, '终端编号'),
    dataBase64: toBase64(input.data),
  };
}

export function taskTerminalResizeInput(input: {
  jobId: string;
  terminalId: string;
  cols: number;
  rows: number;
}) {
  dimensions(input.cols, input.rows);
  return {
    jobId: text(input.jobId, '任务编号'),
    terminalId: text(input.terminalId, '终端编号'),
    cols: input.cols,
    rows: input.rows,
  };
}

export function taskTerminalCloseInput(input: {
  jobId: string;
  terminalId: string;
}) {
  return {
    jobId: text(input.jobId, '任务编号'),
    terminalId: text(input.terminalId, '终端编号'),
  };
}
