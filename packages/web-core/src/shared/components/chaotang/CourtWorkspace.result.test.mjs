import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as Court from './CourtWorkspace';export const report=value=>renderToStaticMarkup(React.createElement(Court.ValidatedDecreeResult,{value}));export const contract=value=>{if(!Court.TaskAcceptanceContract) throw new Error('TaskAcceptanceContract missing');return renderToStaticMarkup(React.createElement(Court.TaskAcceptanceContract,{value}));};export const cancel=props=>{if(!Court.CancelRequestControl) throw new Error('CancelRequestControl missing');return renderToStaticMarkup(React.createElement(Court.CancelRequestControl,props));};export const workspace=props=>{if(!Court.WorkspaceCards) throw new Error('WorkspaceCards missing');return renderToStaticMarkup(React.createElement(Court.WorkspaceCards,props));};`,
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
      name: 'result-boundary',
      setup(b) {
        b.onResolve({ filter: /^@\/shared\/lib\/chaotangFusion$/ }, () => ({
          path: resolve(import.meta.dirname, '../../lib/chaotangFusion.ts'),
        }));
        b.onResolve({ filter: /^@/ }, (a) => ({
          path: a.path,
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
          contents: path.includes('ChaotangProvider')
            ? 'export const useChaotangClient=()=>globalThis.__courtResultClient ?? {};export const useChaotangProvider=()=>({});'
            : path.includes('useDecreeJobs')
              ? 'export const useDecreeJobs=()=>({});export const useSetDecreeHistoryArchived=()=>({});'
              : path.includes('useChancellor')
                ? 'export const useChancellorConsult=()=>({});export const useChancellorDraft=()=>({});export const useIssueChancellorDecree=()=>({});export const useDecreeJob=()=>({});export const useCancelDecreeJob=()=>({});export const useRetryDecreeJob=()=>({});export const useDecreeDesktopResources=()=>({});export const useLinkDecreeWorkspace=()=>({});export const useDecreeWorkspace=()=>({});'
                : 'export const cn=(...values)=>values.filter(Boolean).join(" ");export const CircleNotchIcon=()=>null;export const InfoIcon=()=>null;export const WarningIcon=()=>null;export const FilesIcon=()=>null;export const UsersThreeIcon=()=>null;export const BookOpenIcon=()=>null;',
        }));
      },
    },
  ],
});
const out = resolve(import.meta.dirname, '.court-result-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const render = await import(pathToFileURL(out).href);
const base = {
  final_verdict: '最终结论',
  recommendations: ['建议一', '建议二', '建议三'],
  departments: ['工部', '户部'],
  artifacts: [],
};
test('multi report renders ordered layers and route without inventing agent counts', () => {
  const html = render.report({
    ...base,
    route_type: 'multi',
    rationale: '路由理由',
    processing_path: ['上书房', '军机处', '工部'],
    ministry_opinions: [
      {
        department: '工部',
        bureau_opinions: [
          { bureau: '质量司', opinion: '<需检测>' },
          { bureau: '进度司', opinion: '等待证据' },
        ],
        opinion: '部级建议',
      },
    ],
    council_verdict: '会审意见',
  });
  for (const phrase of [
    '路由理由',
    '上书房 → 军机处 → 工部',
    '质量司',
    '&lt;需检测&gt;',
    '进度司',
    '部级建议',
    '军机处会审结论',
    '会审意见',
  ])
    assert.ok(html.includes(phrase), phrase);
  assert.ok(html.indexOf('质量司') < html.indexOf('进度司'));
  assert.doesNotMatch(html, /运行中|智能体数量/);
});
test('legacy gaps and single routes do not fabricate council or bureau opinions', () => {
  const missing = render.report(base);
  assert.match(missing, /未提供路由理由/);
  assert.match(missing, /未提供处理路径/);
  assert.match(missing, /未提供逐司逐部意见/);
  const single = render.report({
    ...base,
    departments: ['工部'],
    route_type: 'single',
    council_verdict: null,
  });
  assert.doesNotMatch(single, /军机处会审结论/);
  const invalid = render.report({ ...base, route_type: 'fake' });
  assert.match(invalid, /成果校验未通过/);
});
test('acceptance contract displays all supplied fields and distinguishes missing from empty', () => {
  const data = {
    objective: '目标原文',
    scope: ['范围一'],
    exclusions: ['范围外'],
    inputMaterials: ['输入证据'],
    materialGaps: [],
    keyQuestions: ['关键问题一'],
    executionSteps: ['步骤一'],
    deliverables: ['交付清单'],
    completionCriteria: ['验收依据'],
    permissionsAndLimits: ['禁止付款'],
    departments: [
      {
        department: '工部',
        bureaus: ['质量司'],
        role: '主办',
        reason: '核验需求',
        responsibility: '技术责任',
        expectedOutput: '部门产出',
      },
    ],
  };
  const html = render.contract(data);
  for (const text of [
    '目标原文',
    '范围一',
    '范围外',
    '输入证据',
    '关键问题一',
    '步骤一',
    '交付清单',
    '验收依据',
    '禁止付款',
    '质量司',
    '主办',
    '核验需求',
    '技术责任',
    '部门产出',
    '未列出',
  ])
    assert.ok(html.includes(text), text);
  assert.match(render.contract({ objective: 'only' }), /未提供/);
  assert.match(render.contract(undefined), /未提供结构化批准与验收合同/);
});

const runningJob = {
  jobId: 'job-current',
  state: 'RUNNING',
  cancelRequested: false,
};
const cancelProps = (over = {}) => ({
  job: runningJob,
  connected: true,
  isPending: false,
  onCancel() {},
  ...over,
});

test('cancel control shows waiting text and clear feedback for a matching receipt', () => {
  const idle = render.cancel(cancelProps());
  assert.match(idle, /请求取消/);
  assert.doesNotMatch(idle, /已受理|尚未登记取消标志|后端已确认任务结束/);

  const pending = render.cancel(cancelProps({ isPending: true }));
  assert.match(pending, /正在请求取消/);
  assert.match(pending, /等待后端受理/);

  const accepted = render.cancel(
    cancelProps({
      receipt: {
        jobId: 'job-current',
        state: 'RUNNING',
        cancelRequested: true,
      },
    })
  );
  assert.match(accepted, /取消请求已受理/);
  assert.match(accepted, /正在核对最终状态/);
  assert.doesNotMatch(accepted, /一定停止|已停止/);

  const noFlag = render.cancel(
    cancelProps({
      receipt: {
        jobId: 'job-current',
        state: 'RUNNING',
        cancelRequested: false,
      },
    })
  );
  assert.match(noFlag, /尚未登记取消标志/);
});

test('cancel control reports a terminal receipt and hides cross-task stale receipts', () => {
  const terminalReceipt = render.cancel(
    cancelProps({
      receipt: {
        jobId: 'job-current',
        state: 'CANCELLED',
        cancelRequested: true,
      },
    })
  );
  assert.match(terminalReceipt, /后端已确认任务结束/);
  assert.match(terminalReceipt, /已取消/);

  const stale = render.cancel(
    cancelProps({
      receipt: {
        jobId: 'job-previous',
        state: 'RUNNING',
        cancelRequested: true,
      },
    })
  );
  assert.doesNotMatch(stale, /已受理|尚未登记取消标志|后端已确认任务结束/);
  assert.match(stale, /请求取消/);
});

test('cancel control defers to a terminal current state over an earlier receipt', () => {
  const html = render.cancel(
    cancelProps({
      job: { jobId: 'job-current', state: 'CANCELLED', cancelRequested: true },
      receipt: {
        jobId: 'job-current',
        state: 'RUNNING',
        cancelRequested: true,
      },
    })
  );
  assert.doesNotMatch(
    html,
    /请求取消|已受理|正在核对最终状态|尚未登记取消标志/
  );
});

test('cancel control surfaces a rejected request without claiming acceptance', () => {
  const html = render.cancel(cancelProps({ error: '任务回执不匹配' }));
  assert.match(html, /取消请求未确认/);
  assert.match(html, /任务回执不匹配/);
  assert.doesNotMatch(html, /已受理/);
});

const artifact = (over = {}) => ({
  id: 'artifact-1',
  displayName: '成果一',
  kind: 'DOCUMENT',
  state: 'PUBLISHED',
  downloadPath: 'https://example.com/artifact-1',
  ...over,
});
const workspaceBase = (artifacts, over = {}) => ({
  jobId: 'job-1',
  artifacts,
  agentsAvailable: true,
  agents: [],
  tools: [],
  sources: [],
  ...over,
});
const browserClient = {
  downloadWorkspaceArtifact: async () => new Blob(['x']),
};
const desktopClient = {
  saveWorkspaceArtifact: async () => ({ status: 'saved' }),
};
const unsupportedClient = {};
const renderWorkspace = (props, client) => {
  globalThis.__courtResultClient = client;
  try {
    return render.workspace({
      result: undefined,
      objective: '',
      hasSelectedJob: true,
      ...props,
    });
  } finally {
    delete globalThis.__courtResultClient;
  }
};
const artifactButton = (html) => {
  const match = html.match(
    /<button[^>]*>(处理中…|重试下载|重试保存|保存文件|下载文件|下载未就绪)<\/button>/
  );
  assert.ok(match, 'artifact button rendered');
  return {
    tag: match[0],
    label: match[1],
    disabled: match[0].includes('disabled=""'),
  };
};

test('published artifact with a browser path is downloadable and explains its state', () => {
  const html = renderWorkspace(
    { workspace: workspaceBase([artifact()]) },
    browserClient
  );
  assert.match(html, /文件已发布（不等于翰林验收）/);
  assert.ok(html.includes('文件详情'));
  assert.ok(html.includes('DOCUMENT · PUBLISHED'));
  const button = artifactButton(html);
  assert.equal(button.label, '下载文件');
  assert.equal(button.disabled, false);
  assert.doesNotMatch(html, /验收通过|人工验收通过/);
});

test('registered artifact with a path stays disabled and is explained as unpublished', () => {
  const html = renderWorkspace(
    { workspace: workspaceBase([artifact({ state: 'REGISTERED' })]) },
    browserClient
  );
  assert.match(html, /已登记，等待文件发布/);
  const button = artifactButton(html);
  assert.equal(button.disabled, true);
  assert.match(html, /尚未发布/);
  assert.doesNotMatch(html, /文件已发布/);
});

test('published artifact without a browser path is disabled and names the missing reason', () => {
  const html = renderWorkspace(
    {
      workspace: workspaceBase([artifact({ downloadPath: undefined })]),
    },
    browserClient
  );
  assert.match(html, /文件已发布（不等于翰林验收）/);
  const button = artifactButton(html);
  assert.equal(button.label, '下载未就绪');
  assert.equal(button.disabled, true);
  assert.match(html, /没有可用下载地址/);
});

test('published artifact with an unsupported client explains the missing download capability', () => {
  const html = renderWorkspace(
    { workspace: workspaceBase([artifact()]) },
    unsupportedClient
  );
  const button = artifactButton(html);
  assert.equal(button.disabled, true);
  assert.match(html, /未接入文件下载/);
});

test('desktop save stays enabled for a published artifact even without a download path', () => {
  const html = renderWorkspace(
    {
      workspace: workspaceBase([artifact({ downloadPath: undefined })]),
    },
    desktopClient
  );
  assert.match(html, /文件已发布（不等于翰林验收）/);
  const button = artifactButton(html);
  assert.equal(button.label, '保存文件');
  assert.equal(button.disabled, false);
  assert.doesNotMatch(html, /没有可用下载地址/);
});

test('a workspace without a job id disables the artifact and says why', () => {
  const html = renderWorkspace(
    { workspace: workspaceBase([artifact()], { jobId: '' }) },
    browserClient
  );
  const button = artifactButton(html);
  assert.equal(button.disabled, true);
  assert.match(html, /任务编号/);
});

test('an unknown artifact state never claims success and stays disabled', () => {
  const html = renderWorkspace(
    { workspace: workspaceBase([artifact({ state: 'PROCESSING' })]) },
    browserClient
  );
  assert.match(html, /暂不可下载，状态待确认/);
  assert.doesNotMatch(html, /文件已发布|已登记/);
  const button = artifactButton(html);
  assert.equal(button.disabled, true);
  assert.match(html, /状态未确认/);
  assert.doesNotMatch(html, /尚未发布/);
});

test('a whitespace-padded published state follows the exact disabled guard and claims nothing', () => {
  const html = renderWorkspace(
    { workspace: workspaceBase([artifact({ state: ' Published ' })]) },
    browserClient
  );
  // The original guard compares with toLowerCase() only, so padded values are
  // not published. The status text must not claim it is published either.
  assert.doesNotMatch(html, /文件已发布/);
  assert.match(html, /暂不可下载，状态待确认/);
  assert.match(html, /状态未确认/);
  const button = artifactButton(html);
  assert.equal(button.disabled, true);
  assert.ok(html.includes(' Published '));
});
