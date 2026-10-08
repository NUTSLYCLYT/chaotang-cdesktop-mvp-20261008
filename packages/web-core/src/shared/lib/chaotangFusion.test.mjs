import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownerQueryKey,
  decreeIdempotencyKey,
  parseDecreeResult,
} from './chaotangFusion.ts';
test('cache partitions identical job IDs by owner', () =>
  assert.notDeepEqual(
    ownerQueryKey('alice', 'job', 'j1'),
    ownerQueryKey('bob', 'job', 'j1')
  ));
test('retries keep idempotency but owners and drafts differ', async () => {
  const a = await decreeIdempotencyKey('alice', 'd1');
  assert.equal(a, await decreeIdempotencyKey('alice', 'd1'));
  assert.notEqual(a, await decreeIdempotencyKey('bob', 'd1'));
  assert.notEqual(a, await decreeIdempotencyKey('alice', 'd2'));
  await assert.rejects(() => decreeIdempotencyKey('', 'd1'));
});
const valid = {
  final_verdict: 'Needs review',
  recommendations: ['a', 'b', 'c'],
  departments: ['工部'],
  artifacts: [],
};
test('reject malformed results before presentation', () => {
  assert.equal(parseDecreeResult(valid).final_verdict, 'Needs review');
  for (const value of [
    null,
    {},
    { ...valid, recommendations: ['a'] },
    { ...valid, final_verdict: '' },
    { ...valid, departments: [4] },
    { ...valid, artifacts: [{ path: 'javascript:alert(1)' }] },
  ])
    assert.throws(() => parseDecreeResult(value));
});

import { createAuthQueue } from './chaotangFusion.ts';
test('logout completes before a subsequent login changes credentials', async () => {
  const queue = createAuthQueue();
  const events = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const logout = queue.run(async () => {
    events.push('logout-start');
    await gate;
    events.push('logout-end');
  });
  const login = queue.run(async () => {
    events.push('login');
  });
  assert.equal(queue.isPending(), true);
  await Promise.resolve();
  assert.deepEqual(events, ['logout-start']);
  release();
  await Promise.all([logout, login]);
  assert.deepEqual(events, ['logout-start', 'logout-end', 'login']);
  assert.equal(queue.isPending(), false);
});

import { usesTechnicalShell } from './chaotangFusion.ts';
import * as fusion from './chaotangFusion.ts';
import { CHAOTANG_MODULE_SHELLS } from './chaotangShell.ts';
import { PRIMARY_MODULES } from './primaryModules.ts';
test('technical routes reach the real workspace instead of scene iframe', () => {
  for (const path of [
    '/court-workspace',
    '/workspaces',
    '/workspaces/abc',
    '/routines/new',
    '/hosts/h1/workspaces/abc',
  ])
    assert.equal(usesTechnicalShell(path), true, path);
  // Qintian and Hanlin now render inside the single court shell, so their real
  // business content is hosted there instead of the retired technical layout.
  for (const path of [
    '/court',
    '/today',
    '/workspaces-fake',
    '/forecast',
    '/learning',
  ])
    assert.equal(usesTechnicalShell(path), false, path);
});

test('Qintian entry names its current value and evidence limitation', () => {
  const module = PRIMARY_MODULES.find((item) => item.id === 'forecast');
  assert.equal(module?.label, '钦天监');
  assert.equal(module?.status, 'partial');
  assert.match(module?.description ?? '', /基于你提供的资料/);
  assert.match(module?.description ?? '', /实时趋势须先核验来源/);
});

test('authenticated Outcome and Hanlin sections are marked live', () => {
  const sections = CHAOTANG_MODULE_SHELLS.learning.sections;
  for (const id of ['outcomes', 'hanlin']) {
    assert.equal(sections.find((section) => section.id === id)?.status, 'live');
  }
});

test('layered decree report retains actual route and ordered ministry/bureau opinions', () => {
  const report = parseDecreeResult({
    ...valid,
    departments: ['工部', '户部'],
    route_type: 'multi',
    rationale: '跨部门办理',
    processing_path: ['丞相', '军机处', '工部', '户部'],
    ministry_opinions: [
      {
        department: '工部',
        bureau_opinions: [
          { bureau: '质量司', opinion: '需补检测' },
          { bureau: '进度司', opinion: '待证据' },
        ],
        opinion: '工部汇总',
      },
      { department: '户部', bureau_opinions: [], opinion: '户部汇总' },
    ],
    council_verdict: '会审有条件通过',
  });
  assert.equal(report.routeType, 'multi');
  assert.equal(report.rationale, '跨部门办理');
  assert.deepEqual(report.processingPath, ['丞相', '军机处', '工部', '户部']);
  assert.deepEqual(report.ministryOpinions[0], {
    department: '工部',
    bureauOpinions: [
      { bureau: '质量司', opinion: '需补检测' },
      { bureau: '进度司', opinion: '待证据' },
    ],
    opinion: '工部汇总',
  });
  assert.equal(report.councilVerdict, '会审有条件通过');
  assert.equal(report.agentCount, undefined);
});

test('legacy missing layers stay missing while malformed or contradictory supplied layers fail', () => {
  const legacy = parseDecreeResult(valid);
  assert.equal(legacy.routeType, undefined);
  assert.equal(legacy.ministryOpinions, undefined);
  for (const patch of [
    { route_type: 'invented' },
    { processing_path: [1] },
    {
      ministry_opinions: [
        {
          department: '工部',
          bureau_opinions: [{ bureau: '质量司', opinion: 9 }],
        },
      ],
    },
    { route_type: 'single', council_verdict: 'contradiction' },
  ])
    assert.throws(() => parseDecreeResult({ ...valid, ...patch }));
  const partial = parseDecreeResult({
    ...valid,
    ministry_opinions: [{ department: '工部' }],
  });
  assert.equal(partial.ministryOpinions[0].opinion, undefined);
});

test('acceptance projection preserves the current DTO fields without filling historical gaps', () => {
  assert.equal(typeof fusion.projectDraftAcceptance, 'function');
  assert.equal(fusion.projectDraftAcceptance(null), undefined);
  const draft = {
    objective: '验收目标',
    scope: ['范围'],
    exclusions: ['排除'],
    inputMaterials: ['资料'],
    materialGaps: [],
    keyQuestions: ['关键问题'],
    executionSteps: ['执行步骤'],
    deliverables: ['交付物'],
    completionCriteria: ['验收标准'],
    permissionsAndLimits: ['权限'],
    departments: [
      {
        department: '工部',
        bureaus: ['质量司'],
        role: '主办',
        reason: '技术核验',
        responsibility: '核查',
        expectedOutput: '检测结论',
      },
    ],
  };
  assert.deepEqual(fusion.projectDraftAcceptance(draft), draft);
  const partial = fusion.projectDraftAcceptance({
    objective: '历史值',
    scope: 'invalid',
    deliverables: [],
  });
  assert.equal(partial.scope, undefined);
  assert.deepEqual(partial.deliverables, []);
  assert.equal(partial.completionCriteria, undefined);
});
