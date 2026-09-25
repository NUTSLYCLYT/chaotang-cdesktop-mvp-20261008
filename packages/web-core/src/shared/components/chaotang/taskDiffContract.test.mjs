import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'taskDiffContract.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const contract = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const scope = {
  ownerId: 'owner', generation: '8', bindingId: 'binding', jobId: 'job-one',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
};
const changed = {
  jobId: scope.jobId, workspaceId: scope.workspaceId, sessionId: scope.sessionId,
  state: 'changed', repository: true, head: 'a'.repeat(40), branch: 'main',
  entries: [{ path: 'src/main.rs', oldPath: null, change: 'modified', binary: false }],
  patch: 'diff --git a/src/main.rs b/src/main.rs\n-old\n+new\n', truncated: false,
};

test('task diff accepts only the exact bound task worktree receipt', () => {
  assert.deepEqual(contract.decodeTaskDiff(changed, scope), changed);
  for (const field of ['jobId', 'workspaceId', 'sessionId']) {
    assert.throws(() => contract.decodeTaskDiff({ ...changed, [field]: field === 'jobId' ? 'other' : crypto.randomUUID() }, scope));
  }
});

test('task diff distinguishes no repository, no baseline, clean and changed without fake states', () => {
  for (const value of [
    { ...changed, state: 'not_git_repository', repository: false, head: null, branch: null, entries: [], patch: '' },
    { ...changed, state: 'no_baseline', head: null, entries: [], patch: '' },
    { ...changed, state: 'clean', entries: [], patch: '' },
  ]) assert.doesNotThrow(() => contract.decodeTaskDiff(value, scope));
  assert.throws(() => contract.decodeTaskDiff({ ...changed, state: 'clean' }, scope));
  assert.throws(() => contract.decodeTaskDiff({ ...changed, entries: [{ ...changed.entries[0], change: 'rewritten' }] }, scope));
  assert.throws(() => contract.decodeTaskDiff({ ...changed, patch: 'x'.repeat(10241) }, scope));
});

test('task diff scope gate drops a late result after session replacement', async () => {
  const gate = contract.createTaskDiffScopeGate(scope);
  const ticket = gate.begin();
  let resolve;
  const pending = new Promise((done) => (resolve = done));
  const settlement = gate.settle(ticket, pending, (value) => contract.decodeTaskDiff(value, ticket.scope));
  gate.replace({ ...scope, sessionId: crypto.randomUUID() });
  resolve(changed);
  assert.deepEqual(await settlement, { status: 'discarded' });
});
