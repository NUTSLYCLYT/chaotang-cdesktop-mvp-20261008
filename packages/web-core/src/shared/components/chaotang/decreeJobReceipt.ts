import type { DecreeJob } from '@/shared/providers/ChaotangProvider';

const states = new Set([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown) =>
  typeof value === 'string' &&
  value.length > 0 &&
  Number.isFinite(Date.parse(value));
const errorReceipt = (value: unknown) =>
  value === null ||
  (record(value) &&
    ['code', 'stage', 'category'].every(
      (key) => typeof value[key] === 'string'
    ));

/** Validate transport data before it can be displayed or written to the task cache.
 * This checks receipt consistency, not server-side ownership or result quality.
 */
export function validateDecreeJobReceipt(
  value: unknown,
  expectedJobId?: string
): DecreeJob {
  if (
    !record(value) ||
    !identifier(value.jobId) ||
    (expectedJobId !== undefined && value.jobId !== expectedJobId) ||
    typeof value.state !== 'string' ||
    !states.has(value.state) ||
    typeof value.stage !== 'string' ||
    !value.stage.trim() ||
    !count(value.attemptCount) ||
    !count(value.providerRequestCount) ||
    typeof value.cancelRequested !== 'boolean' ||
    !(value.result === null || record(value.result)) ||
    !errorReceipt(value.error) ||
    !timestamp(value.createdAt) ||
    !timestamp(value.updatedAt) ||
    [
      'title',
      'decreeText',
      'draftFingerprint',
      'replyId',
      'runtimeAttemptId',
      'retryOfJobId',
    ].some((key) => value[key] != null && typeof value[key] !== 'string') ||
    (value.historyArchived !== undefined &&
      typeof value.historyArchived !== 'boolean')
  )
    throw new Error('任务回执不匹配或格式无效，请重新读取；尚未确认本次状态。');
  return value as unknown as DecreeJob;
}

export function validateRetryReceipt(
  value: unknown,
  sourceJobId: string
): DecreeJob {
  const job = validateDecreeJobReceipt(value);
  if (job.jobId === sourceJobId || job.retryOfJobId !== sourceJobId)
    throw new Error('重试回执未关联原任务，请先查看任务记录，勿重复发起重试。');
  return job;
}

export function validateDecreeJobItems(items: DecreeJob[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    const job = validateDecreeJobReceipt(item);
    if (seen.has(job.jobId))
      throw new Error('任务列表含重复回执，请重新读取。');
    seen.add(job.jobId);
  }
}
