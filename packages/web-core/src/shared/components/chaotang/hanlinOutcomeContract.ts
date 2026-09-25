import { z } from 'zod';

/** Authenticated adapters return the backend's redacted snake_case receipts. */
export interface AdvisoryReadClient {
  shiguanOutcomesOverview(): Promise<unknown>;
  shiguanCreateOutcome(
    archiveId: string,
    payload: OutcomeCreateCommand
  ): Promise<unknown>;
  hanlinExperiment(experimentId: string): Promise<unknown>;
}

const count = z.number().int().nonnegative().safe();
const text = z.string().trim().min(1);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const eventId = z.string().regex(/^[0-9a-f]{32}$/);
const identity = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);
const timestamp = z.string().datetime({ offset: true });
const quality = z.number().finite().min(0).max(1);
const outcome = z.enum(['ACHIEVED', 'PARTIAL', 'NOT_ACHIEVED', 'OBSERVING']);
const archiveId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const adoptedReplyArchive = z
  .object({
    id: archiveId,
    archiveType: z.literal('REPLY'),
    title: text,
    department: text,
    createdAt: timestamp,
    decisionStatus: z.object({ decision: z.literal('ADOPTED') }).passthrough(),
  })
  .passthrough();
const outcomeCreateSchema = z
  .object({
    outcome,
    occurred_at: timestamp,
    idempotency_key: identity,
    supersedes_event_id: eventId.nullable(),
  })
  .strict();
const outcomeProjectionSchema = z
  .object({
    event_id: eventId,
    archive_id: archiveId,
    event_kind: z.enum(['RECORDED', 'CORRECTED']),
    outcome,
    source_type: z.literal('OWNER_ATTESTATION'),
    source_auth_level: z.literal('AUTHENTICATED_OWNER_ASSERTION'),
    occurred_at: timestamp,
    recorded_at: timestamp,
    archive_digest: digest,
    decision_digest: digest,
    evidence_bundle_digest: digest,
    evidence_count: count.min(1),
    supersedes_event_id: eventId.nullable(),
    event_digest: digest,
  })
  .strict();
const source = z
  .object({
    event_id: eventId,
    archive_id: text,
    outcome,
    recorded_at: timestamp,
    event_digest: digest,
    evidence_bundle_digest: digest,
    evidence_count: count.min(1),
  })
  .strict();
const overviewSchema = z
  .object({
    total: count,
    achieved: count,
    partial: count,
    not_achieved: count,
    observing: count,
    conclusive: count,
    success_rate: quality.nullable(),
    evidence_count: count,
    basis_digest: digest,
    sources: z.array(source),
  })
  .strict()
  .refine((value) => {
    const counters = { ACHIEVED: 0, PARTIAL: 0, NOT_ACHIEVED: 0, OBSERVING: 0 };
    for (const item of value.sources) counters[item.outcome]++;
    return (
      value.total === value.sources.length &&
      new Set(value.sources.map((item) => item.event_id)).size ===
        value.total &&
      new Set(value.sources.map((item) => item.archive_id)).size ===
        value.total &&
      value.achieved === counters.ACHIEVED &&
      value.partial === counters.PARTIAL &&
      value.not_achieved === counters.NOT_ACHIEVED &&
      value.observing === counters.OBSERVING &&
      value.conclusive ===
        value.achieved + value.partial + value.not_achieved &&
      value.evidence_count ===
        value.sources.reduce((sum, item) => sum + item.evidence_count, 0) &&
      value.success_rate ===
        (value.conclusive ? value.achieved / value.conclusive : null)
    );
  }, 'Outcome 指标与来源不一致');

const definition = z
  .object({
    experiment_id: identity,
    title: text,
    created_at: timestamp,
    minimum_samples_per_arm: count.min(1).max(10_000),
    minimum_quality_gain: quality,
    minimum_evidence_score: quality,
    maximum_cost_increase_ratio: z.number().finite().min(0).max(10),
    maximum_latency_increase_ratio: z.number().finite().min(0).max(10),
    runtime_artifact_id: z
      .literal('deepseek-harness-scripted-council-v1')
      .nullable(),
  })
  .strict();
const observation = z
  .object({
    observation_id: identity,
    outcome_event_id: eventId,
    outcome_event_digest: digest,
    evidence_bundle_digest: digest,
    quality_score: quality,
    evidence_score: quality,
    cost_microunits: count,
    latency_ms: count,
    execution_status: z.enum(['SUCCEEDED', 'FAILED']),
  })
  .strict();
const experimentSchema = z
  .object({
    snapshot: z
      .object({
        definition,
        baseline: z.array(observation),
        candidate: z.array(observation),
        definition_digest: digest,
        baseline_digest: digest,
        candidate_digest: digest,
        snapshot_digest: digest,
      })
      .strict(),
    evaluation: z
      .object({
        experiment_id: identity,
        snapshot_digest: digest,
        status: z.enum([
          'NO_DATA',
          'INSUFFICIENT_SAMPLE',
          'FAILED',
          'READY_FOR_REVIEW',
        ]),
        baseline_samples: count,
        candidate_samples: count,
        baseline_quality: quality.nullable(),
        candidate_quality: quality.nullable(),
        candidate_evidence: quality.nullable(),
        cost_increase_ratio: z.number().finite().nullable(),
        latency_increase_ratio: z.number().finite().nullable(),
        reason_codes: z.array(text),
        recommended_action: z.enum([
          'COLLECT_DATA',
          'KEEP_BASELINE',
          'ROLLBACK_CANDIDATE',
          'PROMOTE_CANDIDATE',
        ]),
        authority: z.literal('ADVISORY_ONLY'),
        runtime_binding_change_allowed: z.literal(false),
        publish_allowed: z.literal(false),
        evaluation_digest: digest,
      })
      .strict(),
    recorded_at: timestamp,
  })
  .strict()
  .refine(({ snapshot, evaluation }) => {
    const observations = [...snapshot.baseline, ...snapshot.candidate];
    return (
      evaluation.experiment_id === snapshot.definition.experiment_id &&
      evaluation.snapshot_digest === snapshot.snapshot_digest &&
      evaluation.baseline_samples === snapshot.baseline.length &&
      evaluation.candidate_samples === snapshot.candidate.length &&
      observations.length <= 200 &&
      new Set(observations.map((item) => item.observation_id)).size ===
        observations.length &&
      new Set(observations.map((item) => item.outcome_event_id)).size ===
        observations.length
    );
  }, '实验与冻结样本不一致');

export type OutcomeOverview = z.infer<typeof overviewSchema>;
export type HanlinExperiment = z.infer<typeof experimentSchema>;
export type OutcomeValue = z.infer<typeof outcome>;
export type OutcomeCreateCommand = z.infer<typeof outcomeCreateSchema>;
export type OutcomeProjection = z.infer<typeof outcomeProjectionSchema>;
export type OutcomeArchiveCandidate = z.infer<typeof adoptedReplyArchive>;

export function eligibleOutcomeArchives(
  values: readonly unknown[]
): OutcomeArchiveCandidate[] {
  return values
    .flatMap((value) => {
      const parsed = adoptedReplyArchive.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    })
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

export function normalizeOutcomeArchiveId(value: string): string {
  const parsed = archiveId.safeParse(value.trim());
  if (!parsed.success)
    throw new Error('档案 ID 须为 1–128 位字母、数字、下划线或连字符。');
  return parsed.data;
}

export function buildOutcomeCreateCommand(
  value: OutcomeValue,
  occurredAt: string,
  idempotencyKey: string,
  supersedesEventId: string | null = null
): OutcomeCreateCommand {
  const parsed = outcomeCreateSchema.safeParse({
    outcome: value,
    occurred_at: occurredAt,
    idempotency_key: idempotencyKey,
    supersedes_event_id: supersedesEventId,
  });
  if (!parsed.success) throw new Error('Outcome 写入参数无效。');
  return parsed.data;
}

export function decodeOutcomeProjection(
  value: unknown,
  requestedArchiveId: string
): OutcomeProjection {
  const id = normalizeOutcomeArchiveId(requestedArchiveId);
  const parsed = outcomeProjectionSchema.safeParse(value);
  if (!parsed.success || parsed.data.archive_id !== id)
    throw new Error('Outcome 写入回执、档案身份或认证来源无效。');
  return parsed.data;
}

export function normalizeExperimentId(value: string): string {
  const parsed = identity.safeParse(value.trim());
  if (!parsed.success)
    throw new Error(
      '实验 ID 须为 8–128 位字母、数字或 . _ : -，不能包含路径。'
    );
  return parsed.data;
}
export function decodeOutcomeOverview(value: unknown): OutcomeOverview {
  const result = overviewSchema.safeParse(value);
  if (!result.success)
    throw new Error('Outcome 总览回执无效或统计与来源不一致，请重新读取。');
  return result.data;
}
export function decodeHanlinExperiment(
  value: unknown,
  requestedId: string
): HanlinExperiment {
  const id = normalizeExperimentId(requestedId);
  const result = experimentSchema.safeParse(value);
  if (!result.success || result.data.snapshot.definition.experiment_id !== id)
    throw new Error('实验回执、请求 ID 或只读权限边界不一致，请重新查询。');
  return result.data;
}
export function advisoryReadQueryKey(
  owner: string | undefined,
  generation: number,
  kind: 'overview' | 'experiment',
  experimentId?: string
) {
  return [
    'chaotang',
    'advisory-read',
    owner ?? null,
    generation,
    kind,
    experimentId ?? null,
  ] as const;
}
export function advisoryReadError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '读取失败，请重试。';
}
