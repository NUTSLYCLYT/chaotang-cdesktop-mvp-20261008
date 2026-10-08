import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))(
  'esbuild'
);
async function compile(name) {
  const compiled = await build({
    entryPoints: [resolve(import.meta.dirname, name)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'controlled-task-hooks',
        setup(b) {
          b.onResolve({ filter: /^@\/shared\/components\// }, (a) => ({
            path: resolve(
              import.meta.dirname,
              '../../components',
              a.path.split('/components/')[1] + '.ts'
            ),
          }));
          b.onResolve(
            {
              filter:
                /^(@tanstack\/react-query|@\/shared\/(providers\/ChaotangProvider|lib\/chaotangFusion))$/,
            },
            (a) => ({ path: a.path, namespace: 'controlled' })
          );
          b.onLoad({ filter: /.*/, namespace: 'controlled' }, ({ path }) => ({
            contents: path.includes('react-query')
              ? 'export const useMutation=o=>o;export const useQuery=o=>o;export const useQueryClient=()=>globalThis.__taskHookHarness.cache;'
              : path.includes('ChaotangProvider')
                ? 'export const useChaotangClient=()=>globalThis.__taskHookHarness.client;export const useChaotangProvider=()=>globalThis.__taskHookHarness.provider;'
                : 'export const ownerQueryKey=(owner,...parts)=>["chaotang",owner,...parts];',
          }));
        },
      },
    ],
  });
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
}
const hooks = await compile('useChancellor.ts');
const lists = await compile('useDecreeJobs.ts');
afterEach(() => {
  delete globalThis.__taskHookHarness;
});

const receipt = (patch = {}) => ({
  jobId: 'job-a',
  state: 'RUNNING',
  stage: 'dispatch',
  attemptCount: 1,
  providerRequestCount: 2,
  cancelRequested: false,
  result: null,
  error: null,
  createdAt: '2026-09-27T00:00:00Z',
  updatedAt: '2026-09-27T00:01:00Z',
  ...patch,
});
const jobKey = (id, owner = 'owner-a') => ['chaotang', owner, 'decree-job', id];
function setup(response, initial = []) {
  const writes = [],
    calls = [];
  const store = new Map(
    initial.map(([key, value]) => [JSON.stringify(key), value])
  );
  const api = (name) => async (input) => {
    calls.push([name, input]);
    return response;
  };
  const h = {
    provider: { user: { id: 'owner-a' }, health: {} },
    writes,
    calls,
    store,
    read: (key) => store.get(JSON.stringify(key)),
    client: {
      decreeJob: api('read'),
      cancelDecreeJob: api('cancel'),
      retryDecreeJob: api('retry'),
      decreeJobs: api('list'),
    },
    cache: {
      setQueryData: (key, update) => {
        const previous = store.get(JSON.stringify(key));
        const next = typeof update === 'function' ? update(previous) : update;
        writes.push([key, next]);
        store.set(JSON.stringify(key), next);
        return next;
      },
      invalidateQueries: async () => {},
    },
  };
  globalThis.__taskHookHarness = h;
  return h;
}
async function mutate(options, input) {
  const response = await options.mutationFn(input);
  await options.onSuccess?.(response, input);
  return response;
}

test('task reads reject another job receipt and stop polling after an error', async () => {
  setup(receipt({ jobId: 'job-other' }));
  const query = hooks.useDecreeJob('job-a');
  await assert.rejects(query.queryFn(), /回执/);
  assert.equal(query.refetchInterval({ state: { status: 'error' } }), false);
});
test('cancel cannot populate any cache with an unrelated receipt', async () => {
  const h = setup(receipt({ jobId: 'job-other', cancelRequested: true }));
  await assert.rejects(mutate(hooks.useCancelDecreeJob(), 'job-a'), /回执/);
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.calls, [['cancel', 'job-a']]);
});
test('cancel keeps the server running state until termination is actually reported', async () => {
  const value = receipt({ cancelRequested: true });
  const h = setup(value);
  assert.equal(await mutate(hooks.useCancelDecreeJob(), 'job-a'), value);
  assert.deepEqual(h.writes, [
    [['chaotang', 'owner-a', 'decree-job', 'job-a'], value],
  ]);
  assert.equal(value.state, 'RUNNING');
});
test('retry refuses missing predecessor linkage without caching or repeating requests', async () => {
  const h = setup(receipt({ jobId: 'new-job' }));
  await assert.rejects(mutate(hooks.useRetryDecreeJob(), 'job-a'), /原任务/);
  assert.equal(h.writes.length, 0);
  assert.equal(h.calls.length, 1);
});
test('retry accepts a server-created successor and leaves predecessor cache alone', async () => {
  const value = receipt({
    jobId: 'new-job',
    retryOfJobId: 'job-a',
    state: 'QUEUED',
  });
  const h = setup(value);
  assert.equal(await mutate(hooks.useRetryDecreeJob(), 'job-a'), value);
  assert.deepEqual(h.writes[0][0], [
    'chaotang',
    'owner-a',
    'decree-job',
    'new-job',
  ]);
});
test('history refuses malformed or duplicated tasks before projecting counts or statuses', async () => {
  for (const items of [
    [receipt({ state: 'UNKNOWN', historyArchived: false })],
    [receipt({ historyArchived: false }), receipt({ historyArchived: false })],
  ]) {
    setup({ items, total: items.length, limit: 50, offset: 0 });
    await assert.rejects(lists.useDecreeJobs().queryFn(), /回执/);
  }
});
test('history preserves a consistent page and caller criteria', async () => {
  const value = {
    items: [receipt({ historyArchived: false })],
    total: 1,
    limit: 10,
    offset: 0,
  };
  const h = setup(value);
  assert.equal(
    await lists.useDecreeJobs({ limit: 10, q: 'report' }).queryFn(),
    value
  );
  assert.deepEqual(h.calls[0], [
    'list',
    { q: 'report', limit: 10, offset: 0, archived: 'active' },
  ]);
});
test('a late cancel receipt cannot regress a task that already succeeded', async () => {
  const key = jobKey('job-a');
  const succeeded = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:05:00Z',
  });
  const lateCancel = receipt({
    cancelRequested: true,
    updatedAt: '2026-09-27T00:04:00Z',
  });
  const h = setup(lateCancel, [[key, succeeded]]);
  assert.equal(await mutate(hooks.useCancelDecreeJob(), 'job-a'), lateCancel);
  assert.equal(h.read(key).state, 'SUCCEEDED');
  assert.equal(h.writes.length, 1);
  // A terminal state is final even when a later-looking receipt claims activity.
  assert.equal(
    hooks.mergeDecreeJobReceipt(
      succeeded,
      receipt({ state: 'RUNNING', updatedAt: '2026-09-27T00:06:00Z' })
    ).state,
    'SUCCEEDED'
  );
});
test('an in-flight older poll cannot overwrite a newer cancel confirmation', async () => {
  const key = jobKey('job-a');
  const cancelled = receipt({
    state: 'CANCELLED',
    cancelRequested: true,
    updatedAt: '2026-09-27T00:05:00.500000Z',
  });
  const stalePoll = receipt({
    cancelRequested: true,
    updatedAt: '2026-09-27T00:05:00.400000Z',
  });
  setup(stalePoll, [[key, cancelled]]);
  const query = hooks.useDecreeJob('job-a');
  const merged = query.structuralSharing(cancelled, await query.queryFn());
  assert.equal(merged.state, 'CANCELLED');
  assert.equal(merged.updatedAt, cancelled.updatedAt);
});
test('genuinely newer active or terminal snapshots still advance the cache', async () => {
  setup(receipt());
  const query = hooks.useDecreeJob('job-a');
  const earlier = receipt({
    providerRequestCount: 2,
    updatedAt: '2026-09-27T00:01:00Z',
  });
  const later = receipt({
    providerRequestCount: 3,
    updatedAt: '2026-09-27T00:02:00Z',
  });
  assert.equal(query.structuralSharing(earlier, later).providerRequestCount, 3);
  const succeeded = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:03:00Z',
    result: { summary: 'ok' },
  });
  const merged = query.structuralSharing(later, succeeded);
  assert.equal(merged.state, 'SUCCEEDED');
  assert.deepEqual(merged.result, { summary: 'ok' });
});
test('a retried successor keeps its own entry and never inherits a terminal state', async () => {
  const predecessor = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:05:00Z',
  });
  const successor = receipt({
    jobId: 'new-job',
    retryOfJobId: 'job-a',
    state: 'QUEUED',
    updatedAt: '2026-09-27T00:06:00Z',
  });
  const h = setup(successor, [[jobKey('job-a'), predecessor]]);
  assert.equal(await mutate(hooks.useRetryDecreeJob(), 'job-a'), successor);
  assert.deepEqual(
    h.writes.map(([key]) => key),
    [jobKey('new-job')]
  );
  assert.equal(h.read(jobKey('new-job')).state, 'QUEUED');
  assert.equal(h.read(jobKey('job-a')).state, 'SUCCEEDED');
  assert.equal(h.read(jobKey('new-job')).retryOfJobId, 'job-a');
  assert.equal(
    hooks.mergeDecreeJobReceipt(predecessor, successor).state,
    'QUEUED'
  );
});
test('cache merges stay isolated between owners', async () => {
  const h = setup(receipt({ cancelRequested: true }));
  await mutate(hooks.useCancelDecreeJob(), 'job-a');
  h.provider = { user: { id: 'owner-b' }, health: {} };
  await mutate(hooks.useCancelDecreeJob(), 'job-a');
  assert.deepEqual(
    h.writes.map(([key]) => key),
    [jobKey('job-a', 'owner-a'), jobKey('job-a', 'owner-b')]
  );
  assert.equal(h.read(jobKey('job-a', 'owner-a')).jobId, 'job-a');
  assert.equal(h.read(jobKey('job-a', 'owner-b')).jobId, 'job-a');
});
test('a newer snapshot for the same terminal state can complete its result', async () => {
  const pending = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:05:00Z',
    result: null,
  });
  const completed = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:05:01Z',
    result: { summary: 'done' },
  });
  const merged = hooks.mergeDecreeJobReceipt(pending, completed);
  assert.deepEqual(merged.result, { summary: 'done' });
  assert.equal(merged.updatedAt, completed.updatedAt);
  const failed = receipt({
    state: 'FAILED',
    updatedAt: '2026-09-27T00:05:02Z',
  });
  assert.equal(
    hooks.mergeDecreeJobReceipt(completed, failed).state,
    'SUCCEEDED'
  );
});
test('a newer terminal snapshot replaces a cancelling active snapshot verbatim', () => {
  const runningCancelling = receipt({
    cancelRequested: true,
    updatedAt: '2026-09-27T00:05:00Z',
  });
  const succeeded = receipt({
    state: 'SUCCEEDED',
    cancelRequested: false,
    updatedAt: '2026-09-27T00:06:00Z',
    result: { summary: 'ok' },
  });
  const merged = hooks.mergeDecreeJobReceipt(runningCancelling, succeeded);
  // The round-1 helper spread the registered cancel into a third receipt; the
  // server's newer terminal snapshot must be returned untouched instead.
  assert.equal(merged, succeeded);
  assert.equal(merged.cancelRequested, false);
});
test('merge returns one of the two snapshots, never a composed third object', () => {
  const active = receipt({ updatedAt: '2026-09-27T00:01:00Z' });
  const newerActive = receipt({
    updatedAt: '2026-09-27T00:02:00Z',
    providerRequestCount: 4,
  });
  const cancellingActive = receipt({
    cancelRequested: true,
    updatedAt: '2026-09-27T00:01:00Z',
  });
  const terminal = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:03:00Z',
  });
  const newerTerminal = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:04:00Z',
  });
  const otherTerminal = receipt({
    state: 'FAILED',
    updatedAt: '2026-09-27T00:05:00Z',
  });
  assert.equal(hooks.mergeDecreeJobReceipt(active, newerActive), newerActive);
  assert.equal(hooks.mergeDecreeJobReceipt(newerActive, active), newerActive);
  assert.equal(
    hooks.mergeDecreeJobReceipt(active, cancellingActive),
    cancellingActive
  );
  assert.equal(
    hooks.mergeDecreeJobReceipt(cancellingActive, active),
    cancellingActive
  );
  assert.equal(
    hooks.mergeDecreeJobReceipt(terminal, newerTerminal),
    newerTerminal
  );
  assert.equal(
    hooks.mergeDecreeJobReceipt(newerTerminal, terminal),
    newerTerminal
  );
  assert.equal(hooks.mergeDecreeJobReceipt(terminal, otherTerminal), terminal);
  assert.equal(hooks.mergeDecreeJobReceipt(active, terminal), terminal);
});
test('timestamps compare at microsecond precision and across equivalent timezones', () => {
  assert.equal(
    hooks.compareReceiptTimestamps(
      '2026-09-27T00:00:00.123456Z',
      '2026-09-27T00:00:00.123457Z'
    ),
    -1
  );
  assert.equal(
    hooks.compareReceiptTimestamps(
      '2026-09-27T00:00:00.500000Z',
      '2026-09-27T08:00:00.500000+08:00'
    ),
    0
  );
  const older = receipt({
    providerRequestCount: 2,
    updatedAt: '2026-09-27T00:00:00.123456Z',
  });
  const newer = receipt({
    providerRequestCount: 3,
    updatedAt: '2026-09-27T00:00:00.123457Z',
  });
  assert.equal(
    hooks.mergeDecreeJobReceipt(older, newer).providerRequestCount,
    3
  );
  assert.equal(
    hooks.mergeDecreeJobReceipt(newer, older).providerRequestCount,
    3
  );
  const sameInstantCancel = receipt({
    cancelRequested: true,
    updatedAt: '2026-09-27T08:00:00.500000+08:00',
  });
  const noCancel = receipt({
    cancelRequested: false,
    updatedAt: '2026-09-27T00:00:00.500000Z',
  });
  assert.equal(
    hooks.mergeDecreeJobReceipt(noCancel, sameInstantCancel).cancelRequested,
    true
  );
  assert.equal(
    hooks.mergeDecreeJobReceipt(sameInstantCancel, noCancel).cancelRequested,
    true
  );
  const terminal = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:00:00.500000Z',
  });
  const activeSameInstant = receipt({
    state: 'RUNNING',
    updatedAt: '2026-09-27T08:00:00.500000+08:00',
  });
  assert.equal(
    hooks.mergeDecreeJobReceipt(terminal, activeSameInstant).state,
    'SUCCEEDED'
  );
  assert.equal(
    hooks.mergeDecreeJobReceipt(activeSameInstant, terminal).state,
    'SUCCEEDED'
  );
  const first = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:00:00.500000Z',
    result: { a: 1 },
  });
  const second = receipt({
    state: 'SUCCEEDED',
    updatedAt: '2026-09-27T00:00:00.500000Z',
    result: { b: 2 },
  });
  assert.deepEqual(hooks.mergeDecreeJobReceipt(first, second).result, { a: 1 });
  // Early years must stay in chronological order instead of being remapped to
  // 19xx by a manual date construction.
  assert.equal(
    hooks.compareReceiptTimestamps(
      '0099-12-31T23:59:59Z',
      '0100-01-01T00:00:00Z'
    ),
    -1
  );
  // Pre-epoch instants stay ordered below the Unix epoch.
  assert.equal(
    hooks.compareReceiptTimestamps(
      '1969-12-31T23:59:59.999999Z',
      '1970-01-01T00:00:00.000000Z'
    ),
    -1
  );
});
