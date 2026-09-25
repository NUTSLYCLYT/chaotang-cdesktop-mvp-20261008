import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { TASK_EXECUTION_COMMANDS } from './taskExecutionCommands.ts';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'tauriChaotangClient.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'native-task-execution',
      setup(b) {
        b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({
          path: 'native',
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents:
            'export const invoke=async(command,args)=>{globalThis.__executionCalls.push([command,args]);return globalThis.__executionResponse;};',
        }));
        for (const file of [
          'taskFilesContract',
          'taskSessionContract',
          'taskDiffContract',
          'taskExecutionContract',
        ])
          b.onResolve(
            { filter: new RegExp(`^@/shared/components/chaotang/${file}$`) },
            () => ({
              path: resolve(
                import.meta.dirname,
                `../../../../web-core/src/shared/components/chaotang/${file}.ts`
              ),
            })
          );
      },
    },
  ],
});
const { tauriChaotangClient } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

test('native execution client exposes only bounded inputs for all five commands', async () => {
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__executionCalls = [];
  globalThis.__executionResponse = { fixture: 'native execution receipt' };
  const executionId = '33333333-3333-4333-8333-333333333333';
  const approvalId = '44444444-4444-4444-8444-444444444444';
  try {
    await tauriChaotangClient.startTaskExecution({
      jobId: 'job',
      prompt: '完成技术任务',
    });
    await tauriChaotangClient.readTaskExecution({ jobId: 'job', executionId });
    await tauriChaotangClient.cancelTaskExecution({
      jobId: 'job',
      executionId,
    });
    await tauriChaotangClient.taskExecutionApprovals({
      jobId: 'job',
      executionId,
    });
    await tauriChaotangClient.respondTaskExecutionApproval({
      jobId: 'job',
      executionId,
      approvalId,
      response: { decision: 'approve' },
    });
    assert.deepEqual(globalThis.__executionCalls, [
      [TASK_EXECUTION_COMMANDS.start, { jobId: 'job', prompt: '完成技术任务' }],
      [TASK_EXECUTION_COMMANDS.read, { jobId: 'job', executionId }],
      [TASK_EXECUTION_COMMANDS.cancel, { jobId: 'job', executionId }],
      [TASK_EXECUTION_COMMANDS.approvals, { jobId: 'job', executionId }],
      [
        TASK_EXECUTION_COMMANDS.respondApproval,
        {
          jobId: 'job',
          executionId,
          approvalId,
          response: { decision: 'approve' },
        },
      ],
    ]);
    await assert.rejects(() =>
      tauriChaotangClient.startTaskExecution({
        jobId: 'job',
        prompt: 'x',
        permission: 'danger-full-access',
      })
    );
    await assert.rejects(() =>
      tauriChaotangClient.respondTaskExecutionApproval({
        jobId: 'job',
        executionId,
        approvalId,
        response: { decision: 'approve', alwaysAllow: true },
      })
    );
    assert.equal(globalThis.__executionCalls.length, 5);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__executionCalls;
    delete globalThis.__executionResponse;
  }
});
