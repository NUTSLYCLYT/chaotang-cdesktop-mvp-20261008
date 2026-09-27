import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { createAcceptanceChaotangClient } from './acceptanceChaotangClient.test-support.mjs';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'tauriChaotangClient.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'advisory-native',
      setup(b) {
        b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({
          path: 'native',
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `export const invoke=async(command,args)=>{globalThis.__candidateCalls.push([command,args]);return globalThis.__candidateValue;};`,
        }));
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: resolve(
            import.meta.dirname,
            '../../../../web-core/src',
            args.path.slice(2) + '.ts'
          ),
        }));
      },
    },
  ],
});
const { tauriChaotangClient } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

function fixture(transport) {
  let token = 'session-a';
  const storage = {
    getItem: () => token,
    setItem: (_, value) => {
      token = value;
    },
    removeItem: () => {
      token = null;
    },
  };
  return {
    storage,
    client: createAcceptanceChaotangClient({}, transport, storage),
  };
}

const payload = {
  action: 'APPROVE',
  expected_revision: 0,
  idempotency_key: 'retry-key-123',
  snapshot_digest: 'sha256:' + 'a'.repeat(64),
  evaluation_digest: 'sha256:' + 'b'.repeat(64),
  reason: 'reviewed',
};
const runtimePayload = {
  action: 'START',
  expected_revision: 0,
  idempotency_key: 'runtime-key-123',
  candidate_event_digest: 'sha256:' + 'c'.repeat(64),
  reason: 'start isolated process',
};
test('candidate browser authenticated raw GET/POST, exact idempotency and all actions', async () => {
  const calls = [];
  const raw = { scope: 'LOCAL_ISOLATED', runtime_health: 'NOT_RUN' };
  const { client } = fixture(async (url, options) => {
    calls.push([url, options]);
    return new Response(JSON.stringify(raw));
  });
  assert.deepEqual(await client.candidateHistory('experiment:123'), raw);
  for (const action of [
    'APPROVE',
    'REJECT',
    'ENABLE',
    'CHECK_HEALTH',
    'DEGRADE',
    'ROLLBACK',
  ])
    assert.deepEqual(
      await client.appendCandidateEvent('experiment:123', {
        ...payload,
        action,
      }),
      raw
    );
  assert.equal(calls.length, 7);
  for (const [url, o] of calls) {
    assert.equal(
      url,
      '/fusion-api/api/v1/hanlin/experiments/experiment%3A123/candidate-events'
    );
    assert.equal(o.headers.Authorization, 'Bearer session-a');
    assert.equal(o.redirect, 'error');
  }
  assert.equal(calls[0][1].method, 'GET');
  assert.equal(calls[0][1].body, undefined);
  assert.equal(calls[1][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1][1].body), payload);
});
test('candidate native explicit contract preserves raw response', async () => {
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__candidateCalls = [];
  globalThis.__candidateValue = { runtime_health: 'NOT_RUN' };
  try {
    assert.deepEqual(
      await tauriChaotangClient.candidateHistory('experiment_123'),
      globalThis.__candidateValue
    );
    assert.deepEqual(
      await tauriChaotangClient.appendCandidateEvent('experiment_123', payload),
      globalThis.__candidateValue
    );
    assert.deepEqual(globalThis.__candidateCalls, [
      ['chaotang_candidate_history', { experimentId: 'experiment_123' }],
      [
        'chaotang_append_candidate_event',
        { experimentId: 'experiment_123', payload },
      ],
    ]);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
  }
});
test('runtime rehearsal browser and native transports use the fixed authenticated endpoint', async () => {
  const calls = [];
  const raw = {
    scope: 'LOCAL_PROCESS_ISOLATED',
    publish_allowed: false,
  };
  const { client } = fixture(async (url, options) => {
    calls.push([url, options]);
    return new Response(JSON.stringify(raw));
  });
  assert.deepEqual(await client.runtimeRehearsalHistory('experiment:123'), raw);
  assert.deepEqual(
    await client.appendRuntimeRehearsalEvent('experiment:123', runtimePayload),
    raw
  );
  assert.equal(
    calls[0][0],
    '/fusion-api/api/v1/hanlin/experiments/experiment%3A123/runtime-rehearsal-events'
  );
  assert.equal(calls[0][1].method, 'GET');
  assert.equal(calls[1][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1][1].body), runtimePayload);

  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__candidateCalls = [];
  globalThis.__candidateValue = raw;
  try {
    await tauriChaotangClient.runtimeRehearsalHistory('experiment_123');
    await tauriChaotangClient.appendRuntimeRehearsalEvent(
      'experiment_123',
      runtimePayload
    );
    assert.deepEqual(globalThis.__candidateCalls, [
      [
        'chaotang_runtime_rehearsal_history',
        { experimentId: 'experiment_123' },
      ],
      [
        'chaotang_append_runtime_rehearsal_event',
        { experimentId: 'experiment_123', payload: runtimePayload },
      ],
    ]);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
  }
});
test('candidate invalid identity and payload never reaches transport', async () => {
  let calls = 0;
  const { client } = fixture(async () => {
    calls++;
    return new Response('{}');
  });
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__candidateCalls = [];
  try {
    for (const c of [client, tauriChaotangClient]) {
      for (const id of [
        '',
        '../outside',
        'experiment?owner=a',
        'https://invalid/x',
        'x'.repeat(129),
      ]) {
        await assert.rejects(() => c.candidateHistory(id));
        await assert.rejects(() => c.appendCandidateEvent(id, payload));
      }
      for (const value of [
        null,
        {},
        ...['owner', 'runtime', 'publish', 'url', 'toJSON'].map((k) => ({
          ...payload,
          [k]: 'bad',
        })),
        ...[-1, 1001, 0.5, true].map((expected_revision) => ({
          ...payload,
          expected_revision,
        })),
        { ...payload, action: 'PUBLISH' },
        { ...payload, snapshot_digest: 'bad' },
        { ...payload, evaluation_digest: 'bad' },
        { ...payload, idempotency_key: '../bad/id' },
        { ...payload, reason: ' ' },
        { ...payload, reason: 'x'.repeat(2001) },
      ])
        await assert.rejects(() =>
          c.appendCandidateEvent('experiment_123', value)
        );
    }
    assert.equal(calls, 0);
    assert.deepEqual(globalThis.__candidateCalls, []);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
  }
});
test('candidate conflict redacts body and never retries', async () => {
  let calls = 0;
  const { client } = fixture(async () => {
    calls++;
    return new Response('{"detail":"secret-body"}', { status: 409 });
  });
  await assert.rejects(
    () => client.appendCandidateEvent('experiment_123', payload),
    (e) => /409/.test(e.message) && !e.message.includes('secret-body')
  );
  assert.equal(calls, 1);
});
test('candidate late unauthorized response preserves newer session', async () => {
  let finish;
  const { client, storage } = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = client.appendCandidateEvent('experiment_123', payload);
  storage.setItem('', 'session-b');
  finish(new Response('{}', { status: 401 }));
  await assert.rejects(() => pending);
  assert.equal(storage.getItem(), 'session-b');
});
