import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  stdin: { contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TaskDiffView} from './TaskDiffPanel';export const render=p=>renderToStaticMarkup(React.createElement(TaskDiffView,p));`, resolveDir: import.meta.dirname, loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  external: ['react', 'react-dom/server', 'react/jsx-runtime'],
  plugins: [{ name: 'diff-view-boundary', setup(b) {
    b.onResolve({ filter: /^@\/shared\/providers\/ChaotangProvider$/ }, () => ({ path: 'provider', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useChaotangClient=()=>({});export const useChaotangProvider=()=>({user:null,authGeneration:0});' }));
  }}],
});
const out = resolve(import.meta.dirname, '.task-diff-panel-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const { render } = await import(pathToFileURL(out).href);
const common = { supported: true, connected: true, onReload() {} };
const data = (state) => ({
  jobId: 'job', workspaceId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222',
  state, repository: state !== 'not_git_repository', head: state === 'not_git_repository' || state === 'no_baseline' ? null : 'a'.repeat(40), branch: state === 'not_git_repository' ? null : 'main', entries: [], patch: '', truncated: false,
});

test('diff view distinguishes unsupported, loading, errors, no repo, no baseline and clean', () => {
  assert.match(render({ ...common, supported: false }), /暂不支持任务差异/);
  assert.match(render({ ...common, loading: true }), /正在读取真实差异/);
  assert.match(render({ ...common, problem: { kind: 'error', message: '读取失败' } }), /读取失败/);
  assert.match(render({ ...common, data: data('not_git_repository') }), /不是 Git 仓库/);
  assert.match(render({ ...common, data: data('no_baseline') }), /尚无基线提交/);
  assert.match(render({ ...common, data: data('clean') }), /没有未提交变更/);
});

test('diff view renders actual changed paths and bounded patch', () => {
  const value = data('changed');
  value.entries = [{ path: 'src/main.rs', oldPath: null, change: 'modified', binary: false }];
  value.patch = 'diff --git a/src/main.rs b/src/main.rs\n-old\n+new\n';
  value.truncated = true;
  const html = render({ ...common, data: value });
  assert.match(html, /src\/main.rs/);
  assert.match(html, /已修改/);
  assert.match(html, /-old/);
  assert.match(html, /\+new/);
  assert.match(html, /内容已截断/);
  assert.doesNotMatch(html, /启动执行|打开终端/);
});
