import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FusionCapabilitiesPanel } from './FusionCapabilitiesPanel';
import type { FusionCapabilities } from '@/shared/providers/ChaotangProvider';

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

const current: FusionCapabilities = {
  taskModel: {
    state: 'CONFIGURED_UNVERIFIED',
    code: '',
    hardTokenLimit: 50000,
    probeStatus: 'NOT_TESTED',
    scope: 'configuration_only',
  },
  execution: {
    mode: 'external',
    nodeAvailable: true,
    hostAvailable: false,
    availabilityScope: 'file_presence',
  },
  networkEnabled: true,
  registryStatus: 'VALID',
  connectors: [
    {
      id: 'connector-alpha',
      enabled: true,
      credentialStatus: 'PRESENT',
      approvalRevision: 'rev-1',
      approvedTools: [
        { id: 'tool-alpha', enabled: true, approvalRevision: 'rev-1' },
      ],
      probeStatus: 'UNVERIFIED',
    },
  ],
};

beforeEach(() => {
  state.user = { id: 'owner-a' };
  state.query = {
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    data: current,
  };
  state.capability = vi.fn();
});

const render = () => renderToStaticMarkup(<FusionCapabilitiesPanel />);

it('reads the owner-scoped existing endpoint and shows current configuration', () => {
  const html = render();
  expect(state.options.enabled).toBe(true);
  expect(JSON.stringify(state.options.queryKey)).toContain('owner-a');
  expect(JSON.stringify(state.options.queryKey)).toContain(
    'fusion-capabilities'
  );
  expect(state.capability).not.toHaveBeenCalled();
  expect(html).toContain('外置 Harness');
  expect(html).toContain('允许');
  expect(html).toContain('配置有效');
  expect(html).toContain('connector-alpha');
  expect(html).toContain('tool-alpha');
  expect(html).toContain('50,000 tokens');
});

it('does not present cached capability as current when refresh fails', () => {
  state.query.isError = true;
  const html = render();
  expect(html).toContain('读取失败');
  expect(html).toContain('刷新');
  expect(html).not.toContain('外置 Harness');
  expect(html).not.toContain('connector-alpha');
  expect(html).not.toContain('tool-alpha');
  expect(html).not.toContain('50,000');
  expect(html).not.toContain('当前没有已登记的连接器');
});

it('does not present cached capability as current while refreshing', () => {
  state.query.isFetching = true;
  const html = render();
  expect(html).toContain('正在读取能力状态');
  expect(html).not.toContain('外置 Harness');
  expect(html).not.toContain('connector-alpha');
  expect(html).not.toContain('50,000');
  expect(html).toMatch(/disabled=""/);
});

it('asks the reader to retry when a completed read has no capability data', () => {
  state.query.data = undefined;
  const html = render();
  expect(html).toContain('尚未读取到能力状态数据');
  expect(html).toContain('刷新');
  expect(html).not.toContain('当前没有已登记的连接器');
});

it('does not show cached capability to an anonymous visitor', () => {
  state.user = undefined;
  const html = render();
  expect(state.options.enabled).toBe(false);
  expect(html).toContain('登录后查看');
  expect(html).not.toContain('connector-alpha');
  expect(html).not.toContain('50,000');
});

it('tells an authenticated user when the client lacks the endpoint', () => {
  state.capability = undefined;
  const html = render();
  expect(state.options.enabled).toBe(false);
  expect(html).toContain('当前客户端尚未接入能力状态');
  expect(html).not.toContain('登录后查看');
});

it('states that no connectors are registered only on a current successful read', () => {
  state.query.data = { ...current, connectors: [] };
  const html = render();
  expect(html).toContain('外置 Harness');
  expect(html).toContain('当前没有已登记的连接器');
});

it('does not claim zero connectors when the successful payload is incomplete', () => {
  state.query.data = {
    taskModel: current.taskModel,
    execution: current.execution,
    networkEnabled: true,
    registryStatus: 'VALID',
  };
  const html = render();
  expect(html).toContain('尚未读取到能力状态数据');
  expect(html).not.toContain('当前没有已登记的连接器');
  expect(html).not.toContain('外置 Harness');
});

it('keeps unknown model codes out of the current view', () => {
  state.query.data = {
    ...current,
    taskModel: {
      ...current.taskModel!,
      state: 'BLOCKED',
      code: 'private-secret',
    },
  };
  const html = render();
  expect(html).not.toContain('private-secret');
});
