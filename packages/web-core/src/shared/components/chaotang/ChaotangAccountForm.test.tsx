import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({ login: vi.fn(), register: vi.fn() }),
}));
import { ChaotangAccountForm } from './ChaotangAccountForm';

describe('shared account form content', () => {
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
