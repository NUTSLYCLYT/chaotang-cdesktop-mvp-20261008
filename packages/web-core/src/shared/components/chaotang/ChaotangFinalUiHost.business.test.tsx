import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hash: 'study',
  pathname: '/court',
  user: { id: 'owner-A' } as { id: string } | null,
}));
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: state.pathname, hash: state.hash }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangClient: () => ({}),
  useChaotangProvider: () => ({ user: state.user, health: null }),
}));
vi.mock('./ChancellorStudyWorkspace', () => ({
  ChancellorStudyWorkspace: () =>
    createElement('div', { 'data-test-workspace': 'study' }),
}));
vi.mock('./JunjichuCasesWorkspace', () => ({
  JunjichuCasesWorkspace: () =>
    createElement('div', { 'data-test-workspace': 'cases' }),
}));
vi.mock('./CourtWorkspace', () => ({
  CourtWorkspace: ({ embedded }: { embedded?: boolean }) =>
    createElement('div', {
      'data-test-workspace': 'tasks',
      'data-embedded': String(embedded),
    }),
}));
vi.mock('./ShiguanOperationsWorkspace', () => ({
  ShiguanOperationsWorkspace: () =>
    createElement('div', { 'data-test-workspace': 'archives' }),
}));
vi.mock('./ModelProvidersWorkspace', () => ({
  ModelProvidersWorkspace: () => null,
}));
vi.mock('./SkillsWorkspace', () => ({ SkillsWorkspace: () => null }));
vi.mock('./McpWorkspace', () => ({ McpWorkspace: () => null }));
// The Host now renders the real DepartmentContentWorkspace; its leaf business
// components are stubbed so we can prove the migrational wiring without a
// QueryClient, while DepartmentContentWorkspace.test.tsx covers each section.
vi.mock('./QintianWorkspace', () => ({
  QintianWorkspace: ({ mode }: { mode?: string }) =>
    createElement('div', { 'data-qintian': mode ?? 'none' }),
}));
vi.mock('./QintianConsultWorkspace', () => ({
  QintianConsultWorkspace: () =>
    createElement('div', { 'data-consult': 'true' }),
}));
vi.mock('./CalibrationWorkspace', () => ({
  CalibrationWorkspace: () =>
    createElement('div', { 'data-calibration': 'true' }),
}));
vi.mock('./LearningOverviewWorkspace', () => ({
  LearningOverviewWorkspace: () =>
    createElement('div', { 'data-learning-overview': 'true' }),
}));
vi.mock('./ShiguanWorkspace', () => ({
  ShiguanWorkspace: ({ mode }: { mode?: string }) =>
    createElement('div', { 'data-shiguan': mode ?? 'none' }),
}));
vi.mock('./ReviewDispositionWorkspace', () => ({
  ReviewDispositionWorkspace: () =>
    createElement('div', { 'data-review': 'true' }),
}));
vi.mock('./OutcomeReadinessWorkspace', () => ({
  OutcomeReadinessWorkspace: () =>
    createElement('div', { 'data-outcome': 'true' }),
}));
vi.mock('./HanlinReadinessWorkspace', () => ({
  HanlinReadinessWorkspace: () =>
    createElement('div', { 'data-hanlin': 'true' }),
}));
vi.mock('./KnowledgeSourcesReadinessWorkspace', () => ({
  KnowledgeSourcesReadinessWorkspace: () =>
    createElement('div', { 'data-knowledge': 'true' }),
}));
// The treasury workspace and the local life workspace are stubbed so the Host
// wiring (real component choice, initial section and mount identity) can be
// proven without a live provider; their own tests cover the internals.
vi.mock('./HubuOperationsWorkspace', () => ({
  HubuOperationsWorkspace: ({ initialSection }: { initialSection?: string }) =>
    createElement('div', { 'data-hubu': initialSection ?? 'none' }),
}));
vi.mock('./LifeWorkspace', () => ({
  LifeWorkspace: ({ mode }: { mode?: string }) =>
    createElement('div', { 'data-life': mode ?? 'none' }),
}));

import {
  ChaotangFinalUiHost,
  departmentPanelKey,
  routePageForLocation,
} from './ChaotangFinalUiHost';
import { courtPanelSection } from './courtBusinessHandoff';
import { inlinePageForPanel } from './courtInlineSurface';
afterEach(() => {
  vi.unstubAllGlobals();
  state.hash = 'study';
  state.pathname = '/court';
  state.user = { id: 'owner-A' };
});

describe('court shell business entry rendering', () => {
  it('renders an honest result catalog within the existing visual shell', () => {
    state.hash = 'results';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('/chaotang-final-v2/index.html?embedded=1');
    expect(html).toContain('结果案例 · 先选你想得到的成果');
    expect(html).toContain('填写数据，开始现金分析');
    expect(html).toContain('真实 AI 执行仍需配置与验收');
    expect(html).toContain('当前显示：现在可办理');
  });
  for (const [hash, workspace, title, surface] of [
    ['study', 'study', '上书房 · 拟旨与办理', 'study'],
    ['junjichu', 'tasks', '军机处 · 办理与会审', 'cases'],
  ]) {
    it(`renders the existing ${workspace} component as the single inline surface for ${surface}`, () => {
      state.hash = hash;
      vi.stubGlobal('window', { location: { search: '' } });
      const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
      expect(html).toContain('/chaotang-final-v2/index.html?embedded=1');
      expect(html).toContain(title);
      expect(html).toContain(`data-test-workspace="${workspace}"`);
      expect(html).toContain('进入页面不会自动下旨');
      // The real component is the only operation surface on A02/A03; there is
      // no second full-screen modal drawer over the same page.
      expect(html).toContain(`data-court-inline-surface="${surface}"`);
      expect(html).not.toContain('data-court-modal="true"');
      // Loading is honest: geometry has not been reported yet in this render.
      expect(html).toContain('正在接入真实办理区');
      if (workspace === 'tasks') expect(html).toContain('data-embedded="true"');
    });
  }
  it('renders the real engineering workspace as the single B06 inline surface', () => {
    state.hash = 'gongbu';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('/chaotang-final-v2/index.html?embedded=1');
    expect(html).toContain('工部 · 技术任务与成果');
    expect(html).toContain('data-test-workspace="tasks"');
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain('data-court-inline-surface="gongbu"');
    expect(html).toContain('进入页面不会自动下旨');
    // The old full-screen engineering drawer is gone and the workspace mounts
    // exactly once inside the original paper scroll.
    expect(html).not.toContain('data-court-modal="true"');
    expect(html.match(/data-test-workspace="tasks"/g)?.length).toBe(1);
  });
  it('renders exactly one results catalog in the original Imperial Screen', () => {
    state.hash = 'results';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('结果案例 · 先选你想得到的成果');
    expect(html).not.toContain('data-court-modal="true"');
    expect(html).toContain('data-court-inline-surface="results"');
    expect(html.match(/填写数据，开始现金分析/g)?.length).toBe(1);
  });
  it('opens the same real B06 inline surface from the #gongbu route and for anonymous accounts', () => {
    state.pathname = '/court';
    state.hash = '#gongbu';
    vi.stubGlobal('window', { location: { search: '' } });
    expect(routePageForLocation('/court', '#gongbu')).toBe('B06');
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('data-court-inline-surface="gongbu"');
    expect(html).toContain('data-test-workspace="tasks"');
    expect(html).not.toContain('data-court-modal="true"');
    state.user = null;
    const anonymous = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(anonymous).toContain('data-court-inline-surface="gongbu"');
    expect(anonymous).toContain('登录朝堂账户');
    expect(anonymous).not.toContain('data-court-modal="true"');
  });
  it('accepts exactly the eight real inline pages and rejects a truly unknown page', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    for (const [hash, surface, title] of [
      ['study', 'study', '上书房 · 拟旨与办理'],
      ['junjichu', 'cases', '军机处 · 办理与会审'],
      ['shiguan', 'shiguan', '史馆总卷 · 档案与成果'],
      ['jinyiwei', 'jinyiwei', '锦衣卫 · 调查与证据'],
      ['hubu', 'hubu', '户部 · 现金分析与成果'],
      ['gongbu', 'gongbu', '工部 · 技术任务与成果'],
      ['forecast', 'forecast', '钦天监 · 条件推演'],
      ['learning', 'learning', '翰林院 · 学习与评测'],
    ]) {
      state.pathname = '/court';
      state.hash = hash;
      const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
      expect(html).toContain(`data-court-inline-surface="${surface}"`);
      expect(html).toContain(title);
      expect(html).not.toContain('data-court-modal="true"');
    }
    // A page outside the real eight-page whitelist still opens no operation
    // surface at all, and the iframe background stays on the hall.
    expect(inlinePageForPanel('gongbu')).toBe('B06');
    expect(inlinePageForPanel('forecast')).toBe('C02');
    expect(inlinePageForPanel('learning')).toBe('C03');
    expect(inlinePageForPanel('nonexistent')).toBeUndefined();
    expect(routePageForLocation('/court', '#nonexistent')).toBe('A01');
    state.hash = 'nonexistent';
    const unknown = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(unknown).not.toContain('data-court-inline-surface');
    expect(unknown).not.toContain('data-court-modal="true"');
  });
  it('syncs the iframe background to the A02/A03/B02 deep links without echoing', () => {
    expect(routePageForLocation('/court', '#study')).toBe('A02');
    expect(routePageForLocation('/court', '#junjichu')).toBe('A03');
    expect(routePageForLocation('/court', '#hubu')).toBe('B02');
    expect(routePageForLocation('/court', '#gongbu')).toBe('B06');
    // The Qintian and Hanlin deep links own their own real displays now.
    expect(routePageForLocation('/court', '#forecast')).toBe('C02');
    expect(routePageForLocation('/court', '#learning')).toBe('C03');
    expect(routePageForLocation('/forecast', '')).toBe('C02');
    expect(routePageForLocation('/learning', '')).toBe('C03');
    // Deep-link sections that stay on the hall keep the hall background.
    expect(routePageForLocation('/court', '')).toBe('A01');
    expect(routePageForLocation('/court', '#results')).toBe('A01');
    // Unrelated top-level routes keep their own page.
    expect(routePageForLocation('/wealth', '')).toBe('B02');
    expect(routePageForLocation('/life', '')).toBe('E04');
  });
  it('provides an account entry for an anonymous user', () => {
    state.user = null;
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('登录朝堂账户');
  });
  for (const [hash, surface, marker, count] of [
    ['forecast', 'forecast', 'data-qintian="overview"', /data-qintian=/g],
    [
      'learning',
      'learning',
      'data-learning-overview="true"',
      /data-learning-overview=/g,
    ],
  ] as const) {
    it(`renders the migrated ${hash} content as the single inline surface inside the original scroll`, () => {
      state.hash = hash;
      vi.stubGlobal('window', { location: { search: '' } });
      const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
      expect(html).toContain('/chaotang-final-v2/index.html?embedded=1');
      expect(html).toContain(
        surface === 'forecast' ? '钦天监 · 条件推演' : '翰林院 · 学习与评测'
      );
      expect(html).toContain('进入页面不会自动下旨');
      expect(html).toContain(marker);
      // The Qintian/Hanlin content reuses the original scroll as its only
      // surface; the retired full-screen black drawer is gone.
      expect(html).toContain(`data-court-inline-surface="${surface}"`);
      expect(html).not.toContain('data-court-modal="true"');
      expect(html.match(count)?.length).toBe(1);
      // Static section config only names the wired-in feature; it never claims
      // the product model or live data are connected.
      expect(html).toContain('功能已接入');
      expect(html).not.toContain('已接真实数据');
      expect(html).not.toContain('模型已连接');
    });
  }
  it('opens a real deep link section and never cross-opens the other department', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    state.pathname = '/forecast';
    state.hash = '#reviews';
    const reviews = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(reviews).toContain('钦天监 · 条件推演');
    expect(reviews).toContain('data-court-inline-surface="forecast"');
    expect(reviews).toContain('data-qintian="reviews"');
    expect(reviews).not.toContain('data-court-modal="true"');

    state.hash = '#hanlin';
    const cross = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(cross).toContain('data-qintian="overview"');
    expect(cross).not.toContain('data-hanlin="true"');

    state.pathname = '/learning';
    state.hash = '#hanlin';
    const hanlin = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(hanlin).toContain('翰林院 · 学习与评测');
    expect(hanlin).toContain('data-court-inline-surface="learning"');
    expect(hanlin).toContain('data-hanlin="true"');
    expect(hanlin).not.toContain('data-court-modal="true"');
  });
  it('offers an account entry on an anonymous migrated page', () => {
    state.user = null;
    state.hash = 'learning';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('翰林院 · 学习与评测');
    expect(html).toContain('data-court-inline-surface="learning"');
    expect(html).toContain('登录朝堂账户');
    expect(html).not.toContain('data-court-modal="true"');
  });
  it('gives each legal deep link its own mount identity without remounting on unrelated renders', () => {
    const reviews = courtPanelSection('/forecast', '#reviews');
    const triggers = courtPanelSection('/forecast', '#triggers');
    const learningHanlin = courtPanelSection('/learning', '#hanlin');
    expect(reviews).toBe('reviews');
    expect(triggers).toBe('triggers');
    // Different legal deep links must mount a distinct department panel.
    expect(departmentPanelKey('owner-A', 1, 'forecast', reviews)).not.toBe(
      departmentPanelKey('owner-A', 1, 'forecast', triggers)
    );
    expect(
      departmentPanelKey('owner-A', 1, 'learning', learningHanlin)
    ).not.toBe(departmentPanelKey('owner-A', 1, 'forecast', reviews));
    // The same route and session keep their identity, so in-panel input is
    // never remounted away by an unrelated render.
    expect(departmentPanelKey('owner-A', 1, 'forecast', reviews)).toBe(
      departmentPanelKey('owner-A', 1, 'forecast', reviews)
    );
    // Owner, session generation and module still partition the mount.
    expect(departmentPanelKey('owner-B', 1, 'forecast', reviews)).not.toBe(
      departmentPanelKey('owner-A', 1, 'forecast', reviews)
    );
    expect(departmentPanelKey('owner-A', 2, 'forecast', reviews)).not.toBe(
      departmentPanelKey('owner-A', 1, 'forecast', reviews)
    );
    expect(departmentPanelKey('owner-A', 1, 'learning', reviews)).not.toBe(
      departmentPanelKey('owner-A', 1, 'forecast', reviews)
    );
  });
  it('renders the real treasury workspace as the single B02 inline surface for the /wealth deep link', () => {
    state.pathname = '/wealth';
    state.hash = '#hubu-overview';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('/chaotang-final-v2/index.html?embedded=1');
    expect(html).toContain('户部 · 现金分析与成果');
    expect(html).toContain('data-hubu="hubu-overview"');
    // B02 reuses the original scroll instead of a second full-screen drawer and
    // mounts exactly one real treasury workspace.
    expect(html).toContain('data-court-inline-surface="hubu"');
    expect(html).not.toContain('data-court-modal="true"');
    expect(html.match(/data-hubu=/g)?.length).toBe(1);
    expect(html).toContain('输入数据可生成现金分析与');
  });
  it('opens the same B02 inline surface from the original #hubu department entry', () => {
    state.pathname = '/court';
    state.hash = '#hubu';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(routePageForLocation('/court', '#hubu')).toBe('B02');
    expect(html).toContain('data-court-inline-surface="hubu"');
    expect(html).toContain('data-hubu="none"');
    expect(html).not.toContain('data-court-modal="true"');
  });
  it('offers the account entry inside the anonymous B02 surface', () => {
    state.user = null;
    state.pathname = '/wealth';
    state.hash = '#hubu-overview';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('data-court-inline-surface="hubu"');
    expect(html).toContain('登录朝堂账户');
    expect(html).not.toContain('data-court-modal="true"');
  });
  it('renders the local life panel with a unified title and a real section for /life', () => {
    state.pathname = '/life';
    state.hash = '#calendar';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('/chaotang-final-v2/index.html?embedded=1');
    expect(html).toContain('生活 · 本机日程与笔记');
    expect(html).toContain('data-life="calendar"');
    expect(html).toContain('在本机管理日程、提醒和笔记；不自动发送给模型');
    expect(html).toContain('仅本机');
    expect(html).not.toContain('客户端扩展领域');
    expect(html).not.toContain('三份技术文档未定义');
    expect(html).not.toContain('实时AI');
  });
  it('rejects a cross-department hash and falls back to each department default', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    state.pathname = '/life';
    state.hash = '#hubu-overview';
    const life = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(life).toContain('data-life="today"');
    expect(life).not.toContain('data-hubu');
    state.pathname = '/wealth';
    state.hash = '#calendar';
    const wealth = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(wealth).toContain('data-hubu="none"');
    expect(wealth).not.toContain('data-life');
  });
  it('offers the account entry on an anonymous life page', () => {
    state.user = null;
    state.pathname = '/life';
    state.hash = '#notes';
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('生活 · 本机日程与笔记');
    expect(html).toContain('登录朝堂账户');
    expect(html).toContain('data-life="notes"');
  });
  it('gives wealth and life deep links their own mount identity and keeps the same route stable', () => {
    expect(departmentPanelKey('owner-A', 1, 'hubu', 'hubu-overview')).not.toBe(
      departmentPanelKey('owner-A', 1, 'hubu', 'accounting-reports')
    );
    expect(departmentPanelKey('owner-A', 1, 'hubu', 'hubu-overview')).not.toBe(
      departmentPanelKey('owner-A', 1, 'life', 'life-today')
    );
    expect(departmentPanelKey('owner-A', 1, 'life', 'life-today')).toBe(
      departmentPanelKey('owner-A', 1, 'life', 'life-today')
    );
    expect(departmentPanelKey('owner-B', 1, 'hubu', 'hubu-overview')).not.toBe(
      departmentPanelKey('owner-A', 1, 'hubu', 'hubu-overview')
    );
    expect(departmentPanelKey('owner-A', 2, 'life', 'life-today')).not.toBe(
      departmentPanelKey('owner-A', 1, 'life', 'life-today')
    );
  });
});

it('opens Shiguan inside its original A06 page instead of a second modal', () => {
  state.hash = 'shiguan';
  vi.stubGlobal('window', { location: { search: '' } });
  const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
  expect(routePageForLocation('/court', '#shiguan')).toBe('A06');
  expect(html).toContain('data-court-inline-surface="shiguan"');
  expect(html).toContain('data-test-workspace="archives"');
  expect(html).not.toContain('data-court-modal="true"');
});

vi.mock('./JinyiweiWorkspace', () => ({
  JinyiweiWorkspace: () =>
    createElement('div', { 'data-test-workspace': 'investigations' }),
}));
it('keeps Jinyiwei in its original central display without the modal overlay', () => {
  state.hash = 'jinyiwei';
  vi.stubGlobal('window', { location: { search: '' } });
  const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
  expect(html).toContain('data-court-inline-surface="jinyiwei"');
  expect(html).toContain('data-test-workspace="investigations"');
  expect(html).not.toContain('data-court-modal');
  expect(routePageForLocation('/court', '#jinyiwei')).toBe('C01');
});
