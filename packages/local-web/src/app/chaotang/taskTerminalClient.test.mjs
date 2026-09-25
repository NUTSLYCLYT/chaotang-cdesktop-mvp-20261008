import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { TASK_TERMINAL_COMMANDS } from './taskTerminalCommands.ts';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'tauriChaotangClient.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'native-task-terminal',
      setup(b) {
        b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({
          path: 'native',
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents:
            'export const invoke=async(command,args)=>{globalThis.__terminalCalls.push([command,args]);return globalThis.__terminalResponse;};',
        }));
        for (const file of [
          'taskFilesContract',
          'taskSessionContract',
          'taskDiffContract',
          'taskExecutionContract',
          'taskTerminalContract',
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

test('native terminal client sends only bounded task and opaque terminal inputs', async () => {
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__terminalCalls = [];
  globalThis.__terminalResponse = { fixture: 'terminal receipt' };
  const terminalId = '33333333-3333-4333-8333-333333333333';
  try {
    await tauriChaotangClient.startTaskTerminal({
      jobId: 'job',
      cols: 100,
      rows: 30,
      workingDirectory: 'D:/untrusted',
    });
    await tauriChaotangClient.readTaskTerminal({
      jobId: 'job',
      terminalId,
      afterSequence: 7,
    });
    await tauriChaotangClient.writeTaskTerminal({
      jobId: 'job',
      terminalId,
      data: 'dir\r',
    });
    await tauriChaotangClient.resizeTaskTerminal({
      jobId: 'job',
      terminalId,
      cols: 120,
      rows: 40,
    });
    await tauriChaotangClient.closeTaskTerminal({ jobId: 'job', terminalId });
    assert.deepEqual(globalThis.__terminalCalls, [
      [TASK_TERMINAL_COMMANDS.start, { jobId: 'job', cols: 100, rows: 30 }],
      [
        TASK_TERMINAL_COMMANDS.read,
        { jobId: 'job', terminalId, afterSequence: 7 },
      ],
      [
        TASK_TERMINAL_COMMANDS.write,
        {
          jobId: 'job',
          terminalId,
          dataBase64: Buffer.from('dir\r').toString('base64'),
        },
      ],
      [
        TASK_TERMINAL_COMMANDS.resize,
        { jobId: 'job', terminalId, cols: 120, rows: 40 },
      ],
      [TASK_TERMINAL_COMMANDS.close, { jobId: 'job', terminalId }],
    ]);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__terminalCalls;
    delete globalThis.__terminalResponse;
  }
});
