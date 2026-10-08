import { expect, it } from 'vitest';
import { decreeJobStatus } from './decreeJobStatus';

it('uses the confirmed cancellation flag, not a local click, to show pending', () => {
  expect(decreeJobStatus({ state: 'RUNNING', cancelRequested: false, error: null })).toEqual({ label: '执行中', notice: null });
  expect(decreeJobStatus({ state: 'RUNNING', cancelRequested: true, error: null }).label).toBe('正在取消');
});

it.each(['external_execution_uncertain', 'gateway_cleanup_unconfirmed'])('keeps uncertain cleanup visible: %s', (code) => {
  const display = decreeJobStatus({ state: 'FAILED', cancelRequested: true, error: { code, stage: 'execution', category: 'provider' } });
  expect(display.label).toBe('外部执行待核对');
  expect(display.notice).toContain('预留额度');
  expect(display.notice).toContain('请勿重复发起');
});

it.each(['CANCELLED', 'SUCCEEDED', 'FAILED'] as const)('never keeps a terminal task falsely cancelling: %s', (state) => {
  const display = decreeJobStatus({ state, cancelRequested: true, error: null });
  expect(display.label).not.toBe('正在取消');
  expect(display.notice).toBeNull();
});
