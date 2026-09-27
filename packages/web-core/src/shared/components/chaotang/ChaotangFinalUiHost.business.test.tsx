import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hash: 'study',
  user: { id: 'owner-A' } as { id: string } | null,
}));
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/court', hash: state.hash }),
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
vi.mock('./ModelProvidersWorkspace', () => ({
  ModelProvidersWorkspace: () => null,
}));
vi.mock('./SkillsWorkspace', () => ({ SkillsWorkspace: () => null }));
vi.mock('./McpWorkspace', () => ({ McpWorkspace: () => null }));

import { ChaotangFinalUiHost } from './ChaotangFinalUiHost';
afterEach(() => {
  vi.unstubAllGlobals();
  state.hash = 'study';
  state.user = { id: 'owner-A' };
});

describe('court shell business entry rendering', () => {
  for (const [hash, workspace, title] of [
    ['study', 'study', '上书房 · 拟旨与办理'],
    ['junjichu', 'cases', '军机处 · 真实案卷'],
  ]) {
    it(`renders the existing ${workspace} component inside the original iframe shell`, () => {
      state.hash = hash;
      vi.stubGlobal('window', { location: { search: '' } });
      const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
      expect(html).toContain('/chaotang-final-v2/index.html?embedded=1');
      expect(html).toContain(title);
      expect(html).toContain(`data-test-workspace="${workspace}"`);
      expect(html).toContain('进入页面不会自动下旨');
    });
  }
  it('provides an account entry for an anonymous user', () => {
    state.user = null;
    vi.stubGlobal('window', { location: { search: '' } });
    const html = renderToStaticMarkup(createElement(ChaotangFinalUiHost));
    expect(html).toContain('登录朝堂账户');
  });
});
