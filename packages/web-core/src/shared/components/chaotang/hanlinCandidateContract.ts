import { z } from 'zod';
import type { HanlinExperiment } from './hanlinOutcomeContract';

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const identity = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);
const action = z.enum([
  'APPROVE',
  'REJECT',
  'ENABLE',
  'CHECK_HEALTH',
  'DEGRADE',
  'ROLLBACK',
]);
const state = z.enum([
  'UNREVIEWED',
  'APPROVED',
  'REJECTED',
  'ENABLED',
  'HEALTHY',
  'DEGRADED',
  'ROLLED_BACK',
]);
const revision = z.number().int().min(0).max(1000);
const boundary = {
  scope: z.literal('LOCAL_ISOLATED'),
  selection_kind: z.literal('EXPERIMENT_ARM_DIGEST'),
  authority: z.literal('LOCAL_REHEARSAL_ONLY'),
  runtime_binding_change_allowed: z.literal(false),
  publish_allowed: z.literal(false),
  runtime_health: z.literal('NOT_RUN'),
};
const eventSchema = z
  .object({
    ...boundary,
    event_id: z.string().regex(/^[0-9a-f]{32}$/),
    experiment_id: identity,
    revision: revision.min(1),
    action,
    state,
    snapshot_digest: digest,
    evaluation_digest: digest,
    selected_arm_digest: digest,
    previous_arm_digest: digest.nullable(),
    previous_event_digest: digest.nullable(),
    event_digest: digest,
    reason: z.string().trim().min(1).max(2000),
    recorded_at: z.string().datetime({ offset: true }),
    health_check_scope: z.enum(['NOT_RUN', 'LEDGER_INTEGRITY_ONLY']),
  })
  .strict();
const historySchema = z
  .object({
    ...boundary,
    experiment_id: identity,
    revision,
    state,
    selected_arm_digest: digest,
    events: z.array(eventSchema).max(1000),
  })
  .strict();
const commandSchema = z
  .object({
    action,
    expected_revision: revision,
    idempotency_key: identity,
    snapshot_digest: digest,
    evaluation_digest: digest,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export type CandidateAction = z.infer<typeof action>;
export type CandidateHistory = z.infer<typeof historySchema>;
export type CandidateEvent = z.infer<typeof eventSchema>;
export type CandidateCommand = z.infer<typeof commandSchema>;
export interface CandidateLedgerClient {
  candidateHistory(experimentId: string): Promise<unknown>;
  appendCandidateEvent(
    experimentId: string,
    payload: CandidateCommand
  ): Promise<unknown>;
}
const fail = (): never => {
  throw new Error('候选账回执、版本或本地演练权限边界不一致，请重新读取。');
};

/** Affordances only; the server still enforces approval-session and revision ownership. */
export function candidateActions(
  history: Pick<CandidateHistory, 'state' | 'revision'>,
  experiment: HanlinExperiment
): CandidateAction[] {
  if (history.revision >= 1000) return [];
  switch (history.state) {
    case 'UNREVIEWED':
    case 'APPROVED': {
      const result: CandidateAction[] = [];
      if (
        experiment.evaluation.status === 'READY_FOR_REVIEW' &&
        experiment.evaluation.recommended_action === 'PROMOTE_CANDIDATE'
      )
        result.push('APPROVE');
      result.push('REJECT');
      if (history.state === 'APPROVED') result.push('ENABLE');
      return result;
    }
    case 'ENABLED':
    case 'HEALTHY':
      return ['CHECK_HEALTH', 'DEGRADE', 'ROLLBACK'];
    case 'DEGRADED':
      return ['ROLLBACK'];
    default:
      return [];
  }
}

export function decodeCandidateHistory(
  value: unknown,
  experiment: HanlinExperiment
): CandidateHistory {
  const parsed = historySchema.safeParse(value);
  if (!parsed.success) return fail();
  const result = parsed.data;
  if (
    result.experiment_id !== experiment.snapshot.definition.experiment_id ||
    result.revision !== result.events.length
  )
    return fail();
  let previousState: CandidateHistory['state'] = 'UNREVIEWED';
  let selected = experiment.snapshot.baseline_digest;
  let previousArm: string | null = null;
  let previousEvent: string | null = null;
  const ids = new Set<string>();
  const states: Record<CandidateAction, CandidateHistory['state']> = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    ENABLE: 'ENABLED',
    CHECK_HEALTH: 'HEALTHY',
    DEGRADE: 'DEGRADED',
    ROLLBACK: 'ROLLED_BACK',
  };
  for (const [index, event] of result.events.entries()) {
    if (
      !candidateActions(
        { state: previousState, revision: index },
        experiment
      ).includes(event.action) ||
      event.revision !== index + 1 ||
      event.experiment_id !== result.experiment_id ||
      event.snapshot_digest !== experiment.snapshot.snapshot_digest ||
      event.evaluation_digest !== experiment.evaluation.evaluation_digest ||
      event.previous_event_digest !== previousEvent ||
      ids.has(event.event_id)
    )
      return fail();
    if (event.action === 'ENABLE') {
      previousArm = selected;
      selected = experiment.snapshot.candidate_digest;
    }
    if (event.action === 'ROLLBACK')
      selected = experiment.snapshot.baseline_digest;
    previousState = states[event.action];
    if (
      event.state !== previousState ||
      event.selected_arm_digest !== selected ||
      event.previous_arm_digest !== previousArm ||
      event.health_check_scope !==
        (event.action === 'CHECK_HEALTH' ? 'LEDGER_INTEGRITY_ONLY' : 'NOT_RUN')
    )
      return fail();
    previousEvent = event.event_digest;
    ids.add(event.event_id);
  }
  if (result.state !== previousState || result.selected_arm_digest !== selected)
    return fail();
  return result;
}

export function buildCandidateCommand(
  history: CandidateHistory,
  experiment: HanlinExperiment,
  selectedAction: CandidateAction,
  reason: string,
  idempotencyKey: string
): CandidateCommand {
  decodeCandidateHistory(history, experiment);
  if (!candidateActions(history, experiment).includes(selectedAction))
    throw new Error('当前状态不允许此操作，请重新读取候选历史。');
  const parsed = commandSchema.safeParse({
    action: selectedAction,
    expected_revision: history.revision,
    idempotency_key: idempotencyKey,
    snapshot_digest: experiment.snapshot.snapshot_digest,
    evaluation_digest: experiment.evaluation.evaluation_digest,
    reason,
  });
  if (!parsed.success)
    throw new Error('操作理由须为 1–2000 个字符，并使用有效的新幂等键。');
  return parsed.data;
}

export function decodeCandidateAppend(
  value: unknown,
  history: CandidateHistory,
  experiment: HanlinExperiment,
  command: CandidateCommand
): CandidateEvent {
  const parsed = eventSchema.safeParse(value);
  if (!parsed.success) return fail();
  const event = parsed.data;
  if (
    event.action !== command.action ||
    event.reason !== command.reason ||
    command.expected_revision !== history.revision ||
    event.revision !== command.expected_revision + 1 ||
    event.snapshot_digest !== command.snapshot_digest ||
    event.evaluation_digest !== command.evaluation_digest
  )
    return fail();
  decodeCandidateHistory(
    {
      ...history,
      revision: event.revision,
      state: event.state,
      selected_arm_digest: event.selected_arm_digest,
      events: [...history.events, event],
    },
    experiment
  );
  return event;
}
