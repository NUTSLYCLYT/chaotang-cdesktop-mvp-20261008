import { expect, it } from 'vitest';
import { canRetryTask } from './taskWorkspaceState';

const job = {
  state: 'FAILED' as const,
  cancelRequested: false,
  result: null,
  replyId: null,
  providerRequestCount: 0,
  error: {
    code: 'token_budget_transport_unavailable',
    stage: 'execution',
    category: 'provider',
  },
};

it('allows configuration repair before any generation while preserving validation retries', () => {
  expect(canRetryTask(job)).toBe(true);
  expect(canRetryTask({ ...job, providerRequestCount: 1 })).toBe(false);
  expect(
    canRetryTask({
      ...job,
      providerRequestCount: 2,
      error: { ...job.error, code: 'validation_failed' },
    })
  ).toBe(true);
});

it('never offers retry for uncertain cleanup, legacy modes or unknown failures', () => {
  for (const code of [
    'external_execution_uncertain',
    'gateway_cleanup_unconfirmed',
    'execution_mode_incompatible',
    'job_failed',
  ]) {
    expect(canRetryTask({ ...job, error: { ...job.error, code } })).toBe(false);
  }
});

it('does not restart cancelled, completed or partly delivered work', () => {
  expect(canRetryTask({ ...job, cancelRequested: true })).toBe(false);
  expect(canRetryTask({ ...job, state: 'RUNNING' })).toBe(false);
  expect(canRetryTask({ ...job, state: 'SUCCEEDED' })).toBe(false);
  expect(canRetryTask({ ...job, result: { partial: true } })).toBe(false);
  expect(canRetryTask({ ...job, replyId: 'existing-reply' })).toBe(false);
});
