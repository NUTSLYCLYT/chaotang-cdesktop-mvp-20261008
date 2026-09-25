import { test } from 'node:test';
import assert from 'node:assert/strict';
const contract = await import('./hanlinCandidateContract.ts').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const digest = (value) => 'sha256:' + value.repeat(64);
const experiment = {
  snapshot: {
    definition: { experiment_id: 'experiment-1' },
    baseline_digest: digest('a'),
    candidate_digest: digest('b'),
    snapshot_digest: digest('c'),
  },
  evaluation: {
    evaluation_digest: digest('d'),
    status: 'READY_FOR_REVIEW',
    recommended_action: 'PROMOTE_CANDIDATE',
  },
};
const boundary = {
  scope: 'LOCAL_ISOLATED',
  selection_kind: 'EXPERIMENT_ARM_DIGEST',
  authority: 'LOCAL_REHEARSAL_ONLY',
  runtime_binding_change_allowed: false,
  publish_allowed: false,
  runtime_health: 'NOT_RUN',
};
const history = () => ({
  ...boundary,
  experiment_id: 'experiment-1',
  revision: 0,
  state: 'UNREVIEWED',
  selected_arm_digest: digest('a'),
  events: [],
});
const event = () => ({
  ...boundary,
  event_id: 'a'.repeat(32),
  experiment_id: 'experiment-1',
  revision: 1,
  action: 'APPROVE',
  state: 'APPROVED',
  snapshot_digest: digest('c'),
  evaluation_digest: digest('d'),
  selected_arm_digest: digest('a'),
  previous_arm_digest: null,
  previous_event_digest: null,
  event_digest: digest('e'),
  reason: '人工核验通过',
  recorded_at: '2026-09-21T08:00:00Z',
  health_check_scope: 'NOT_RUN',
});

test('candidate history validates identity, revision chain and local-only authority', () => {
  assert.equal(typeof contract.decodeCandidateHistory, 'function');
  assert.equal(
    contract.decodeCandidateHistory(history(), experiment).state,
    'UNREVIEWED'
  );
  const approved = {
    ...history(),
    revision: 1,
    state: 'APPROVED',
    events: [event()],
  };
  assert.equal(
    contract.decodeCandidateHistory(approved, experiment).events.length,
    1
  );
  for (const bad of [
    { ...approved, revision: 2 },
    { ...approved, experiment_id: 'experiment-2' },
    { ...approved, runtime_health: 'HEALTHY' },
    { ...approved, publish_allowed: true },
    { ...approved, events: [{ ...event(), snapshot_digest: digest('f') }] },
    {
      ...approved,
      events: [{ ...event(), previous_event_digest: digest('e') }],
    },
  ])
    assert.throws(() => contract.decodeCandidateHistory(bad, experiment));
});
test('state actions respect eligibility and terminal or saturated histories', () => {
  assert.equal(typeof contract.candidateActions, 'function');
  const actions = (state) =>
    contract.candidateActions({ ...history(), state }, experiment);
  assert.deepEqual(actions('UNREVIEWED'), ['APPROVE', 'REJECT']);
  assert.deepEqual(actions('APPROVED'), ['APPROVE', 'REJECT', 'ENABLE']);
  assert.deepEqual(actions('ENABLED'), ['CHECK_HEALTH', 'DEGRADE', 'ROLLBACK']);
  assert.deepEqual(actions('HEALTHY'), ['CHECK_HEALTH', 'DEGRADE', 'ROLLBACK']);
  assert.deepEqual(actions('DEGRADED'), ['ROLLBACK']);
  assert.deepEqual(actions('ROLLED_BACK'), []);
  assert.deepEqual(actions('REJECTED'), []);
  assert.deepEqual(
    contract.candidateActions(history(), {
      ...experiment,
      evaluation: { ...experiment.evaluation, status: 'NO_DATA' },
    }),
    ['REJECT']
  );
  assert.deepEqual(
    contract.candidateActions({ ...history(), revision: 1000 }, experiment),
    []
  );
});
test('commands freeze revision and experiment digests, require reason and a fresh idempotency key', () => {
  assert.equal(typeof contract.buildCandidateCommand, 'function');
  const first = contract.buildCandidateCommand(
    history(),
    experiment,
    'APPROVE',
    '  人工核验通过  ',
    'idempotency-1'
  );
  assert.deepEqual(first, {
    action: 'APPROVE',
    expected_revision: 0,
    idempotency_key: 'idempotency-1',
    snapshot_digest: digest('c'),
    evaluation_digest: digest('d'),
    reason: '人工核验通过',
  });
  const second = contract.buildCandidateCommand(
    history(),
    experiment,
    'APPROVE',
    '人工核验通过',
    'idempotency-2'
  );
  assert.notEqual(first.idempotency_key, second.idempotency_key);
  for (const reason of ['', '  ', 'x'.repeat(2001)])
    assert.throws(() =>
      contract.buildCandidateCommand(
        history(),
        experiment,
        'APPROVE',
        reason,
        'idempotency-1'
      )
    );
  assert.throws(() =>
    contract.buildCandidateCommand(
      history(),
      experiment,
      'ENABLE',
      'reason',
      'idempotency-1'
    )
  );
});
test('a mutation is successful only when the returned event matches the frozen command', () => {
  assert.equal(typeof contract.decodeCandidateAppend, 'function');
  const command = {
    action: 'APPROVE',
    expected_revision: 0,
    idempotency_key: 'idempotency-1',
    snapshot_digest: digest('c'),
    evaluation_digest: digest('d'),
    reason: '人工核验通过',
  };
  assert.equal(
    contract.decodeCandidateAppend(event(), history(), experiment, command)
      .revision,
    1
  );
  for (const patch of [
    { reason: 'other' },
    { action: 'REJECT', state: 'REJECTED' },
    { revision: 2 },
    { authority: 'PRODUCTION' },
    { runtime_binding_change_allowed: true },
  ])
    assert.throws(() =>
      contract.decodeCandidateAppend(
        { ...event(), ...patch },
        history(),
        experiment,
        command
      )
    );
});
