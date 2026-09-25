import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as Hooks from '../../hooks/chaotang/useChancellor';import * as Card from './TaskDesktopResources';export {Hooks,Card};export const render=p=>{if(!Card.DesktopResourcesView)throw new Error('resource view absent');return renderToStaticMarkup(React.createElement(Card.DesktopResourcesView,p));};`,
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
      name: 'owner-resource-boundary',
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
              ? 'export const useQuery=x=>x;export const useMutation=x=>x;export const useQueryClient=()=>({setQueryData:(...args)=>globalThis.__resources.writes.push(args),invalidateQueries:async()=>{}});'
              : 'export const useChaotangClient=()=>globalThis.__resources.client;export const useChaotangProvider=()=>({user:{id:globalThis.__resources.owner},health:{status:"ok"}});',
        }));
      },
    },
  ],
});
const out = resolve(import.meta.dirname, '.desktop-resource-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const { Hooks, render } = await import(pathToFileURL(out).href);
const fixture = () => ({
  jobId: 'job',
  binding: {
    bindingId: 'binding',
    jobId: 'job',
    installationId: 'installation',
    workspaceId: 'workspace',
    sessionId: 'session',
    resourceFingerprint: 'fingerprint',
    businessAttemptId: 'attempt-a',
    createdAt: 'today',
  },
  workspace: {
    id: 'workspace',
    name: null,
    branch: 'main',
    archived: false,
    useWorktree: false,
    createdAt: 'today',
    updatedAt: 'today',
  },
  session: {
    id: 'session',
    workspaceId: 'workspace',
    name: null,
    executor: null,
    createdAt: 'today',
    updatedAt: 'today',
  },
  filesAvailable: true,
  executionAvailable: true,
  terminalAvailable: true,
  previewAvailable: true,
});
test('owner query reads without creation, mutations require explicit call and cache remains owner/job scoped', async () => {
  const calls = [];
  globalThis.__resources = {
    owner: 'A',
    writes: [],
    client: {
      decreeDesktopResources: async (id) => {
        calls.push(['read', id]);
        return fixture();
      },
      linkDecreeWorkspace: async (id) => {
        calls.push(['link', id]);
        return fixture();
      },
    },
  };
  const read = Hooks.useDecreeDesktopResources('job'),
    link = Hooks.useLinkDecreeWorkspace('job');
  assert.deepEqual(calls, []);
  assert.equal(read.enabled, true);
  await read.queryFn();
  assert.deepEqual(calls, [['read', 'job']]);
  const linked = await link.mutationFn();
  globalThis.__resources.owner = 'B';
  await link.onSuccess(linked);
  assert.deepEqual(calls, [
    ['read', 'job'],
    ['link', 'job'],
  ]);
  assert.deepEqual(globalThis.__resources.writes[0][0], read.queryKey);
  assert.notDeepEqual(
    Hooks.useDecreeDesktopResources('job').queryKey,
    read.queryKey
  );
  assert.notDeepEqual(
    Hooks.useDecreeDesktopResources('other').queryKey,
    read.queryKey
  );
  assert.notDeepEqual(
    Hooks.useDecreeDesktopResources('job', 'attempt-b').queryKey,
    Hooks.useDecreeDesktopResources('job', 'attempt-a').queryKey
  );
});
test('unsupported or malformed metadata cannot produce a success cache entry', async () => {
  globalThis.__resources = { owner: 'A', writes: [], client: {} };
  assert.equal(Hooks.useDecreeDesktopResources('job').enabled, false);
  await assert.rejects(
    () => Hooks.useLinkDecreeWorkspace('job').mutationFn(),
    /暂不支持/
  );
  globalThis.__resources.client.linkDecreeWorkspace = async () => ({
    ...fixture(),
    jobId: 'other',
  });
  await assert.rejects(
    () => Hooks.useLinkDecreeWorkspace('job').mutationFn(),
    /不一致/
  );
});
test('resource view separates pending, missing, unavailable, permission error and browser unsupported', () => {
  const common = {
    supported: true,
    connected: true,
    onRead: () => {},
    onLink: () => {},
  };
  assert.match(render({ ...common, loading: true }), /正在读取技术工作区/);
  const missing = render({
    ...common,
    error: new Error('OWNER_BINDING_NOT_FOUND'),
  });
  assert.match(missing, /尚未关联/);
  assert.match(missing, /关联技术工作区/);
  for (const message of ['OWNER_RUNTIME_UNAVAILABLE', '403 forbidden']) {
    const html = render({ ...common, error: new Error(message) });
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /关联技术工作区<\/button>/);
  }
  assert.match(render({ ...common, supported: false }), /当前客户端暂不支持/);
  const pending = render({
    ...common,
    error: new Error('OWNER_BINDING_NOT_FOUND'),
    linking: true,
  });
  assert.match(pending, /<button[^>]*disabled=""[^>]*>正在关联/);
});
test('linked resource card shows real metadata and no old workspace route', () => {
  const html = render({
    supported: true,
    connected: true,
    data: fixture(),
    onRead: () => {},
    onLink: () => {},
  });
  for (const text of [
    'workspace',
    'session',
    'attempt-a',
    'main',
    '文件、已发布成果导入、真实会话记录、任务差异、受监督执行、任务终端和安全静态预览已接入',
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /href=|打开终端|启动执行/);
  const error = render({
    supported: true,
    connected: true,
    data: fixture(),
    error: new Error('403 forbidden'),
    onRead: () => {},
  });
  assert.match(error, /403 forbidden/);
  assert.doesNotMatch(error, /已关联技术工作区/);
});
