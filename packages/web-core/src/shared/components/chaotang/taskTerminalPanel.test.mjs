import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TaskTerminalView,createTerminalReadGate} from './TaskTerminalPanel';export const render=p=>renderToStaticMarkup(React.createElement(TaskTerminalView,p));export {createTerminalReadGate};`,
    resolveDir: import.meta.dirname,
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'],
  plugins: [
    {
      name: 'terminal-view-boundary',
      setup(b) {
        b.onResolve(
          { filter: /^@\/shared\/providers\/ChaotangProvider$/ },
          () => ({ path: 'provider', namespace: 'stub' })
        );
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const useChaotangClient=()=>({});',
        }));
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: resolve(import.meta.dirname, '../../../', args.path.slice(2)),
        }));
      },
    },
  ],
});
const out = resolve(import.meta.dirname, '.task-terminal-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const { render, createTerminalReadGate } = await import(
  pathToFileURL(out).href
);

const common = {
  supported: true,
  connected: true,
  output: '',
  input: '',
  busy: false,
  onStart() {},
  onInputChange() {},
  onSend() {},
  onClose() {},
};

test('terminal view requires explicit start and exposes bounded controls', () => {
  assert.match(render({ ...common, supported: false }), /暂不支持任务终端/);
  const idle = render(common);
  assert.match(idle, /启动或恢复任务终端/);
  assert.doesNotMatch(idle, /工作目录|shellPath|workspaceId/);
  const active = render({ ...common, terminalId: 'opaque', output: 'PS> dir' });
  assert.match(active, /发送命令/);
  assert.match(active, /关闭终端/);
});

test('terminal poll gate permits only one in-flight read and releases afterward', async () => {
  const gate = createTerminalReadGate();
  let release;
  let calls = 0;
  const first = gate.run(
    () =>
      new Promise((resolve) => {
        calls += 1;
        release = resolve;
      })
  );
  assert.equal(await gate.run(async () => ++calls), undefined);
  assert.equal(calls, 1);
  release('first');
  assert.equal(await first, 'first');
  assert.equal(await gate.run(async () => ++calls), 2);
});
