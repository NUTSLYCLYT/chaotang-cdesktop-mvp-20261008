import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudyResourceBudget } from './StudyResourceBudget';

const state = vi.hoisted(() => ({
  user: { id: 'owner-a' } as { id: string } | undefined,
  query: {} as Record<string, unknown>,
  options: {} as Record<string, unknown>,
  capability: vi.fn() as ReturnType<typeof vi.fn> | undefined,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Record<string, unknown>) => {
    state.options = options;
    return state.query;
  },
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({ user: state.user }),
  useChaotangClient: () => ({ fusionCapabilities: state.capability }),
}));

beforeEach(() => {
  state.user = { id: 'owner-a' };
  state.query = {
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      taskModel: { state: 'CONFIGURED_UNVERIFIED', hardTokenLimit: 50000 },
    },
  };
  state.capability = vi.fn();
});
const render = () => renderToStaticMarkup(<StudyResourceBudget />);

it('uses the owner-scoped existing read endpoint and makes no model call', () => {
  const html = render();
  expect(state.options.enabled).toBe(true);
  expect(JSON.stringify(state.options.queryKey)).toContain('owner-a');
  expect(JSON.stringify(state.options.queryKey)).toContain(
    'fusion-capabilities'
  );
  expect(state.capability).not.toHaveBeenCalled();
  expect(html).toContain('50,000 tokens');
  expect(html).toContain('输入、输出及重试累计');
  expect(html).toContain('真实任务待验证');
  expect(html).toContain('不是金额报价');
});

it('does not show stale budget when refresh fails or is in progress', () => {
  state.query.isError = true;
  expect(render()).toContain('不能确认当前上限');
  expect(render()).not.toContain('50,000');
  state.query.isFetching = true;
  expect(render()).toContain('正在读取服务器资源配置');
  expect(render()).not.toContain('50,000');
});

it('does not render cached configuration for an anonymous user', () => {
  state.user = undefined;
  const html = render();
  expect(state.options.enabled).toBe(false);
  expect(html).toContain('请先登录');
  expect(html).not.toContain('50,000');
  expect(html).not.toContain('重新读取资源配置');
});

it('preserves missing and disabled server states without claiming readiness', () => {
  state.query.data = {};
  expect(render()).toContain('尚未提供模型配置状态');
  expect(render()).not.toContain('50,000');
  state.query.data = {
    taskModel: { state: 'DISABLED', hardTokenLimit: 50000 },
  };
  expect(render()).toContain('暂未启用');
  expect(render()).toContain('模型办理尚未启用');
  expect(render()).not.toContain('已配置，真实任务待验证');
});

it('does not ask an authenticated user to log in when the client lacks the endpoint', () => {
  state.capability = undefined;
  const html = render();
  expect(state.options.enabled).toBe(false);
  expect(html).toContain('当前客户端尚未接入资源配置');
  expect(html).not.toContain('请先登录');
  expect(html).not.toContain('50,000');
});
