import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as Panel from './TaskFilesPanel';export {Panel};export const render=p=>renderToStaticMarkup(React.createElement(Panel.TaskFilesView,p));`,
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
      name: 'task-files-view-boundary',
      setup(b) {
        b.onResolve({ filter: /^@tanstack\/react-query$/ }, () => ({
          path: 'query',
          namespace: 'stub',
        }));
        b.onResolve(
          { filter: /^@\/shared\/providers\/ChaotangProvider$/ },
          () => ({ path: 'provider', namespace: 'stub' })
        );
        b.onResolve({ filter: /^@\// }, (a) => ({
          path: resolve(
            import.meta.dirname,
            '../../../',
            a.path.slice(2) + '.ts'
          ),
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
          contents:
            path === 'query'
              ? 'export const useQuery=()=>({});export const useMutation=()=>({});export const useQueryClient=()=>({});'
              : 'export const useChaotangClient=()=>({});export const useChaotangProvider=()=>({user:null,authGeneration:0});',
        }));
      },
    },
  ],
});
const out = resolve(import.meta.dirname, '.task-files-panel-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const { Panel, render } = await import(pathToFileURL(out).href);

const entry = (relativePath, kind = 'file', bytes = 3) => ({
  relativePath,
  name: relativePath.split('/').at(-1),
  kind,
  bytes: kind === 'directory' ? null : bytes,
  modifiedAt: '2026-09-20T10:00:00Z',
});
const common = {
  supported: true,
  connected: true,
  path: '',
  entries: [],
  artifacts: [],
  targets: {},
  imports: {},
  onOpenDirectory() {},
  onOpenFile() {},
  onBack() {},
  onReload() {},
  onTargetChange() {},
  onImport() {},
};

test('task files view distinguishes unsupported, loading, empty and real errors', () => {
  assert.match(render({ ...common, supported: false }), /暂不支持任务文件/);
  assert.match(render({ ...common, loading: true }), /正在读取任务文件/);
  assert.match(render(common), /当前目录没有文件/);
  const html = render({
    ...common,
    problem: { kind: 'error', message: '403 forbidden' },
  });
  assert.match(html, /role="alert"/);
  assert.match(html, /403 forbidden/);
  assert.doesNotMatch(html, /当前目录没有文件/);
});

test('task files view shows directories, files and bounded text preview without execution claims', () => {
  const html = render({
    ...common,
    path: 'docs',
    entries: [entry('docs/sub', 'directory'), entry('docs/report.txt')],
    truncated: true,
    preview: {
      jobId: 'job',
      workspaceId: 'workspace',
      entry: entry('docs/report.txt'),
      kind: 'text',
      sha256: 'a'.repeat(64),
      text: 'verified text',
      encoding: 'utf-8',
      truncated: true,
    },
  });
  for (const text of [
    'docs',
    'sub',
    'report.txt',
    'verified text',
    '内容仅显示前段',
    '目录内容过多',
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /打开终端|启动执行/);
});

test('preview states never invent binary, unsupported or oversized contents', () => {
  for (const [reason, expected] of [
    ['binary', '二进制文件'],
    ['unsupported_encoding', '文字编码暂不支持'],
    ['too_large', '文件过大'],
  ]) {
    const html = render({
      ...common,
      preview: {
        jobId: 'job',
        workspaceId: 'workspace',
        entry: entry('data.bin', 'file', 999),
        kind: 'not_previewable',
        sha256: reason === 'too_large' ? null : 'a'.repeat(64),
        reason,
      },
    });
    assert.match(html, new RegExp(expected));
    assert.doesNotMatch(html, /verified text/);
  }
});

test('only published artifacts are offered for explicit import and receipts stay distinct', () => {
  const html = render({
    ...common,
    artifacts: [
      {
        id: 'published',
        displayName: '报告.txt',
        kind: 'text',
        state: 'PUBLISHED',
      },
    ],
    targets: { published: '报告.txt' },
    imports: {
      published: {
        result: {
          status: 'already_present',
          jobId: 'job',
          workspaceId: 'workspace',
          entry: entry('报告.txt'),
          sha256: 'a'.repeat(64),
          source: {
            artifactId: 'published',
            sha256: 'a'.repeat(64),
            version: 1,
          },
        },
      },
    },
  });
  assert.match(html, /导入到任务文件/);
  assert.match(html, /内容已存在且校验一致/);
  assert.equal(
    Panel.suggestArtifactPath(' ../CON?.txt ', 'artifact'),
    'artifact.txt'
  );
});
