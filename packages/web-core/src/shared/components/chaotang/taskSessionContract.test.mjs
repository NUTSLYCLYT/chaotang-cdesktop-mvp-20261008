import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'taskSessionContract.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const contract = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

const scope = {
  ownerId: 'owner',
  generation: '3',
  bindingId: 'binding',
  jobId: 'job-one',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
};
const event = {
  eventId: '33333333-3333-4333-8333-333333333333',
  kind: 'codingagent',
  state: 'completed',
  exitCode: 0,
  startedAt: '2026-09-20T01:00:00Z',
  completedAt: '2026-09-20T01:00:02Z',
  createdAt: '2026-09-20T01:00:00Z',
};
const receipt = {
  jobId: scope.jobId,
  workspaceId: scope.workspaceId,
  sessionId: scope.sessionId,
  entries: [event],
  truncated: false,
};

test('session history accepts only the exact bound task, workspace and session', () => {
  assert.deepEqual(contract.decodeTaskSessionHistory(receipt, scope), receipt);
  for (const field of ['jobId', 'workspaceId', 'sessionId']) {
    assert.throws(() =>
      contract.decodeTaskSessionHistory(
        { ...receipt, [field]: field === 'jobId' ? 'other' : crypto.randomUUID() },
        scope
      )
    );
  }
});

test('session history rejects invented states, duplicate events and invalid times', () => {
  assert.throws(() =>
    contract.decodeTaskSessionHistory(
      { ...receipt, entries: [{ ...event, state: 'successful' }] },
      scope
    )
  );
  assert.throws(() =>
    contract.decodeTaskSessionHistory(
      { ...receipt, entries: [event, event] },
      scope
    )
  );
  assert.throws(() =>
    contract.decodeTaskSessionHistory(
      { ...receipt, entries: [{ ...event, startedAt: 'today' }] },
      scope
    )
  );
});

test('session scope gate discards a late result after account or binding replacement', async () => {
  const gate = contract.createTaskSessionScopeGate(scope);
  const ticket = gate.begin();
  let resolve;
  const pending = new Promise((done) => (resolve = done));
  const settlement = gate.settle(ticket, pending, (value) =>
    contract.decodeTaskSessionHistory(value, ticket.scope)
  );
  gate.replace({ ...scope, generation: '4', sessionId: crypto.randomUUID() });
  resolve(receipt);
  assert.deepEqual(await settlement, { status: 'discarded' });
});

test('session history errors use exact codes and do not turn unknown failures into empty data', () => {
  assert.equal(contract.taskSessionError('OWNER_BINDING_NOT_FOUND').kind, 'unlinked');
  assert.equal(contract.taskSessionError('TASK_SESSION_UNSUPPORTED').kind, 'unsupported');
  assert.equal(contract.taskSessionError('403 forbidden').kind, 'error');
});
