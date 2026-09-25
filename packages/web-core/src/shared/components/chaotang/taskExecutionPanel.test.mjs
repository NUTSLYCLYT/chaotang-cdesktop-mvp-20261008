import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TaskExecutionView} from './TaskExecutionPanel';export const render=p=>renderToStaticMarkup(React.createElement(TaskExecutionView,p));`,
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
      name: 'execution-view-boundary',
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
const out = resolve(import.meta.dirname, '.task-execution-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(() => unlink(out));
const { render } = await import(pathToFileURL(out).href);

const common = {
  supported: true,
  connected: true,
  prompt: '',
  approvals: [],
  questionDrafts: {},
  onPromptChange() {},
  onStart() {},
  onReload() {},
  onCancel() {},
  onApprove() {},
  onDeny() {},
  onQuestionDraftChange() {},
  onAnswer() {},
};
const running = {
  jobId: 'job',
  workspaceId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  businessAttemptId: 'attempt-a',
  executionId: '33333333-3333-4333-8333-333333333333',
  state: 'running',
  exitCode: null,
  startedAt: '2026-09-20T01:00:00Z',
  completedAt: null,
  profile: 'CODEX:CHAOTANG_SUPERVISED',
  entries: [{ kind: 'stdout', text: '真实执行输出' }],
  truncated: false,
};

test('execution view distinguishes unsupported, idle and running states', () => {
  assert.match(render({ ...common, supported: false }), /暂不支持任务执行/);
  const idle = render(common);
  assert.match(idle, /输入本任务需要完成的技术工作/);
  assert.match(idle, /启动受监督执行/);
  const active = render({ ...common, execution: running });
  assert.match(active, /运行中/);
  assert.match(active, /真实执行输出/);
  assert.match(active, /停止执行/);
  assert.doesNotMatch(active, /danger-full-access|永久允许/);
});

test('tool approval offers one-time approve or deny and question approval requires explicit text', () => {
  const approvals = [
    {
      approvalId: '44444444-4444-4444-8444-444444444444',
      toolName: 'shell',
      executionProcessId: running.executionId,
      isQuestion: false,
      createdAt: '2026-09-20T01:00:01Z',
      timeoutAt: '2026-09-20T02:00:01Z',
    },
    {
      approvalId: '55555555-5555-4555-8555-555555555555',
      toolName: 'AskUserQuestion',
      executionProcessId: running.executionId,
      isQuestion: true,
      createdAt: '2026-09-20T01:00:02Z',
      timeoutAt: '2026-09-20T02:00:02Z',
    },
  ];
  const html = render({
    ...common,
    execution: running,
    approvals,
    questionDrafts: {
      [approvals[1].approvalId]: { question: '', answer: '' },
    },
  });
  assert.match(html, /允许一次/);
  assert.match(html, /拒绝/);
  assert.match(html, /问题原文/);
  assert.match(html, /提交答案/);
  assert.doesNotMatch(html, /永久允许/);
});

test('completed execution cannot render a stop action', () => {
  const html = render({
    ...common,
    execution: {
      ...running,
      state: 'completed',
      exitCode: 0,
      completedAt: '2026-09-20T01:01:00Z',
    },
  });
  assert.match(html, /已完成/);
  assert.doesNotMatch(html, /停止执行/);
});
