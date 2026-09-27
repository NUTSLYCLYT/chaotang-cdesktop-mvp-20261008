import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'TaskInspector.tsx')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
});
const output = resolve(import.meta.dirname, '.task-inspector-render.mjs');
await writeFile(output, compiled.outputFiles[0].text);
after(() => unlink(output));
const { TaskInspector } = await import(pathToFileURL(output).href);
const job = {
  jobId: 'job-current',
  state: 'RUNNING',
  attemptCount: 2,
  providerRequestCount: 3,
  cancelRequested: false,
};
const render = (value, workspace) =>
  renderToStaticMarkup(
    React.createElement(TaskInspector, { job: value, workspace })
  );

test('shows only recorded counts and sorts tool events by sequence', () => {
  const html = render(job, {
    jobId: 'job-current',
    agentsAvailable: true,
    agents: [{ id: 'agent-1', name: '工部', role: 'minister' }],
    tools: [
      {
        id: 'tool-2',
        agentId: 'agent-1',
        name: '审阅',
        state: 'succeeded',
        sequence: 2,
      },
      {
        id: 'tool-1',
        agentId: 'agent-1',
        name: '读取',
        state: 'failed',
        sequence: 1,
      },
    ],
  });
  for (const phrase of [
    '执行监察',
    '执行尝试',
    '模型请求',
    '协作智能体',
    '工具记录',
    'Token 与费用',
    '后端未提供',
  ]) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.ok(html.indexOf('#1') < html.indexOf('#2'));
  assert.match(html, /工部 · 读取 · 失败/);
  assert.match(html, /工部 · 审阅 · 已完成/);
});

test('keeps absent data unknown and distinguishes an empty tool log', () => {
  const missing = render(job);
  assert.match(missing, /工具记录尚未接入/);
  assert.match(missing, /未知/);
  const empty = render(job, {
    jobId: 'job-current',
    agentsAvailable: false,
    agents: [],
    tools: [],
  });
  assert.match(empty, /暂无已记录的工具调用/);
  assert.doesNotMatch(empty, /工具记录尚未接入/);
});

test('rejects invalid counts and does not render internal agent IDs', () => {
  const html = render(
    {
      ...job,
      attemptCount: -1,
      providerRequestCount: Number.NaN,
      cancelRequested: true,
    },
    {
      jobId: 'job-current',
      agentsAvailable: true,
      agents: [],
      tools: [
        {
          id: 'tool',
          agentId: 'hidden-agent-id',
          name: '<检查>',
          state: 'running',
          sequence: 1,
        },
      ],
    }
  );
  assert.match(html, /未知/);
  assert.match(html, /已请求取消/);
  assert.doesNotMatch(html, /hidden-agent-id/);
  assert.match(html, /&lt;检查&gt;/);
});

test('does not show cached records from another task', () => {
  const html = render(job, {
    jobId: 'job-previous',
    agentsAvailable: true,
    agents: [{ id: 'old-agent', name: '旧任务人员' }],
    tools: [
      {
        id: 'old-tool',
        agentId: 'old-agent',
        name: '旧任务工具',
        state: 'succeeded',
        sequence: 1,
      },
    ],
  });
  assert.match(html, /工具记录尚未接入/);
  assert.doesNotMatch(html, /旧任务人员|旧任务工具/);
});
