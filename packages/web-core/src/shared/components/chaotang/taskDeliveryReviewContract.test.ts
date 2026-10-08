import { expect, it } from 'vitest';
import { decodeTaskDeliveryReview } from './taskDeliveryReviewContract';

export const receipt = () => ({
  review_id: 'a'.repeat(32),
  job_id: 'job-1',
  scope: 'STRUCTURAL_DELIVERY',
  state: 'PASSED',
  quality_assessment: 'NOT_ASSESSED',
  reviewed_at: '2026-09-28T01:00:00Z',
  review_digest: 'sha256:' + 'a'.repeat(64),
  evidence_refs: ['decree-job:job-1'],
  checks: [
    'job_succeeded',
    'result_contract',
    'published_artifacts',
    'reply_identity',
    'shiguan_reply_archive',
    'execution_mode',
  ].map((check_id) => ({
    check_id,
    state: 'PASS',
    evidence: ['decree-job:job-1'],
    detail: '合成测试回执',
  })),
});

it('accepts the existing structural receipt without elevating its scope', () => {
  expect(decodeTaskDeliveryReview(receipt(), 'job-1').quality_assessment).toBe(
    'NOT_ASSESSED'
  );
});
it.each([
  (v: any) => {
    v.job_id = 'other-job';
  },
  (v: any) => {
    v.scope = 'BUSINESS_QUALITY';
  },
  (v: any) => {
    v.quality_assessment = 'PASSED';
  },
  (v: any) => {
    v.checks[0].state = 'FAIL';
  },
  (v: any) => {
    v.checks.pop();
  },
  (v: any) => {
    v.checks[0].check_id = v.checks[1].check_id;
  },
  (v: any) => {
    v.review_digest = 'forged';
  },
  (v: any) => {
    v.reviewed_at = 'tomorrow';
  },
])('rejects unbound, unsupported or contradictory receipts', (change) => {
  const value = receipt();
  change(value);
  expect(() => decodeTaskDeliveryReview(value, 'job-1')).toThrow(
    '核验回执不匹配'
  );
});
it('preserves failed and unverified checks rather than treating any receipt as passing', () => {
  const value = receipt();
  value.state = 'FAILED';
  value.checks[2].state = 'FAIL';
  expect(decodeTaskDeliveryReview(value, 'job-1').state).toBe('FAILED');
  value.state = 'NOT_VERIFIED';
  value.checks[2].state = 'NOT_VERIFIED';
  expect(decodeTaskDeliveryReview(value, 'job-1').state).toBe('NOT_VERIFIED');
});
