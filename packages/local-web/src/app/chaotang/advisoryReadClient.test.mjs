import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const advisoryPlugin = {
  name: 'advisory-native',
  setup(b) {
    b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({
      path: 'native',
      namespace: 'stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `export const invoke=async(command,args)=>{globalThis.__advisoryCalls.push([command,args]);return globalThis.__advisoryValue;};`,
    }));
    b.onResolve({ filter: /^@\// }, (args) => ({
      path: resolve(
        import.meta.dirname,
        '../../../../web-core/src',
        args.path.slice(2) + '.ts'
      ),
    }));
  },
};

const [compiled, acceptanceCompiled] = await Promise.all(
  ['tauriChaotangClient.ts', 'acceptanceChaotangClient.ts'].map((entry) =>
    build({
      entryPoints: [resolve(import.meta.dirname, entry)],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      plugins: [advisoryPlugin],
    })
  )
);
const { tauriChaotangClient } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const { createAcceptanceChaotangClient } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(acceptanceCompiled.outputFiles[0].text).toString('base64')
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

test('advisory browser reads keep raw contracts and existing session authentication', async () => {
  const calls = [];
  const raw = {
    advisory_only: true,
    evaluation: { recommended_action: 'KEEP_BASELINE' },
    by_cause: { user_rejected: 2 },
  };
  const { client } = fixture(async (url, options) => {
    calls.push([url, options]);
    return new Response(JSON.stringify(raw));
  });
  assert.deepEqual(await client.shiguanOutcomesOverview(), raw);
  assert.deepEqual(await client.hanlinExperiment('experiment:2026-09.21'), raw);
  assert.deepEqual(
    calls.map(([url]) => url),
    [
      '/fusion-api/api/v1/shiguan/outcomes/overview',
      '/fusion-api/api/v1/hanlin/experiments/experiment%3A2026-09.21',
    ]
  );
  for (const [, options] of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, 'Bearer session-a');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
  }
});

test('browser archive picker uses bounded authenticated HTTP instead of native Tauri', async () => {
  const calls = [];
  const { client } = fixture(async (url, options) => {
    calls.push([url, options]);
    return new Response(
      JSON.stringify([
        {
          id: 'archive-1',
          type: 'REPLY',
          title: '结果回奏',
          department: '工部',
          decision_status: { decision: 'ADOPTED' },
        },
      ])
    );
  });
  const archives = await client.shiguanArchives('REPLY', 50);
  assert.equal(
    calls[0][0],
    '/fusion-api/api/v1/shiguan/archives?type=REPLY&limit=50'
  );
  assert.equal(calls[0][1].headers.Authorization, 'Bearer session-a');
  assert.equal(archives[0].archiveType, 'REPLY');
  assert.equal(archives[0].type, 'REPLY');
  assert.equal(archives[0].decisionStatus.decision, 'ADOPTED');
  assert.throws(() => client.shiguanArchives('REPLY', 501));
  assert.equal(calls.length, 1);
});

test('advisory input rejects path injection without HTTP or native invocation', async () => {
  let requests = 0;
  const { client } = fixture(async () => {
    requests++;
    return new Response('{}');
  });
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__advisoryCalls = [];
  try {
    for (const id of [
      '',
      'short',
      '../experiments/other',
      'https://elsewhere/x',
      'experiment?owner=b',
      'x'.repeat(129),
    ]) {
      await assert.rejects(async () => client.hanlinExperiment(id));
      await assert.rejects(async () =>
        tauriChaotangClient.hanlinExperiment(id)
      );
    }
    assert.equal(requests, 0);
    assert.deepEqual(globalThis.__advisoryCalls, []);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__advisoryCalls;
  }
});

test('advisory native transport passes only experiment ID and preserves unknown raw fields', async () => {
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__advisoryCalls = [];
  globalThis.__advisoryValue = {
    advisory_only: true,
    source_snapshot: { outcome_digest: 'sha256:fixture' },
  };
  try {
    assert.equal(
      await tauriChaotangClient.shiguanOutcomesOverview(),
      globalThis.__advisoryValue
    );
    assert.equal(
      await tauriChaotangClient.hanlinExperiment('experiment_123'),
      globalThis.__advisoryValue
    );
    assert.deepEqual(globalThis.__advisoryCalls, [
      ['chaotang_shiguan_outcomes_overview', undefined],
      ['chaotang_hanlin_experiment', { experimentId: 'experiment_123' }],
    ]);
    delete globalThis.__TAURI_INTERNALS__;
    await assert.rejects(
      () => tauriChaotangClient.shiguanOutcomesOverview(),
      /桌面服务/
    );
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__advisoryCalls;
    delete globalThis.__advisoryValue;
  }
});

test('owner outcome write preserves strict body and archive binding on browser and native transports', async () => {
  const payload = {
    outcome: 'OBSERVING',
    occurred_at: '2026-09-21T08:00:00-05:00',
    idempotency_key: 'outcome-key-123',
    supersedes_event_id: null,
  };
  const raw = {
    event_id: '0123456789abcdef0123456789abcdef',
    archive_id: 'archive-123',
    outcome: 'OBSERVING',
  };
  const calls = [];
  const { client } = fixture(async (url, options) => {
    calls.push([url, options]);
    return new Response(JSON.stringify(raw));
  });
  assert.deepEqual(
    await client.shiguanCreateOutcome('archive-123', payload),
    raw
  );
  assert.equal(
    calls[0][0],
    '/fusion-api/api/v1/shiguan/archives/archive-123/outcomes'
  );
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), payload);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer session-a');

  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__advisoryCalls = [];
  globalThis.__advisoryValue = raw;
  try {
    assert.deepEqual(
      await tauriChaotangClient.shiguanCreateOutcome('archive-123', payload),
      raw
    );
    assert.deepEqual(globalThis.__advisoryCalls, [
      [
        'chaotang_shiguan_create_outcome',
        { archiveId: 'archive-123', payload },
      ],
    ]);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__advisoryCalls;
    delete globalThis.__advisoryValue;
  }
});

test('advisory HTTP rejection never displays backend secrets or treats failure as empty data', async () => {
  const { client, storage } = fixture(
    async () =>
      new Response(JSON.stringify({ detail: 'credential=private-secret' }), {
        status: 401,
      })
  );
  await assert.rejects(
    () => client.shiguanOutcomesOverview(),
    (error) =>
      /401/.test(error.message) && !error.message.includes('private-secret')
  );
  assert.equal(storage.getItem(), null);
});

test('late advisory 401 does not erase a newer account session', async () => {
  let finish;
  const { client, storage } = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = client.hanlinExperiment('experiment_123');
  storage.setItem('', 'session-b');
  finish(new Response('{}', { status: 401 }));
  await assert.rejects(() => pending);
  assert.equal(storage.getItem(), 'session-b');
});
