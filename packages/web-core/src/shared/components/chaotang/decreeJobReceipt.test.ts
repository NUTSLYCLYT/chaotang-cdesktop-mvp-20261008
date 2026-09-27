import { describe, expect, it } from 'vitest';
import {
  validateDecreeJobReceipt,
  validateDecreeJobItems,
  validateRetryReceipt,
} from './decreeJobReceipt';

const receipt = () => ({
  jobId: 'job-a',
  state: 'RUNNING' as const,
  stage: 'dispatch',
  attemptCount: 1,
  providerRequestCount: 2,
  cancelRequested: false,
  result: null,
  error: null,
  createdAt: '2026-09-27T00:00:00+00:00',
  updatedAt: '2026-09-27T00:01:00Z',
});

describe('task receipt boundary', () => {
  it('preserves an actual receipt without inventing status, ownership or results', () => {
    const value = receipt();
    expect(validateDecreeJobReceipt(value, 'job-a')).toBe(value);
    expect(() => validateDecreeJobReceipt(value, 'job-b')).toThrow('不匹配');
  });
  it.each([
    { state: 'UNKNOWN' },
    { state: 'RETRY_WAIT' },
    { stage: '' },
    { attemptCount: -1 },
    { providerRequestCount: 0.5 },
    { providerRequestCount: Number.MAX_SAFE_INTEGER + 1 },
    { cancelRequested: 'false' },
    { result: [] },
    { error: 'private failure' },
    { error: { code: 'failed', stage: 'execute' } },
    { createdAt: 'invalid' },
    { updatedAt: undefined },
    { jobId: '../secret' },
    { title: {} },
    { historyArchived: 'false' },
  ])('rejects malformed responses without coercing them: %j', (patch) => {
    expect(() => validateDecreeJobReceipt({ ...receipt(), ...patch })).toThrow(
      '回执'
    );
  });
  it('accepts nullable results and structured errors while preserving terminal status', () => {
    const value = {
      ...receipt(),
      state: 'FAILED',
      error: {
        code: 'validation_failed',
        stage: 'validation',
        category: 'validation',
      },
    };
    expect(validateDecreeJobReceipt(value).state).toBe('FAILED');
  });
  it('requires a new retry task explicitly linked to the requested predecessor', () => {
    expect(() => validateRetryReceipt(receipt(), 'job-a')).toThrow('原任务');
    expect(() =>
      validateRetryReceipt(
        { ...receipt(), jobId: 'job-b', retryOfJobId: 'other' },
        'job-a'
      )
    ).toThrow('原任务');
    expect(
      validateRetryReceipt(
        { ...receipt(), jobId: 'job-b', retryOfJobId: 'job-a' },
        'job-a'
      ).jobId
    ).toBe('job-b');
  });
  it('refuses duplicate and malformed list entries instead of misleading counts', () => {
    expect(() => validateDecreeJobItems([receipt(), receipt()])).toThrow(
      '重复'
    );
    expect(() =>
      validateDecreeJobItems([{ ...receipt(), state: 'UNKNOWN' } as never])
    ).toThrow('回执');
    expect(() => validateDecreeJobItems([receipt()])).not.toThrow();
  });
});
