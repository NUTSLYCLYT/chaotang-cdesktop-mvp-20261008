import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TaskSessionHistoryView} from './TaskSessionHistoryPanel';export const render=p=>renderToStaticMarkup(React.createElement(TaskSessionHistoryView,p));`,
    resolveDir: import.meta.dirname,
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'],
  plugins: [{
    name: 'session-view-boundary',
    setup(b) {
      b.onResolve({ filter: /^@\/shared\/providers\/ChaotangProvider$/ }, () => ({ path: 'provider', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useChaotangClient=()=>({});export const useChaotangProvider=()=>({user:null,authGeneration:0});' }));
    },
  }],
});
const out = resolve(import.meta.dirname, '.task-session-panel-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const { render } = await import(pathToFileURL(out).href);
const common = { supported: true, connected: true, entries: [], onReload() {} };

test('session view distinguishes unsupported, loading, empty and real errors', () => {
  assert.match(render({ ...common, supported: false }), /暂不支持会话记录/);
  assert.match(render({ ...common, loading: true }), /正在读取会话记录/);
  assert.match(render(common), /该会话尚无执行记录/);
  const html = render({ ...common, problem: { kind: 'error', message: '读取失败' } });
  assert.match(html, /role="alert"/);
  assert.match(html, /读取失败/);
  assert.doesNotMatch(html, /尚无执行记录/);
});

test('session view renders real event states and never claims an empty model run', () => {
  const html = render({
    ...common,
    truncated: true,
    entries: [{
      eventId: '33333333-3333-4333-8333-333333333333',
      kind: 'codingagent', state: 'completed', exitCode: 0,
      startedAt: '2026-09-20T01:00:00Z', completedAt: '2026-09-20T01:00:02Z', createdAt: '2026-09-20T01:00:00Z',
    }],
  });
  assert.match(html, /智能体执行/);
  assert.match(html, /已完成/);
  assert.match(html, /退出码 0/);
  assert.match(html, /仅显示最近 200 条/);
  assert.doesNotMatch(render(common), /运行中|智能体正在执行/);
});
