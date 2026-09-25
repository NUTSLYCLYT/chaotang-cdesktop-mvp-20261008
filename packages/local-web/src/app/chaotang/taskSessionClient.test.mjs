import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { TASK_SESSION_COMMAND } from './taskSessionCommands.ts';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'tauriChaotangClient.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'native-session-history',
    setup(b) {
      b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: 'native', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `export const invoke=async(command,args)=>{globalThis.__sessionCalls.push([command,args]);return globalThis.__sessionResponse;};` }));
      for (const file of ['taskFilesContract', 'taskSessionContract', 'taskDiffContract', 'taskExecutionContract']) b.onResolve({ filter: new RegExp(`^@/shared/components/chaotang/${file}$`) }, () => ({ path: resolve(import.meta.dirname, `../../../../web-core/src/shared/components/chaotang/${file}.ts`) }));
    },
  }],
});
const { tauriChaotangClient } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('native session history command sends only the bounded job id', async () => {
  assert.equal(TASK_SESSION_COMMAND, 'chaotang_task_session_history');
  globalThis.__TAURI_INTERNALS__ = { invoke() {} };
  globalThis.__sessionCalls = [];
  globalThis.__sessionResponse = { fixture: 'native receipt' };
  try {
    assert.equal(await tauriChaotangClient.taskSessionHistory({ jobId: 'job' }), globalThis.__sessionResponse);
    assert.deepEqual(globalThis.__sessionCalls, [[TASK_SESSION_COMMAND, { jobId: 'job' }]]);
    await assert.rejects(() => tauriChaotangClient.taskSessionHistory({ jobId: 'job', sessionId: 'caller-controlled' }));
    assert.equal(globalThis.__sessionCalls.length, 1);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__sessionCalls;
    delete globalThis.__sessionResponse;
  }
});
