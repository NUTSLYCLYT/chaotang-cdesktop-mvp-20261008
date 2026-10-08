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

test('starts with understandable progress and keeps diagnostic counts collapsed', () => {
  const html = render(job);
  assert.match(html, /办理进展/);
  assert.match(html, /正在办理/);
  assert.match(html, /下一步/);
  assert.match(html, /<details><summary[^>]*>查看执行详情与用量说明/);
  assert.ok(html.indexOf('下一步') < html.indexOf('执行尝试'));
  assert.doesNotMatch(html, /<details open/);
});

test('execution success never claims acceptance or archive and explains missing result', () => {
  for (const result of [null, { final_verdict: '初稿' }]) {
    const html = render({ ...job, state: 'SUCCEEDED', result });
    assert.match(html, /执行已结束/);
    assert.match(html, /不等于成果已验收或归档/);
    assert.match(html, result ? /查看成果/ : /成果尚未返回/);
    assert.doesNotMatch(html, /验收通过|归档成功/);
  }
});

test('running task without a cancel flag explains finishing may still complete', () => {
  const html = render(job);
  assert.match(html, /正在办理/);
  assert.match(html, /收尾阶段/);
  assert.doesNotMatch(html, /已请求取消/);
});

test('requested cancel states the recorded fact and never promises a stop', () => {
  const html = render({ ...job, cancelRequested: true });
  assert.match(html, /已请求取消/);
  assert.match(html, /正在核对最终状态/);
  assert.doesNotMatch(html, /等待任务停止|一定停止|已停止|停止完成/);
  assert.doesNotMatch(html, /已取消/);
});

test('terminal state wins over a stale cancel flag', () => {
  const succeeded = render({
    ...job,
    state: 'SUCCEEDED',
    cancelRequested: true,
    result: { final_verdict: '初稿' },
  });
  assert.match(succeeded, /执行已结束/);
  assert.doesNotMatch(succeeded, /已请求取消|正在核对最终状态/);
  const failed = render({ ...job, state: 'FAILED', cancelRequested: true });
  assert.match(failed, /办理受阻/);
  assert.doesNotMatch(failed, /已请求取消|正在核对最终状态/);
  const cancelled = render({
    ...job,
    state: 'CANCELLED',
    cancelRequested: true,
  });
  assert.match(cancelled, /已取消/);
  assert.doesNotMatch(cancelled, /正在核对最终状态|等待任务停止/);
});

test('shows latest recorded action without presenting it as current department assignment', () => {
  const html = render(job, {
    jobId: job.jobId,
    agentsAvailable: true,
    agents: [{ id: 'a', name: '锦衣卫' }],
    tools: [
      {
        id: 'new',
        agentId: 'a',
        name: '<核验来源>',
        state: 'succeeded',
        sequence: 9,
      },
      {
        id: 'old',
        agentId: 'a',
        name: '读取仓库',
        state: 'running',
        sequence: 1,
      },
    ],
  });
  assert.match(html, /工具记录摘要（按序号）/);
  assert.doesNotMatch(html, /最近一条记录/);
  const summary = html.split('<details>')[0];
  assert.match(summary, /锦衣卫 · &lt;核验来源&gt; · 已完成/);
  assert.doesNotMatch(summary, /读取仓库|当前负责人/);
});
