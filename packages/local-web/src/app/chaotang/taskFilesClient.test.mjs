import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { createAcceptanceChaotangClient } from './acceptanceChaotangClient.ts';
import * as commands from './taskFilesCommands.ts';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'tauriChaotangClient.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'native-task-files',
      setup(b) {
        b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({
          path: 'native',
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `export const invoke=async(command,args)=>{globalThis.__taskFileCalls.push([command,args]);if(globalThis.__taskFileError)throw globalThis.__taskFileError;return globalThis.__taskFileResponse;};`,
        }));
        b.onResolve(
          { filter: /^@\/shared\/components\/chaotang\/taskFilesContract$/ },
          () => ({
            path: resolve(
              import.meta.dirname,
              '../../../../web-core/src/shared/components/chaotang/taskFilesContract.ts'
            ),
          })
        );
        for (const file of [
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

test('task-files native commands are centralized and send only explicit narrow inputs', async () => {
  assert.deepEqual(commands.TASK_FILES_COMMANDS, {
    list: 'chaotang_list_task_files',
    read: 'chaotang_read_task_file',
    import: 'chaotang_import_task_artifact',
  });
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__taskFileCalls = [];
  globalThis.__taskFileResponse = { fixture: 'raw transport receipt' };
  try {
    await tauriChaotangClient.listTaskFiles({ jobId: 'job', relativePath: '' });
    await tauriChaotangClient.readTaskFile({
      jobId: 'job',
      relativePath: 'report.txt',
    });
    const receipt = await tauriChaotangClient.importTaskArtifact({
      jobId: 'job',
      artifactId: 'artifact',
      relativePath: 'report.txt',
    });
    assert.equal(receipt, globalThis.__taskFileResponse);
    assert.deepEqual(globalThis.__taskFileCalls, [
      [commands.TASK_FILES_COMMANDS.list, { jobId: 'job', relativePath: '' }],
      [
        commands.TASK_FILES_COMMANDS.read,
        { jobId: 'job', relativePath: 'report.txt' },
      ],
      [
        commands.TASK_FILES_COMMANDS.import,
        { jobId: 'job', artifactId: 'artifact', relativePath: 'report.txt' },
      ],
    ]);
    const count = globalThis.__taskFileCalls.length;
    await assert.rejects(() =>
      tauriChaotangClient.listTaskFiles({
        jobId: 'job',
        relativePath: '',
        owner: 'B',
      })
    );
    await assert.rejects(() =>
      tauriChaotangClient.readTaskFile({
        jobId: 'job',
        relativePath: '../outside',
      })
    );
    assert.equal(globalThis.__taskFileCalls.length, count);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__taskFileCalls;
    delete globalThis.__taskFileResponse;
  }
});
test('native failure is not success and a browser cannot invoke native task files', async () => {
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__taskFileCalls = [];
  globalThis.__taskFileError = 'TASK_FILES_UNPROVISIONED';
  try {
    await assert.rejects(
      () =>
        tauriChaotangClient.listTaskFiles({ jobId: 'job', relativePath: '' }),
      (error) => error.message === 'TASK_FILES_UNPROVISIONED'
    );
    delete globalThis.__TAURI_INTERNALS__;
    await assert.rejects(
      () =>
        tauriChaotangClient.readTaskFile({
          jobId: 'job',
          relativePath: 'a.txt',
        }),
      (error) => error.name === 'DesktopRuntimeUnavailableError'
    );
    assert.equal(globalThis.__taskFileCalls.length, 1);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__taskFileCalls;
    delete globalThis.__taskFileError;
  }
});
test('browser adapter strips inherited native resource methods and does not auto read or import', () => {
  let calls = 0;
  const native = {
    listTaskFiles: () => calls++,
    readTaskFile: () => calls++,
    importTaskArtifact: () => calls++,
    taskSessionHistory: () => calls++,
    taskDiff: () => calls++,
    startTaskExecution: () => calls++,
    readTaskExecution: () => calls++,
    cancelTaskExecution: () => calls++,
    taskExecutionApprovals: () => calls++,
    respondTaskExecutionApproval: () => calls++,
  };
  const browser = createAcceptanceChaotangClient(
    native,
    () => {
      throw new Error('no implicit request');
    },
    { getItem: () => null, setItem() {}, removeItem() {} }
  );
  assert.equal(browser.listTaskFiles, undefined);
  assert.equal(browser.readTaskFile, undefined);
  assert.equal(browser.importTaskArtifact, undefined);
  assert.equal(browser.taskSessionHistory, undefined);
  assert.equal(browser.taskDiff, undefined);
  assert.equal(browser.startTaskExecution, undefined);
  assert.equal(browser.readTaskExecution, undefined);
  assert.equal(browser.cancelTaskExecution, undefined);
  assert.equal(browser.taskExecutionApprovals, undefined);
  assert.equal(browser.respondTaskExecutionApproval, undefined);
  assert.equal(calls, 0);
});
