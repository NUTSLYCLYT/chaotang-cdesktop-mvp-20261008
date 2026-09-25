import { test } from 'node:test';
import assert from 'node:assert/strict';

const contract = await import('./hanlinOutcomeContract.ts').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const digest = 'sha256:' + 'a'.repeat(64);
const at = '2026-09-20T08:00:00Z';
const empty = () => ({
  total: 0,
  achieved: 0,
  partial: 0,
  not_achieved: 0,
  observing: 0,
  conclusive: 0,
  success_rate: null,
  evidence_count: 0,
  basis_digest: digest,
  sources: [],
});
const experiment = () => ({
  snapshot: {
    definition: {
      experiment_id: 'experiment-1',
      title: '真实实验',
      created_at: at,
      minimum_samples_per_arm: 2,
      minimum_quality_gain: 0.1,
      minimum_evidence_score: 0.8,
      maximum_cost_increase_ratio: 1,
      maximum_latency_increase_ratio: 1,
      runtime_artifact_id: null,
    },
    baseline: [],
    candidate: [],
    definition_digest: digest,
    baseline_digest: digest,
    candidate_digest: digest,
    snapshot_digest: digest,
  },
  evaluation: {
    experiment_id: 'experiment-1',
    snapshot_digest: digest,
    status: 'NO_DATA',
    baseline_samples: 0,
    candidate_samples: 0,
    baseline_quality: null,
    candidate_quality: null,
    candidate_evidence: null,
    cost_increase_ratio: null,
    latency_increase_ratio: null,
    reason_codes: ['NO_OBSERVATIONS'],
    recommended_action: 'COLLECT_DATA',
    authority: 'ADVISORY_ONLY',
    runtime_binding_change_allowed: false,
    publish_allowed: false,
    evaluation_digest: digest,
  },
  recorded_at: at,
});

test('authenticated empty overview keeps unknown rate distinct from zero', () => {
  assert.equal(typeof contract.decodeOutcomeOverview, 'function');
  assert.equal(contract.decodeOutcomeOverview(empty()).success_rate, null);
  assert.throws(() =>
    contract.decodeOutcomeOverview({ ...empty(), success_rate: 0 })
  );
});
test('Owner Outcome command and receipt remain bound to one adopted archive', () => {
  const command = contract.buildOutcomeCreateCommand(
    'OBSERVING',
    at,
    'outcome-key-1'
  );
  assert.deepEqual(command, {
    outcome: 'OBSERVING',
    occurred_at: at,
    idempotency_key: 'outcome-key-1',
    supersedes_event_id: null,
  });
  const receipt = {
    event_id: 'b'.repeat(32),
    archive_id: 'archive-1',
    event_kind: 'RECORDED',
    outcome: 'OBSERVING',
    source_type: 'OWNER_ATTESTATION',
    source_auth_level: 'AUTHENTICATED_OWNER_ASSERTION',
    occurred_at: at,
    recorded_at: at,
    archive_digest: digest,
    decision_digest: digest,
    evidence_bundle_digest: digest,
    evidence_count: 2,
    supersedes_event_id: null,
    event_digest: digest,
  };
  assert.equal(
    contract.decodeOutcomeProjection(receipt, 'archive-1').event_id,
    receipt.event_id
  );
  for (const bad of [
    { ...receipt, archive_id: 'archive-2' },
    { ...receipt, source_type: 'MODEL_INFERENCE' },
    { ...receipt, source_auth_level: 'UNAUTHENTICATED' },
    { ...receipt, evidence_count: 0 },
    { ...receipt, publish_allowed: true },
  ])
    assert.throws(() => contract.decodeOutcomeProjection(bad, 'archive-1'));
  assert.throws(() =>
    contract.buildOutcomeCreateCommand('ACHIEVED', 'not-a-time', 'short')
  );
  assert.throws(() => contract.normalizeOutcomeArchiveId('../archive'));
});
test('Outcome archive picker only exposes adopted replies in deterministic order', () => {
  const archive = (patch = {}) => ({
    id: 'archive-1',
    archiveType: 'REPLY',
    title: '核验结果',
    department: '工部',
    createdAt: '2026-09-20T08:00:00Z',
    decisionStatus: { decision: 'ADOPTED', decidedAt: at },
    ...patch,
  });
  const candidates = contract.eligibleOutcomeArchives([
    archive(),
    archive({ id: 'archive-2', createdAt: '2026-09-21T08:00:00Z' }),
    archive({ id: 'rejected', decisionStatus: { decision: 'REJECTED' } }),
    archive({ id: 'memorial', archiveType: 'MEMORIAL' }),
    archive({ id: '../invalid' }),
  ]);
  assert.deepEqual(
    candidates.map((item) => item.id),
    ['archive-2', 'archive-1']
  );
});
test('overview counts and evidence must agree with unique current sources', () => {
  assert.equal(typeof contract.decodeOutcomeOverview, 'function');
  const one = {
    ...empty(),
    total: 1,
    achieved: 1,
    conclusive: 1,
    success_rate: 1,
    evidence_count: 2,
    sources: [
      {
        event_id: 'a'.repeat(32),
        archive_id: 'archive-1',
        outcome: 'ACHIEVED',
        recorded_at: at,
        event_digest: digest,
        evidence_bundle_digest: digest,
        evidence_count: 2,
      },
    ],
  };
  assert.equal(contract.decodeOutcomeOverview(one).total, 1);
  for (const bad of [
    { ...one, evidence_count: 9 },
    { ...one, achieved: 0 },
    { ...one, sources: [{ ...one.sources[0], outcome: 'OBSERVING' }] },
    { ...one, basis_digest: 'invented' },
    { ...one, owner_token: 'must-not-enter' },
  ])
    assert.throws(() => contract.decodeOutcomeOverview(bad));
});
test('experiment reader binds requested identity and immutable snapshot', () => {
  assert.equal(typeof contract.decodeHanlinExperiment, 'function');
  assert.equal(
    contract.decodeHanlinExperiment(experiment(), 'experiment-1').evaluation
      .status,
    'NO_DATA'
  );
  assert.throws(() =>
    contract.decodeHanlinExperiment(experiment(), 'experiment-2')
  );
  const wrong = experiment();
  wrong.evaluation.snapshot_digest = 'sha256:' + 'b'.repeat(64);
  assert.throws(() => contract.decodeHanlinExperiment(wrong, 'experiment-1'));
});
test('advisory records never accept permission escalation or fabricated sample counts', () => {
  assert.equal(typeof contract.decodeHanlinExperiment, 'function');
  for (const patch of [
    { authority: 'PRODUCTION' },
    { publish_allowed: true },
    { runtime_binding_change_allowed: true },
    { baseline_samples: 5 },
  ]) {
    const record = experiment();
    Object.assign(record.evaluation, patch);
    assert.throws(() =>
      contract.decodeHanlinExperiment(record, 'experiment-1')
    );
  }
});
test('experiment identity excludes URL/path injection before any client request', () => {
  assert.equal(typeof contract.normalizeExperimentId, 'function');
  assert.equal(
    contract.normalizeExperimentId('  experiment-1  '),
    'experiment-1'
  );
  for (const input of [
    '',
    'short',
    '../experiment',
    'https://host/exp',
    'a'.repeat(129),
  ])
    assert.throws(() => contract.normalizeExperimentId(input));
});
test('read query keys isolate owners, authentication generations and experiment IDs', () => {
  assert.equal(typeof contract.advisoryReadQueryKey, 'function');
  const key = contract.advisoryReadQueryKey(
    'owner-A',
    1,
    'experiment',
    'experiment-1'
  );
  for (const other of [
    contract.advisoryReadQueryKey('owner-B', 1, 'experiment', 'experiment-1'),
    contract.advisoryReadQueryKey('owner-A', 2, 'experiment', 'experiment-1'),
    contract.advisoryReadQueryKey('owner-A', 1, 'experiment', 'experiment-2'),
  ])
    assert.notDeepEqual(key, other);
});
