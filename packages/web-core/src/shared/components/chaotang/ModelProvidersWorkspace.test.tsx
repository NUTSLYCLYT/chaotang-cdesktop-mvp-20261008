import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  error: new Error('private-provider-detail'),
  data: [] as Array<{
    presetId: string;
    enabled: boolean;
    apiKey: string;
    enabledModels: Array<{ id: string }>;
  }>,
  refetch: vi.fn(),
}));
vi.mock('@/shared/hooks/useProviders', () => ({ useProviders: () => state }));
vi.mock('@/shared/dialogs/settings/SettingsDialog', () => ({
  SettingsDialog: { show: vi.fn() },
}));
vi.mock('./FusionCapabilitiesPanel', () => ({
  FusionCapabilitiesPanel: () => <p>task-model-status</p>,
}));
import { ModelProvidersWorkspace } from './ModelProvidersWorkspace';

beforeEach(() => {
  state.isError = false;
  state.data = [];
});

it('original model workspace includes task status and does not invent configured models', () => {
  const html = renderToStaticMarkup(<ModelProvidersWorkspace />);
  expect(html).toContain('task-model-status');
  expect(html).toContain('此处保存密钥不会自动启用大臣执行任务');
  expect(html.match(/尚未配置模型列表/g)).toHaveLength(2);
  expect(html).not.toContain('gpt-5.6');
});

it('shows actual configuration without treating model discovery as execution acceptance', () => {
  state.data = [
    {
      presetId: 'openai',
      enabled: true,
      apiKey: 'private-key',
      enabledModels: [{ id: 'fixture-model' }],
    },
  ];
  const html = renderToStaticMarkup(<ModelProvidersWorkspace />);
  expect(html).toContain('配置中的模型：fixture-model');
  expect(html).not.toContain('private-key');
  expect(html).toContain('实际调用和任务交付还需要分别验证');
});

it('does not expose backend provider error details', () => {
  state.isError = true;
  const html = renderToStaticMarkup(<ModelProvidersWorkspace />);
  expect(html).toContain('配置暂时无法读取');
  expect(html).not.toContain('private-provider-detail');
});
