import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TaskPreviewView,securePreviewDocument,acceptTaskHtmlPreview} from './TaskPreviewPanel';export const render=p=>renderToStaticMarkup(React.createElement(TaskPreviewView,p));export {securePreviewDocument,acceptTaskHtmlPreview};`,
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
      name: 'preview-view-boundary',
      setup(b) {
        b.onResolve(
          { filter: /^@\/shared\/providers\/ChaotangProvider$/ },
          () => ({ path: 'provider', namespace: 'stub' })
        );
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents:
            'export const useChaotangClient=()=>({});export const useChaotangProvider=()=>({user:null,authGeneration:0});',
        }));
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: resolve(import.meta.dirname, '../../../', args.path.slice(2)),
        }));
      },
    },
  ],
});
const out = resolve(import.meta.dirname, '.task-preview-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const { render, securePreviewDocument, acceptTaskHtmlPreview } = await import(
  pathToFileURL(out).href
);

const common = {
  supported: true,
  connected: true,
  path: '',
  busy: false,
  onPathChange() {},
  onOpen() {},
  onClose() {},
};

test('static preview requires an explicit bound HTML path', () => {
  assert.match(render({ ...common, supported: false }), /暂不支持任务预览/);
  const idle = render(common);
  assert.match(idle, /输入任务内 HTML 文件路径/);
  assert.match(idle, /打开安全预览/);
  const open = render({
    ...common,
    path: 'draft.html',
    openedPath: 'report.html',
    document: '<p>实际任务页面</p>',
    sha256: 'a'.repeat(64),
  });
  assert.match(open, /iframe/);
  assert.match(open, /实际任务页面/);
  assert.match(open, /任务静态预览：report.html/);
  assert.doesNotMatch(open, /任务静态预览：draft.html/);
  assert.doesNotMatch(open, /allow-scripts|allow-same-origin/);
});

test('preview document applies a restrictive CSP before task HTML', () => {
  const document = securePreviewDocument(
    '<script>fetch("https://outside.example")</script><p>报告</p>'
  );
  assert.ok(
    document.indexOf('Content-Security-Policy') < document.indexOf('<script>')
  );
  assert.match(document, /default-src &#39;none&#39;|default-src 'none'/);
  assert.match(document, /connect-src &#39;none&#39;|connect-src 'none'/);
});

test('preview accepts only a complete bound HTML receipt', () => {
  const scope = {
    ownerId: 'owner',
    generation: '1',
    bindingId: 'binding',
    jobId: 'job',
    workspaceId: 'workspace',
  };
  const receipt = {
    jobId: 'job',
    workspaceId: 'workspace',
    entry: {
      relativePath: 'reports/result.html',
      name: 'result.html',
      kind: 'file',
      bytes: 13,
      modifiedAt: null,
    },
    kind: 'text',
    sha256: 'a'.repeat(64),
    text: '<p>result</p>',
    encoding: 'utf-8',
    truncated: false,
  };
  const accepted = acceptTaskHtmlPreview(receipt, scope, 'reports/result.html');
  assert.equal(accepted.sha256, receipt.sha256);
  assert.match(accepted.document, /Content-Security-Policy/);
  assert.throws(
    () => acceptTaskHtmlPreview(receipt, scope, 'reports/result.txt'),
    /仅支持/
  );
  assert.throws(
    () =>
      acceptTaskHtmlPreview(
        { ...receipt, workspaceId: 'other' },
        scope,
        'reports/result.html'
      ),
    /无效/
  );
  assert.throws(
    () =>
      acceptTaskHtmlPreview(
        { ...receipt, truncated: true },
        scope,
        'reports/result.html'
      ),
    /截断/
  );
});
