import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import {
  assertDesktopRuntime,
  DesktopRuntimeUnavailableError,
  desktopRuntimeMessage,
} from './desktopRuntimeGuard.ts';

test('browser without native IPC receives actionable Chinese guidance', () => {
  for (const runtime of [{}, null, { __TAURI_INTERNALS__: {} }]) {
    assert.throws(
      () => assertDesktopRuntime(runtime),
      (error) => {
        assert.ok(error instanceof DesktopRuntimeUnavailableError);
        assert.equal(error.message, desktopRuntimeMessage);
        assert.doesNotMatch(error.message, /undefined|reading 'invoke'/);
        return true;
      }
    );
  }
});

test('native IPC capability check does not call IPC or an HTTP fallback', () => {
  let calls = 0;
  assertDesktopRuntime({ __TAURI_INTERNALS__: { invoke: () => calls++ } });
  assert.equal(calls, 0);
});

test('actual native client preserves guidance for health and workspace without IPC', async () => {
  const compiled = await build({
    entryPoints: [
      new URL('./tauriChaotangClient.ts', import.meta.url).pathname.replace(
        /^\/([A-Za-z]:)/,
        '$1'
      ),
    ],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  const { tauriChaotangClient } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  for (const request of [
    () => tauriChaotangClient.health(),
    () => tauriChaotangClient.decreeWorkspace('offline-contract-test'),
  ]) {
    await assert.rejects(
      request,
      (error) => error.message === desktopRuntimeMessage
    );
  }
});
