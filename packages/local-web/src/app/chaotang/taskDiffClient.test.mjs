import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { TASK_DIFF_COMMAND } from './taskDiffCommands.ts';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'tauriChaotangClient.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'native-task-diff', setup(b) {
    b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: 'native', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `export const invoke=async(command,args)=>{globalThis.__diffCalls.push([command,args]);return globalThis.__diffResponse;};` }));
    for (const file of ['taskFilesContract', 'taskSessionContract', 'taskDiffContract', 'taskExecutionContract']) b.onResolve({ filter: new RegExp(`^@/shared/components/chaotang/${file}$`) }, () => ({ path: resolve(import.meta.dirname, `../../../../web-core/src/shared/components/chaotang/${file}.ts`) }));
  }}],
});
const { tauriChaotangClient } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('native task diff command sends only the bounded job id', async () => {
  assert.equal(TASK_DIFF_COMMAND, 'chaotang_task_diff');
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__diffCalls = [];
  globalThis.__diffResponse = { fixture: 'native diff receipt' };
  try {
    assert.equal(await tauriChaotangClient.taskDiff({ jobId: 'job' }), globalThis.__diffResponse);
    assert.deepEqual(globalThis.__diffCalls, [[TASK_DIFF_COMMAND, { jobId: 'job' }]]);
    await assert.rejects(() => tauriChaotangClient.taskDiff({ jobId: 'job', workspaceId: 'caller-controlled' }));
    assert.equal(globalThis.__diffCalls.length, 1);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__diffCalls;
    delete globalThis.__diffResponse;
  }
});
