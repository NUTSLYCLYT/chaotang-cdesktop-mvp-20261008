import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as Court from './CourtWorkspace';export const report=value=>renderToStaticMarkup(React.createElement(Court.ValidatedDecreeResult,{value}));export const contract=value=>{if(!Court.TaskAcceptanceContract) throw new Error('TaskAcceptanceContract missing');return renderToStaticMarkup(React.createElement(Court.TaskAcceptanceContract,{value}));};`,
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
            ? 'export const useChaotangClient=()=>({});export const useChaotangProvider=()=>({});'
            : path.includes('useDecreeJobs')
              ? 'export const useDecreeJobs=()=>({});export const useSetDecreeHistoryArchived=()=>({});'
              : path.includes('useChancellor')
                ? 'export const useChancellorConsult=()=>({});export const useChancellorDraft=()=>({});export const useIssueChancellorDecree=()=>({});export const useDecreeJob=()=>({});export const useCancelDecreeJob=()=>({});export const useRetryDecreeJob=()=>({});export const useDecreeDesktopResources=()=>({});export const useLinkDecreeWorkspace=()=>({});export const useDecreeWorkspace=()=>({});'
                : 'export const FilesIcon=()=>null;export const UsersThreeIcon=()=>null;export const BookOpenIcon=()=>null;',
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
