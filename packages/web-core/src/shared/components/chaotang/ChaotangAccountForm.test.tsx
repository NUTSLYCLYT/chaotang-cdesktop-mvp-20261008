import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  isLoggingOut: false,
  logoutNotice: null as string | null,
}));

vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({
    login: vi.fn(),
    register: vi.fn(),
    ...session,
  }),
}));
import { ChaotangAccountForm } from './ChaotangAccountForm';
afterEach(() => {
  session.isLoggingOut = false;
  session.logoutNotice = null;
});

describe('shared account form content', () => {
  it('shows pending logout and disables sign-in until it settles', () => {
    session.isLoggingOut = true;
    const html = renderToStaticMarkup(
      createElement(ChaotangAccountForm, {
        mode: 'login',
        onModeChange: vi.fn(),
      })
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('正在退出账户并确认会话状态');
    expect(html).toMatch(/type="submit" disabled=""/);
  });
  it('keeps an unconfirmed logout warning visible on the anonymous form', () => {
    session.logoutNotice = '退出未能完整确认';
    const html = renderToStaticMarkup(
      createElement(ChaotangAccountForm, {
        mode: 'login',
        onModeChange: vi.fn(),
      })
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(session.logoutNotice);
    expect(html).not.toMatch(/type="submit" disabled=""/);
  });
  it('makes registration available next to the login form with named inputs', () => {
    const html = renderToStaticMarkup(
      createElement(ChaotangAccountForm, {
        mode: 'login',
        onModeChange: vi.fn(),
      })
    );
    expect(html).toContain('注册新账户');
    expect(html).toContain('aria-label="登录朝堂账户"');
    expect(html).toContain('name="identifier"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).not.toContain('name="email"');
  });
  it('renders complete registration fields with compatible bounds and password manager hints', () => {
    const html = renderToStaticMarkup(
      createElement(ChaotangAccountForm, {
        mode: 'register',
        onModeChange: vi.fn(),
      })
    );
    expect(html).toContain('aria-label="注册朝堂账户"');
    expect(html).toContain('name="username"');
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('maxLength="254"');
    expect(html).toContain('maxLength="1024"');
    expect(html).toContain('minLength="6"');
    expect(html).toContain('创建账户');
    expect(html).not.toContain('name="identifier"');
  });
});
