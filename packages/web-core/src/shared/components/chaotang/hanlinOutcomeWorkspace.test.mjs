import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const compiled = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
    import {OutcomeReadinessWorkspace} from './OutcomeReadinessWorkspace';
    import {HanlinReadinessWorkspace,HanlinExperimentContent} from './HanlinReadinessWorkspace';
    import * as Hanlin from './HanlinReadinessWorkspace';
    export const outcome=()=>renderToStaticMarkup(React.createElement(OutcomeReadinessWorkspace));
    export const hanlin=()=>renderToStaticMarkup(React.createElement(HanlinReadinessWorkspace));
    export const receipt=data=>renderToStaticMarkup(React.createElement(HanlinExperimentContent,{data}));
    export const candidateView=Hanlin.HanlinCandidateView;
    export const candidate=p=>renderToStaticMarkup(React.createElement(candidateView,p));`,
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
      name: 'advisory-read-boundary',
      setup(b) {
        b.onResolve(
          {
            filter:
              /^@\/shared\/(providers\/ChaotangProvider|hooks\/chaotang\/)/,
          },
          () => ({ path: 'advisory-context', namespace: 'stub' })
        );
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `
      export const useChaotangProvider=()=>globalThis.__advisoryProvider;
      export const useChaotangClient=()=>globalThis.__advisoryClient??{};
      export const useHanlinCandidateHistory=()=>({supported:false,writable:false});
      export const useHanlinRuntimeRehearsal=()=>({supported:false,writable:false});
      export const useOutcomeOverview=()=>globalThis.__advisoryQuery;
      export const useShiguanArchives=()=>globalThis.__shiguanArchives??{data:[],isPending:false,isError:false};
      export const useHanlinExperiment=()=>({supported:true,isPending:true,isFetching:false});
      export const useShiguanStatistics=()=>({data:{total:5,pendingReview:0}});
      export const useChaotangSkills=()=>({data:{items:[],total:1,enabledCount:1}});`,
        }));
        b.onResolve({ filter: /^@\// }, (args) => {
          const base = resolve(
            import.meta.dirname,
            '../../../',
            args.path.slice(2)
          );
          return {
            path:
              ['', '.ts', '.tsx', '/index.ts']
                .map((ext) => base + ext)
                .find(existsSync) ?? base,
          };
        });
      },
    },
  ],
});
const out = resolve(import.meta.dirname, '.hanlin-outcome-render.mjs');
await writeFile(out, compiled.outputFiles[0].text);
after(async () => {
  delete globalThis.__advisoryQuery;
  delete globalThis.__advisoryProvider;
  delete globalThis.__advisoryClient;
  delete globalThis.__shiguanArchives;
  await unlink(out);
});
const { outcome, hanlin, receipt, candidate, candidateView } = await import(
  pathToFileURL(out).href
);
const digest = 'sha256:' + 'a'.repeat(64);
const setup = (patch = {}) => {
  globalThis.__advisoryProvider = {
    user: { id: 'owner' },
    health: {},
    authGeneration: 1,
  };
  globalThis.__advisoryClient = {};
  globalThis.__advisoryQuery = {
    supported: true,
    isPending: false,
    isFetching: false,
    refetch() {},
    data: {
      total: 0,
      achieved: 0,
      partial: 0,
      not_achieved: 0,
      observing: 0,
      conclusive: 0,
      success_rate: null,
      evidence_count: 0,
      basis_digest: digest,
      sources: [],
    },
    ...patch,
  };
};
test('Outcome renders authenticated empty data without inventing a success rate', () => {
  setup();
  const html = outcome();
  assert.match(html, /暂无已认证 Outcome/);
  assert.match(html, /尚无可计算的已定结果/);
  assert.doesNotMatch(html, /NOT_IMPLEMENTED|PLANNED|没有现行权威接口|0%/);
});
test('Outcome offers adopted replies as task-linked choices and keeps manual history fallback', () => {
  setup();
  globalThis.__advisoryClient = { shiguanCreateOutcome() {} };
  globalThis.__shiguanArchives = {
    data: [
      {
        id: 'adopted-reply-1',
        archiveType: 'REPLY',
        title: '技术司交付回奏',
        department: '工部',
        createdAt: '2026-09-20T08:00:00Z',
        decisionStatus: { decision: 'ADOPTED' },
      },
      {
        id: 'rejected-reply-1',
        archiveType: 'REPLY',
        title: '未采纳回奏',
        department: '礼部',
        createdAt: '2026-09-20T07:00:00Z',
        decisionStatus: { decision: 'REJECTED' },
      },
    ],
    isPending: false,
    isError: false,
  };
  const html = outcome();
  assert.match(html, /选择已采纳回奏/);
  assert.match(html, /技术司交付回奏/);
  assert.match(html, /adopted-reply-1/);
  assert.match(html, /可手工输入历史档案/);
  assert.doesNotMatch(html, /未采纳回奏|rejected-reply-1/);
});
test('Outcome shows current-head metrics and their source fingerprints', () => {
  setup();
  Object.assign(globalThis.__advisoryQuery.data, {
    total: 1,
    achieved: 1,
    conclusive: 1,
    success_rate: 1,
    evidence_count: 2,
    sources: [
      {
        event_id: 'event-id',
        archive_id: 'archive-id',
        outcome: 'ACHIEVED',
        recorded_at: '2026-09-20T08:00:00Z',
        event_digest: digest,
        evidence_bundle_digest: digest,
        evidence_count: 2,
      },
    ],
  });
  const html = outcome();
  assert.match(html, /100%/);
  assert.match(html, /archive-id/);
  assert.match(html, /event-id/);
  assert.match(html, /统计依据摘要/);
});
test('unsupported, loading, authentication and failed reads cannot masquerade as empty success', () => {
  setup({ supported: false });
  assert.match(outcome(), /当前客户端暂不支持/);
  setup({ isPending: true });
  assert.match(outcome(), /正在读取/);
  setup({ isError: true, error: new Error('403 forbidden') });
  const failure = outcome();
  assert.match(failure, /403 forbidden/);
  assert.match(failure, /重新读取/);
  assert.doesNotMatch(failure, /暂无已认证 Outcome/);
  setup();
  globalThis.__advisoryProvider.user = null;
  assert.match(outcome(), /请先登录/);
});
test('Hanlin offers explicit experiment ID lookup and never a fabricated experiment total or publish action', () => {
  setup();
  const html = hanlin();
  assert.match(html, /实验 ID/);
  assert.match(html, /查询实验/);
  assert.match(html, /ADVISORY_ONLY/);
  assert.match(html, /不提供实验列表或总数/);
  assert.doesNotMatch(html, /NOT_IMPLEMENTED|当前主线无权威接口|PLANNED/);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*(发布|晋级)/);
});

test('experiment receipt preserves source identity and keeps a promotion recommendation advisory', () => {
  const html = receipt({
    snapshot: {
      definition: {
        experiment_id: 'experiment-1',
        title: '冻结实验',
        created_at: '2026-09-20T08:00:00Z',
        minimum_samples_per_arm: 1,
        minimum_quality_gain: 0.1,
        minimum_evidence_score: 0.8,
        maximum_cost_increase_ratio: 1,
        maximum_latency_increase_ratio: 1,
        runtime_artifact_id: null,
      },
      baseline: [],
      candidate: [
        {
          observation_id: 'observation-1',
          outcome_event_id: 'current-event-id',
          outcome_event_digest: digest,
          evidence_bundle_digest: digest,
          quality_score: 0.9,
          evidence_score: 1,
          cost_microunits: 10,
          latency_ms: 20,
          execution_status: 'SUCCEEDED',
        },
      ],
      definition_digest: digest,
      baseline_digest: digest,
      candidate_digest: digest,
      snapshot_digest: digest,
    },
    evaluation: {
      status: 'READY_FOR_REVIEW',
      recommended_action: 'PROMOTE_CANDIDATE',
      baseline_samples: 0,
      candidate_samples: 1,
      baseline_quality: null,
      candidate_quality: 0.9,
      candidate_evidence: 1,
      cost_increase_ratio: null,
      latency_increase_ratio: null,
      reason_codes: [],
      evaluation_digest: digest,
    },
    recorded_at: '2026-09-20T08:00:01Z',
  });
  assert.match(html, /可供人工审阅/);
  assert.match(html, /ADVISORY_ONLY/);
  assert.match(html, /PROMOTE_CANDIDATE/);
  assert.match(html, /禁止自动晋级或发布/);
  assert.match(html, /current-event-id/);
  assert.match(html, /observation-1/);
  assert.doesNotMatch(html, /<button/);
});

test('candidate view preserves local rehearsal boundary in empty, loading and error states', () => {
  assert.equal(typeof candidateView, 'function');
  const base = {
    supported: true,
    loading: false,
    busy: false,
    reason: '',
    actions: [],
    onReasonChange() {},
    onAction() {},
    onReload() {},
  };
  for (const patch of [
    { loading: true },
    { error: 'candidate_revision_conflict' },
    { supported: false },
  ]) {
    const html = candidate({ ...base, ...patch });
    assert.match(html, /LOCAL_ISOLATED/);
    assert.match(html, /LOCAL_REHEARSAL_ONLY/);
    assert.match(html, /runtime_health=NOT_RUN/);
    assert.match(html, /不会切换真实运行时绑定或发布/);
    assert.doesNotMatch(html, /已收到后端事件/);
  }
});

test('candidate view only offers state-valid manual actions with a required reason', () => {
  assert.equal(typeof candidateView, 'function');
  const data = {
    revision: 0,
    state: 'UNREVIEWED',
    selected_arm_digest: digest,
    events: [],
  };
  const base = {
    supported: true,
    loading: false,
    busy: false,
    reason: '',
    actions: ['APPROVE', 'REJECT'],
    history: data,
    onReasonChange() {},
    onAction() {},
    onReload() {},
  };
  const html = candidate(base);
  assert.match(html, /操作理由/);
  assert.match(html, /required/);
  assert.match(html, /APPROVE/);
  assert.match(html, /REJECT/);
  assert.doesNotMatch(html, />[^<]*ENABLE/);
  assert.match(html, /尚无候选操作事件/);
  const failed = candidate({
    ...base,
    error: '409 candidate_revision_conflict',
  });
  assert.match(failed, /candidate_revision_conflict/);
  assert.doesNotMatch(failed, /APPROVE|REJECT|已收到后端事件/);
});
