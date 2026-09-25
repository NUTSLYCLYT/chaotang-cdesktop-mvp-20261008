import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'taskExecutionContract.ts')],
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
  generation: '9',
  bindingId: 'binding',
  jobId: 'job-one',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  businessAttemptId: 'attempt-a',
};
const execution = {
  jobId: scope.jobId,
  workspaceId: scope.workspaceId,
  sessionId: scope.sessionId,
  businessAttemptId: 'attempt-a',
  executionId: '33333333-3333-4333-8333-333333333333',
  state: 'running',
  exitCode: null,
  startedAt: '2026-09-20T01:00:00Z',
  completedAt: null,
  profile: 'CODEX:CHAOTANG_SUPERVISED',
  entries: [
    { kind: 'stdout', text: '正在分析任务' },
    { kind: 'stderr', text: '一条受限错误' },
  ],
  truncated: false,
};

test('execution inputs expose no executor, path, provider or permission fields', () => {
  assert.deepEqual(
    contract.taskExecutionStartInput({
      jobId: scope.jobId,
      prompt: '完成技术任务',
    }),
    { jobId: scope.jobId, prompt: '完成技术任务' }
  );
  assert.deepEqual(
    contract.taskExecutionReadInput({
      jobId: scope.jobId,
      executionId: execution.executionId,
    }),
    { jobId: scope.jobId, executionId: execution.executionId }
  );
  for (const input of [
    { jobId: scope.jobId, prompt: '' },
    { jobId: scope.jobId, prompt: 'x', permission: 'danger-full-access' },
    { jobId: scope.jobId, executionId: execution.executionId, path: 'C:\\' },
  ]) {
    const fn = Object.hasOwn(input, 'prompt')
      ? contract.taskExecutionStartInput
      : contract.taskExecutionReadInput;
    assert.throws(() => fn(input));
  }
});

test('execution receipt is bound to the exact task and only accepts limited text output', () => {
  assert.deepEqual(contract.decodeTaskExecution(execution, scope), execution);
  assert.equal(
    contract.decodeTaskExecution(
      { ...execution, businessAttemptId: null },
      { ...scope, businessAttemptId: null }
    ).businessAttemptId,
    null
  );
  for (const field of ['jobId', 'workspaceId', 'sessionId']) {
    assert.throws(() =>
      contract.decodeTaskExecution(
        {
          ...execution,
          [field]: field === 'jobId' ? 'other' : crypto.randomUUID(),
        },
        scope
      )
    );
  }
  assert.throws(() =>
    contract.decodeTaskExecution(
      { ...execution, businessAttemptId: '../outside' },
      scope
    )
  );
  assert.throws(() =>
    contract.decodeTaskExecution(
      { ...execution, profile: 'CODEX:DEFAULT' },
      scope
    )
  );
  assert.throws(() =>
    contract.decodeTaskExecution(
      { ...execution, entries: [{ kind: 'tool', text: 'hidden' }] },
      scope
    )
  );
  assert.throws(() =>
    contract.decodeTaskExecution(
      {
        ...execution,
        entries: Array.from({ length: 201 }, () => execution.entries[0]),
      },
      scope
    )
  );
});

test('approval list and responses remain bound and do not support permanent allow', () => {
  const approvals = {
    jobId: scope.jobId,
    workspaceId: scope.workspaceId,
    sessionId: scope.sessionId,
    executionId: execution.executionId,
    entries: [
      {
        approvalId: '44444444-4444-4444-8444-444444444444',
        toolName: 'shell',
        executionProcessId: execution.executionId,
        isQuestion: false,
        createdAt: '2026-09-20T01:00:01Z',
        timeoutAt: '2026-09-20T02:00:01Z',
      },
    ],
  };
  assert.deepEqual(
    contract.decodeTaskExecutionApprovals(
      approvals,
      scope,
      execution.executionId
    ),
    approvals
  );
  assert.deepEqual(
    contract.taskApprovalResponseInput({
      jobId: scope.jobId,
      executionId: execution.executionId,
      approvalId: approvals.entries[0].approvalId,
      response: { decision: 'approve' },
    }),
    {
      jobId: scope.jobId,
      executionId: execution.executionId,
      approvalId: approvals.entries[0].approvalId,
      response: { decision: 'approve' },
    }
  );
  assert.throws(() =>
    contract.taskApprovalResponseInput({
      jobId: scope.jobId,
      executionId: execution.executionId,
      approvalId: approvals.entries[0].approvalId,
      response: { decision: 'approve', alwaysAllow: true },
    })
  );
  assert.throws(() =>
    contract.decodeTaskExecutionApprovals(
      {
        ...approvals,
        entries: [
          { ...approvals.entries[0], executionProcessId: crypto.randomUUID() },
        ],
      },
      scope,
      execution.executionId
    )
  );
});

test('scope gate discards late execution output after owner or session replacement', async () => {
  const gate = contract.createTaskExecutionScopeGate(scope);
  const ticket = gate.begin();
  let resolve;
  const pending = new Promise((done) => (resolve = done));
  const settlement = gate.settle(ticket, pending, (value) =>
    contract.decodeTaskExecution(value, ticket.scope)
  );
  gate.replace({ ...scope, sessionId: crypto.randomUUID() });
  resolve(execution);
  assert.deepEqual(await settlement, { status: 'discarded' });
});
