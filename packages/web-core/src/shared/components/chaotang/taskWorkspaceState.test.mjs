import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as state from './taskWorkspaceState.ts';

test('job search accepts safe IDs only, never restores approval', () => {
  assert.equal(typeof state.parseJobSearch, 'function');
  assert.deepEqual(state.parseJobSearch({ job: 'task-123', approved: true }), {
    job: 'task-123',
  });
  assert.deepEqual(state.parseJobSearch({ job: ['a', 'b'] }), {});
  assert.deepEqual(state.parseJobSearch({ job: '../secret' }), {});
});
test('history uses persisted title and filters without changing the source page', () => {
  assert.equal(typeof state.filterTaskHistory, 'function');
  const items = [
    { jobId: 'a', title: '电池质量检查', state: 'SUCCEEDED' },
    { jobId: 'b', title: '采购报价', state: 'FAILED' },
    { jobId: 'c', state: 'FAILED' },
  ];
  assert.deepEqual(state.filterTaskHistory(items, '质量', 'ALL'), [items[0]]);
  assert.deepEqual(
    state.filterTaskHistory(items, '', 'FAILED'),
    items.slice(1)
  );
  assert.equal(state.taskTitle(items[2]), '未命名任务 · c');
  assert.equal(items.length, 3);
});
test('native artifact save locks duplicate clicks and validates an actual receipt', async () => {
  assert.equal(typeof state.createArtifactTransfer, 'function');
  let finish;
  let calls = 0;
  const save = state.createArtifactTransfer();
  const client = {
    saveWorkspaceArtifact: async (job, id) => {
      calls++;
      assert.equal(job, 'job');
      assert.equal(id, 'artifact');
      return new Promise((r) => {
        finish = r;
      });
    },
  };
  const first = save(client, 'job', {
    id: 'artifact',
    displayName: '报告.md',
    downloadPath: '/file',
  });
  assert.equal(
    await save(client, 'job', { id: 'artifact', displayName: '报告.md' }),
    undefined
  );
  assert.equal(calls, 1);
  finish({
    status: 'saved',
    path: 'D:/report.md',
    sha256: 'a'.repeat(64),
    bytes: 4,
  });
  assert.equal((await first).status, 'saved');
  assert.equal(
    (
      await save(
        { saveWorkspaceArtifact: async () => ({ status: 'cancelled' }) },
        'job',
        { id: 'artifact' }
      )
    ).status,
    'cancelled'
  );
  await assert.rejects(
    save({ saveWorkspaceArtifact: async () => ({ status: 'saved' }) }, 'job', {
      id: 'artifact',
    }),
    /保存回执/
  );
  await assert.rejects(
    save(
      {
        saveWorkspaceArtifact: async () => {
          throw new Error('disk full');
        },
      },
      'job',
      { id: 'artifact' }
    ),
    /disk full/
  );
  assert.equal(
    (
      await save(
        { saveWorkspaceArtifact: async () => ({ status: 'cancelled' }) },
        'job',
        { id: 'artifact' }
      )
    ).status,
    'cancelled'
  );
});
test('browser download reports handoff only, not filesystem persistence', async () => {
  assert.equal(typeof state.createArtifactTransfer, 'function');
  let handedOff = false;
  const result = await state.createArtifactTransfer()(
    { downloadWorkspaceArtifact: async () => new Blob(['x']) },
    'job',
    { id: 'artifact', displayName: 'x.md', downloadPath: '/file' },
    () => {
      handedOff = true;
    }
  );
  assert.equal(handedOff, true);
  assert.deepEqual(result, { status: 'handed-off' });
});

test('history paging rejects old/incorrect service contracts instead of pretending complete search', () => {
  assert.equal(typeof state.validateHistoryPage, 'function');
  const request = { q: 'x', limit: 50, offset: 50, archived: 'all' };
  const page = {
    items: [
      { jobId: 'j', title: 'x', state: 'SUCCEEDED', historyArchived: false },
    ],
    total: 51,
    limit: 50,
    offset: 50,
  };
  assert.equal(state.validateHistoryPage(page, request), page);
  assert.throws(
    () => state.validateHistoryPage({ ...page, offset: undefined }, request),
    /历史.*不可用/
  );
  assert.throws(
    () => state.validateHistoryPage({ ...page, offset: 0 }, request),
    /历史.*不可用/
  );
  assert.throws(
    () =>
      state.validateHistoryPage({ ...page, items: [{ jobId: 'j' }] }, request),
    /历史.*不可用/
  );
  assert.equal(typeof state.canArchiveHistory, 'function');
  for (const status of ['SUCCEEDED', 'FAILED', 'CANCELLED'])
    assert.equal(state.canArchiveHistory(status), true);
  for (const status of ['QUEUED', 'RUNNING', 'unknown'])
    assert.equal(state.canArchiveHistory(status), false);
});
test('history mutation accepts only the requested task and archived flag in its receipt', () => {
  assert.equal(typeof state.validateHistoryAnnotation, 'function');
  const result = {
    jobId: 'j',
    historyArchived: false,
    updatedAt: '2026-09-19',
  };
  assert.equal(state.validateHistoryAnnotation(result, 'j', false), result);
  assert.throws(
    () => state.validateHistoryAnnotation(result, 'other', false),
    /历史.*回执/
  );
  assert.throws(
    () =>
      state.validateHistoryAnnotation(
        { ...result, historyArchived: 'false' },
        'j',
        false
      ),
    /历史.*回执/
  );
});
