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
function setup(response) {
  const writes = [],
    calls = [];
  const api = (name) => async (input) => {
    calls.push([name, input]);
    return response;
  };
  const h = {
    provider: { user: { id: 'owner-a' }, health: {} },
    writes,
    calls,
    client: {
      decreeJob: api('read'),
      cancelDecreeJob: api('cancel'),
      retryDecreeJob: api('retry'),
      decreeJobs: api('list'),
    },
    cache: {
      setQueryData: (...args) => writes.push(args),
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
