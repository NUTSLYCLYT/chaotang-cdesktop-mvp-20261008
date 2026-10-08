import { z } from 'zod';

export const deliveryCheckLabels = {
  job_succeeded: '任务结束状态',
  result_contract: '成果与批准范围',
  published_artifacts: '文件发布与完整性',
  reply_identity: '任务与回奏关联',
  shiguan_reply_archive: '史馆归档关联',
  execution_mode: '受控宿主执行方式',
} as const;

const reference = z.string().min(1).max(1024);
const schema = z.object({
  review_id: z.string().regex(/^[0-9a-f]{32}$/),
  job_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  scope: z.literal('STRUCTURAL_DELIVERY'),
  state: z.enum(['PASSED', 'FAILED', 'NOT_VERIFIED']),
  quality_assessment: z.literal('NOT_ASSESSED'),
  reviewed_at: z.string().datetime({ offset: true }),
  review_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evidence_refs: z.array(reference).max(256),
  checks: z
    .array(
      z.object({
        check_id: z.enum([
          'job_succeeded',
          'result_contract',
          'published_artifacts',
          'reply_identity',
          'shiguan_reply_archive',
          'execution_mode',
        ]),
        state: z.enum(['PASS', 'FAIL', 'NOT_VERIFIED']),
        evidence: z.array(reference).max(256),
        detail: z.string().min(1).max(500),
      })
    )
    .length(6),
});
export type TaskDeliveryReceipt = z.infer<typeof schema>;

/** A display boundary, not a signature check or a business-quality decision. */
export function decodeTaskDeliveryReview(
  value: unknown,
  jobId: string
): TaskDeliveryReceipt {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    const receipt = parsed.data;
    const expected = receipt.checks.some((item) => item.state === 'FAIL')
      ? 'FAILED'
      : receipt.checks.some((item) => item.state === 'NOT_VERIFIED')
        ? 'NOT_VERIFIED'
        : 'PASSED';
    if (
      receipt.job_id === jobId &&
      receipt.state === expected &&
      new Set(receipt.checks.map((item) => item.check_id)).size === 6
    )
      return receipt;
  }
  throw new Error('核验回执不匹配或格式无效，请重新核验；尚未确认通过。');
}
