import { z } from 'zod';
import type { CandidateHistory } from './hanlinCandidateContract';

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const identity = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);
const action = z.enum([
  'START',
  'PROBE',
  'RUN_DEPARTMENT',
  'SWITCH_LOCAL_BINDING',
  'DEGRADE',
  'ROLLBACK',
]);
const eventState = z.enum([
  'STARTED',
  'PROBED',
  'SAMPLED',
  'ACTIVE',
  'DEGRADED',
  'ROLLED_BACK',
]);
const health = z.enum(['NOT_CHECKED', 'HEALTHY', 'DEGRADED', 'STOPPED']);
const departmentReceipt = z
  .object({
    preset: z.literal('gongbu-delivery'),
    bureau: z.literal('技术司'),
    department_session_id: z.string().min(1).max(256),
    bureau_session_id: z.string().min(1).max(256),
    council_task_id: z.string().min(1).max(256),
    model_mode: z.literal('scripted'),
    synthetic: z.literal(true),
    real_model_calls: z.literal(0),
    scripted_model_steps: z.number().int().min(1).max(4),
    tool_calls: z.number().int().min(1).max(20),
    result_digest: digest,
    result: z
      .object({
        ready: z
          .object({
            status: z.literal('READY'),
            result: z.object({
              opinion: z.string().min(1),
              factual_claims: z.array(z.unknown()).min(1),
            }),
            adopted_evidence_ids: z.array(z.string()).max(0),
            fact_basis: z.literal('NOT_REQUIRED'),
          })
          .strict(),
        bureau_outputs: z.tuple([
          z.object({ bureau: z.literal('技术司') }).strict(),
        ]),
        data_gaps: z.array(z.string()),
      })
      .strict(),
    receipt_digest: digest,
  })
  .strict();
const boundary = {
  scope: z.literal('LOCAL_PROCESS_ISOLATED'),
  authority: z.literal('LOCAL_REHEARSAL_ONLY'),
  artifact_kind: z.enum([
    'TRUSTED_BUILTIN_PROBE',
    'DEEPSEEK_HARNESS_SCRIPTED_COUNCIL',
  ]),
  artifact_id: z.enum([
    'trusted-builtin-probe-v1',
    'deepseek-harness-scripted-council-v1',
  ]),
  artifact_descriptor_digest: digest.nullable(),
  runtime_version: z.string().trim().min(1).nullable(),
  production_binding_change_allowed: z.literal(false),
  publish_allowed: z.literal(false),
  model_calls: z.literal(0),
};
const eventSchema = z
  .object({
    ...boundary,
    event_id: z.string().regex(/^[0-9a-f]{32}$/),
    experiment_id: identity,
    revision: z.number().int().min(1).max(100),
    action,
    state: eventState,
    runtime_health: health,
    local_binding_changed: z.boolean(),
    active_binding_digest: digest,
    candidate_event_digest: digest,
    artifact_digest: digest,
    department_receipt: departmentReceipt.nullable().optional(),
    process_id: z.number().int().positive(),
    previous_event_digest: digest.nullable(),
    event_digest: digest,
    reason: z.string().trim().min(1).max(2000),
    recorded_at: z.string().datetime({ offset: true }),
  })
  .strict();
const historySchema = z
  .object({
    ...boundary,
    experiment_id: identity,
    revision: z.number().int().min(0).max(100),
    state: z.enum([
      'NOT_STARTED',
      'STARTED',
      'PROBED',
      'SAMPLED',
      'ACTIVE',
      'DEGRADED',
      'ROLLED_BACK',
    ]),
    runtime_health: z.enum([
      'NOT_RUN',
      'NOT_CHECKED',
      'HEALTHY',
      'DEGRADED',
      'STOPPED',
      'FAILED_CLOSED',
    ]),
    local_binding_changed: z.boolean(),
    active_binding_digest: digest,
    process_alive: z.boolean(),
    events: z.array(eventSchema).max(100),
  })
  .strict();
const commandSchema = z
  .object({
    action,
    expected_revision: z.number().int().min(0).max(100),
    idempotency_key: identity,
    candidate_event_digest: digest,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export type RuntimeRehearsalAction = z.infer<typeof action>;
export type RuntimeRehearsalEvent = z.infer<typeof eventSchema>;
export type RuntimeRehearsalHistory = z.infer<typeof historySchema>;
export type RuntimeRehearsalCommand = z.infer<typeof commandSchema>;
export interface RuntimeRehearsalClient {
  runtimeRehearsalHistory(experimentId: string): Promise<unknown>;
  appendRuntimeRehearsalEvent(
    experimentId: string,
    payload: RuntimeRehearsalCommand
  ): Promise<unknown>;
}

type CandidateHead = Pick<CandidateHistory, 'state' | 'events'>;

const fail = (): never => {
  throw new Error('候选进程演练回执、版本或本地权限边界不一致，请重新读取。');
};

export function runtimeRehearsalActions(
  history: Pick<
    RuntimeRehearsalHistory,
    'state' | 'revision' | 'artifact_kind'
  >,
  candidate: CandidateHead
): RuntimeRehearsalAction[] {
  if (
    history.revision >= 100 ||
    candidate.state !== 'HEALTHY' ||
    !candidate.events.length
  )
    return history.state === 'STARTED' ||
      history.state === 'PROBED' ||
      history.state === 'ACTIVE' ||
      history.state === 'DEGRADED'
      ? ['ROLLBACK']
      : [];
  switch (history.state) {
    case 'NOT_STARTED':
      return ['START'];
    case 'STARTED':
      return ['PROBE', 'ROLLBACK'];
    case 'PROBED':
      return history.artifact_kind === 'DEEPSEEK_HARNESS_SCRIPTED_COUNCIL'
        ? ['RUN_DEPARTMENT', 'ROLLBACK']
        : ['SWITCH_LOCAL_BINDING', 'ROLLBACK'];
    case 'SAMPLED':
      return ['SWITCH_LOCAL_BINDING', 'ROLLBACK'];
    case 'ACTIVE':
      return ['DEGRADE', 'ROLLBACK'];
    case 'DEGRADED':
      return ['ROLLBACK'];
    default:
      return [];
  }
}

const transition = (
  actionValue: RuntimeRehearsalAction,
  baselineDigest: string,
  candidateDigest: string
) => {
  switch (actionValue) {
    case 'START':
      return ['STARTED', 'NOT_CHECKED', false, baselineDigest] as const;
    case 'PROBE':
      return ['PROBED', 'HEALTHY', false, baselineDigest] as const;
    case 'RUN_DEPARTMENT':
      return ['SAMPLED', 'HEALTHY', false, baselineDigest] as const;
    case 'SWITCH_LOCAL_BINDING':
      return ['ACTIVE', 'HEALTHY', true, candidateDigest] as const;
    case 'DEGRADE':
      return ['DEGRADED', 'DEGRADED', true, candidateDigest] as const;
    case 'ROLLBACK':
      return ['ROLLED_BACK', 'STOPPED', false, baselineDigest] as const;
  }
};

export function decodeRuntimeRehearsalHistory(
  value: unknown,
  experimentId: string,
  baselineDigest: string,
  candidateDigest: string,
  candidate: CandidateHead
): RuntimeRehearsalHistory {
  const parsed = historySchema.safeParse(value);
  if (!parsed.success) return fail();
  const result = parsed.data;
  if (
    result.experiment_id !== experimentId ||
    result.revision !== result.events.length
  )
    return fail();
  let state: RuntimeRehearsalHistory['state'] = 'NOT_STARTED';
  let previousDigest: string | null = null;
  let processId: number | null = null;
  let artifactDigest: string | null = null;
  let artifactIdentity:
    | Pick<
        RuntimeRehearsalEvent,
        | 'artifact_kind'
        | 'artifact_id'
        | 'artifact_descriptor_digest'
        | 'runtime_version'
      >
    | undefined;
  const candidateDigests = new Set(
    candidate.events
      .filter((event) => event.state === 'HEALTHY')
      .map((event) => event.event_digest)
  );
  const ids = new Set<string>();
  for (const [index, event] of result.events.entries()) {
    if (
      !runtimeRehearsalActions(
        { state, revision: index, artifact_kind: result.artifact_kind },
        { state: 'HEALTHY', events: candidate.events }
      ).includes(event.action) ||
      event.revision !== index + 1 ||
      event.experiment_id !== experimentId ||
      !candidateDigests.has(event.candidate_event_digest) ||
      event.previous_event_digest !== previousDigest ||
      ids.has(event.event_id)
    )
      return fail();
    const [nextState, nextHealth, changed, binding] = transition(
      event.action,
      baselineDigest,
      candidateDigest
    );
    if (event.action === 'START') {
      processId = event.process_id;
      artifactDigest = event.artifact_digest;
      artifactIdentity = event;
    }
    if (
      event.state !== nextState ||
      event.runtime_health !== nextHealth ||
      event.local_binding_changed !== changed ||
      event.active_binding_digest !== binding ||
      event.process_id !== processId ||
      event.artifact_digest !== artifactDigest ||
      event.artifact_kind !== artifactIdentity?.artifact_kind ||
      event.artifact_id !== artifactIdentity?.artifact_id ||
      event.artifact_descriptor_digest !==
        artifactIdentity?.artifact_descriptor_digest ||
      event.runtime_version !== artifactIdentity?.runtime_version
    )
      return fail();
    if (
      (event.action === 'RUN_DEPARTMENT') !==
      Boolean(event.department_receipt)
    )
      return fail();
    state = nextState;
    previousDigest = event.event_digest;
    ids.add(event.event_id);
  }
  if (result.state !== state) return fail();
  if (
    result.events.length &&
    (result.artifact_kind !== artifactIdentity?.artifact_kind ||
      result.artifact_id !== artifactIdentity?.artifact_id ||
      result.artifact_descriptor_digest !==
        artifactIdentity?.artifact_descriptor_digest ||
      result.runtime_version !== artifactIdentity?.runtime_version)
  )
    return fail();
  if (!result.events.length) {
    if (
      result.runtime_health !== 'NOT_RUN' ||
      result.local_binding_changed ||
      result.active_binding_digest !== baselineDigest ||
      result.process_alive
    )
      return fail();
    return result;
  }
  const last = result.events.at(-1)!;
  const failedClosed =
    (state === 'ACTIVE' || state === 'DEGRADED') &&
    !result.process_alive &&
    result.runtime_health === 'FAILED_CLOSED' &&
    !result.local_binding_changed &&
    result.active_binding_digest === baselineDigest;
  if (
    !failedClosed &&
    (result.runtime_health !== last.runtime_health ||
      result.local_binding_changed !== last.local_binding_changed ||
      result.active_binding_digest !== last.active_binding_digest)
  )
    return fail();
  if (state === 'ROLLED_BACK' && result.process_alive) return fail();
  return result;
}

export function buildRuntimeRehearsalCommand(
  history: RuntimeRehearsalHistory,
  candidate: CandidateHead,
  selectedAction: RuntimeRehearsalAction,
  reason: string,
  idempotencyKey: string
): RuntimeRehearsalCommand {
  const head = candidate.events.at(-1);
  const candidateEventDigest =
    selectedAction === 'ROLLBACK'
      ? history.events.at(0)?.candidate_event_digest
      : head?.event_digest;
  const parsed = commandSchema.safeParse({
    action: selectedAction,
    expected_revision: history.revision,
    idempotency_key: idempotencyKey,
    candidate_event_digest: candidateEventDigest,
    reason: reason.trim(),
  });
  if (
    !parsed.success ||
    !runtimeRehearsalActions(history, candidate).includes(selectedAction)
  )
    return fail();
  return parsed.data;
}

export function decodeRuntimeRehearsalAppend(
  value: unknown,
  history: RuntimeRehearsalHistory,
  experimentId: string,
  baselineDigest: string,
  candidateDigest: string,
  candidate: CandidateHead,
  command: RuntimeRehearsalCommand
): RuntimeRehearsalEvent {
  const event = eventSchema.safeParse(value);
  if (!event.success) return fail();
  const synthetic = {
    ...history,
    revision: history.revision + 1,
    state: event.data.state,
    runtime_health: event.data.runtime_health,
    local_binding_changed: event.data.local_binding_changed,
    active_binding_digest: event.data.active_binding_digest,
    process_alive: event.data.action !== 'ROLLBACK',
    events: [...history.events, event.data],
  };
  decodeRuntimeRehearsalHistory(
    synthetic,
    experimentId,
    baselineDigest,
    candidateDigest,
    candidate
  );
  if (
    event.data.action !== command.action ||
    event.data.revision !== command.expected_revision + 1 ||
    event.data.candidate_event_digest !== command.candidate_event_digest ||
    event.data.reason !== command.reason
  )
    return fail();
  return event.data;
}
