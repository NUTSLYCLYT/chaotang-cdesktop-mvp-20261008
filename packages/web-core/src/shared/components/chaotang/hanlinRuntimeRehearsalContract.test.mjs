import { test } from 'node:test';
import assert from 'node:assert/strict';

const contract = await import('./hanlinRuntimeRehearsalContract.ts').catch(
  (error) => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
);
const digest = (value) => 'sha256:' + value.repeat(64);
const candidate = {
  state: 'HEALTHY',
  events: [{ state: 'HEALTHY', event_digest: digest('c') }],
};
const boundary = {
  scope: 'LOCAL_PROCESS_ISOLATED',
  authority: 'LOCAL_REHEARSAL_ONLY',
  artifact_kind: 'TRUSTED_BUILTIN_PROBE',
  artifact_id: 'trusted-builtin-probe-v1',
  artifact_descriptor_digest: null,
  runtime_version: 'builtin-probe-v1',
  production_binding_change_allowed: false,
  publish_allowed: false,
  model_calls: 0,
};
const empty = () => ({
  ...boundary,
  experiment_id: 'experiment-1',
  revision: 0,
  state: 'NOT_STARTED',
  runtime_health: 'NOT_RUN',
  local_binding_changed: false,
  active_binding_digest: digest('a'),
  process_alive: false,
  events: [],
});
const started = () => ({
  ...boundary,
  event_id: '1'.repeat(32),
  experiment_id: 'experiment-1',
  revision: 1,
  action: 'START',
  state: 'STARTED',
  runtime_health: 'NOT_CHECKED',
  local_binding_changed: false,
  active_binding_digest: digest('a'),
  candidate_event_digest: digest('c'),
  artifact_digest: digest('f'),
  process_id: 123,
  previous_event_digest: null,
  event_digest: digest('e'),
  reason: '启动本地隔离候选探针',
  recorded_at: '2026-09-21T08:00:00Z',
});

test('runtime history validates fixed local-only authority and process receipt', () => {
  assert.equal(typeof contract.decodeRuntimeRehearsalHistory, 'function');
  assert.equal(
    contract.decodeRuntimeRehearsalHistory(
      empty(),
      'experiment-1',
      digest('a'),
      digest('b'),
      candidate
    ).state,
    'NOT_STARTED'
  );
  const value = {
    ...empty(),
    revision: 1,
    state: 'STARTED',
    runtime_health: 'NOT_CHECKED',
    process_alive: true,
    events: [started()],
  };
  assert.equal(
    contract.decodeRuntimeRehearsalHistory(
      value,
      'experiment-1',
      digest('a'),
      digest('b'),
      candidate
    ).events[0].process_id,
    123
  );
  for (const bad of [
    { ...value, publish_allowed: true },
    { ...value, model_calls: 1 },
    { ...value, production_binding_change_allowed: true },
    { ...value, revision: 2 },
    { ...value, events: [{ ...started(), artifact_kind: 'CLIENT_COMMAND' }] },
  ])
    assert.throws(() =>
      contract.decodeRuntimeRehearsalHistory(
        bad,
        'experiment-1',
        digest('a'),
        digest('b'),
        candidate
      )
    );
});

test('runtime history accepts only the closed DeepSeek Harness artifact identity', () => {
  const dshBoundary = {
    ...boundary,
    artifact_kind: 'DEEPSEEK_HARNESS_SCRIPTED_COUNCIL',
    artifact_id: 'deepseek-harness-scripted-council-v1',
    artifact_descriptor_digest: digest('d'),
    runtime_version: '0.1.6-alpha.1',
  };
  const event = { ...started(), ...dshBoundary };
  const history = {
    ...empty(),
    ...dshBoundary,
    revision: 1,
    state: 'STARTED',
    runtime_health: 'NOT_CHECKED',
    process_alive: true,
    events: [event],
  };
  assert.equal(
    contract.decodeRuntimeRehearsalHistory(
      history,
      'experiment-1',
      digest('a'),
      digest('b'),
      candidate
    ).artifact_id,
    'deepseek-harness-scripted-council-v1'
  );
  assert.throws(() =>
    contract.decodeRuntimeRehearsalHistory(
      { ...history, artifact_descriptor_digest: digest('f') },
      'experiment-1',
      digest('a'),
      digest('b'),
      candidate
    )
  );
  assert.deepEqual(
    contract.runtimeRehearsalActions(
      { ...history, state: 'PROBED', revision: 2 },
      candidate
    ),
    ['RUN_DEPARTMENT', 'ROLLBACK']
  );
});

test('DeepSeek Harness department sample receipt is strict and advances to SAMPLED', () => {
  const dshBoundary = {
    ...boundary,
    artifact_kind: 'DEEPSEEK_HARNESS_SCRIPTED_COUNCIL',
    artifact_id: 'deepseek-harness-scripted-council-v1',
    artifact_descriptor_digest: digest('d'),
    runtime_version: '0.1.6-alpha.1',
  };
  const start = { ...started(), ...dshBoundary };
  const probe = {
    ...start,
    event_id: '2'.repeat(32),
    revision: 2,
    action: 'PROBE',
    state: 'PROBED',
    runtime_health: 'HEALTHY',
    previous_event_digest: digest('e'),
    event_digest: digest('1'),
    reason: '核验进程健康',
  };
  const receipt = {
    preset: 'gongbu-delivery',
    bureau: '技术司',
    department_session_id: 'department-session',
    bureau_session_id: 'bureau-session',
    council_task_id: 'council-task',
    model_mode: 'scripted',
    synthetic: true,
    real_model_calls: 0,
    scripted_model_steps: 2,
    tool_calls: 8,
    result_digest: digest('3'),
    result: {
      ready: {
        status: 'READY',
        result: { opinion: '建议补齐参数。', factual_claims: [{}] },
        adopted_evidence_ids: [],
        fact_basis: 'NOT_REQUIRED',
      },
      bureau_outputs: [{ bureau: '技术司' }],
      data_gaps: ['技术司：参数待确认'],
    },
    receipt_digest: digest('4'),
  };
  const sample = {
    ...probe,
    event_id: '3'.repeat(32),
    revision: 3,
    action: 'RUN_DEPARTMENT',
    state: 'SAMPLED',
    previous_event_digest: digest('1'),
    event_digest: digest('2'),
    reason: '执行固定零模型司级样本',
    department_receipt: receipt,
  };
  const history = {
    ...empty(),
    ...dshBoundary,
    revision: 3,
    state: 'SAMPLED',
    runtime_health: 'HEALTHY',
    process_alive: true,
    events: [start, probe, sample],
  };
  assert.equal(
    contract.decodeRuntimeRehearsalHistory(
      history,
      'experiment-1',
      digest('a'),
      digest('b'),
      candidate
    ).events[2].department_receipt.real_model_calls,
    0
  );
  assert.deepEqual(contract.runtimeRehearsalActions(history, candidate), [
    'SWITCH_LOCAL_BINDING',
    'ROLLBACK',
  ]);
  assert.throws(() =>
    contract.decodeRuntimeRehearsalHistory(
      {
        ...history,
        events: [start, probe, { ...sample, department_receipt: null }],
      },
      'experiment-1',
      digest('a'),
      digest('b'),
      candidate
    )
  );
});

test('runtime actions require a healthy candidate and follow the recovery state machine', () => {
  assert.equal(typeof contract.runtimeRehearsalActions, 'function');
  assert.deepEqual(contract.runtimeRehearsalActions(empty(), candidate), [
    'START',
  ]);
  assert.deepEqual(
    contract.runtimeRehearsalActions(
      { ...empty(), state: 'STARTED', revision: 1 },
      candidate
    ),
    ['PROBE', 'ROLLBACK']
  );
  assert.deepEqual(
    contract.runtimeRehearsalActions(
      { ...empty(), state: 'PROBED', revision: 2 },
      candidate
    ),
    ['SWITCH_LOCAL_BINDING', 'ROLLBACK']
  );
  assert.deepEqual(
    contract.runtimeRehearsalActions(
      { ...empty(), state: 'ACTIVE', revision: 3 },
      candidate
    ),
    ['DEGRADE', 'ROLLBACK']
  );
  assert.deepEqual(
    contract.runtimeRehearsalActions(
      { ...empty(), state: 'DEGRADED', revision: 4 },
      candidate
    ),
    ['ROLLBACK']
  );
  assert.deepEqual(
    contract.runtimeRehearsalActions(empty(), {
      state: 'ENABLED',
      events: candidate.events,
    }),
    []
  );
});

test('runtime command freezes revision and healthy candidate head', () => {
  assert.equal(typeof contract.buildRuntimeRehearsalCommand, 'function');
  assert.deepEqual(
    contract.buildRuntimeRehearsalCommand(
      empty(),
      candidate,
      'START',
      '  启动本地隔离候选探针  ',
      'runtime-key-1'
    ),
    {
      action: 'START',
      expected_revision: 0,
      idempotency_key: 'runtime-key-1',
      candidate_event_digest: digest('c'),
      reason: '启动本地隔离候选探针',
    }
  );
  assert.throws(() =>
    contract.buildRuntimeRehearsalCommand(
      empty(),
      { state: 'ENABLED', events: candidate.events },
      'START',
      'reason',
      'runtime-key-1'
    )
  );
});

test('rollback remains pinned to the original healthy candidate after the ledger advances', () => {
  const degradedCandidate = {
    state: 'DEGRADED',
    events: [
      ...candidate.events,
      { state: 'DEGRADED', event_digest: digest('d') },
    ],
  };
  const history = {
    ...empty(),
    revision: 1,
    state: 'STARTED',
    runtime_health: 'NOT_CHECKED',
    process_alive: true,
    events: [started()],
  };
  assert.deepEqual(
    contract.buildRuntimeRehearsalCommand(
      history,
      degradedCandidate,
      'ROLLBACK',
      '候选已降级，恢复基线',
      'runtime-key-rollback'
    ),
    {
      action: 'ROLLBACK',
      expected_revision: 1,
      idempotency_key: 'runtime-key-rollback',
      candidate_event_digest: digest('c'),
      reason: '候选已降级，恢复基线',
    }
  );
});
