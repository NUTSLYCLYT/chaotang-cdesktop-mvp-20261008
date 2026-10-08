import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskModelConfigurationView } from './FusionCapabilitiesPanel';
import type { FusionCapabilities } from '@/shared/providers/ChaotangProvider';

function render(
  state: 'DISABLED' | 'BLOCKED' | 'CONFIGURED_UNVERIFIED',
  code = '',
  hardTokenLimit = 20000
) {
  return renderToStaticMarkup(
    <TaskModelConfigurationView
      value={{
        state,
        code,
        hardTokenLimit,
        probeStatus: 'NOT_TESTED',
        scope: 'configuration_only',
      }}
    />
  );
}

it('does not convert a legacy missing field into a ready claim', () => {
  const html = renderToStaticMarkup(<TaskModelConfigurationView />);
  expect(html).toContain('尚未提供模型配置状态');
  expect(html).not.toContain('已配置，真实任务待验证');
});

it('explains what remains available while models are disabled', () => {
  const html = render('DISABLED');
  expect(html).toContain('暂未启用');
  expect(html).toContain('现金计算、成果下载与史馆');
});

it('shows specific next steps without echoing unknown server codes', () => {
  expect(render('BLOCKED', 'task_provider_credential_missing')).toContain(
    '缺少朝堂专用模型凭据'
  );
  const html = render('BLOCKED', 'private-secret-from-server');
  expect(html).toContain('请管理员检查');
  expect(html).not.toContain('private-secret');
  expect(render('BLOCKED', '__proto__')).toContain('请管理员检查');
});

it('keeps configured, connected and executed separate', () => {
  const html = render('CONFIGURED_UNVERIFIED');
  expect(html).toContain('已配置，真实任务待验证');
  expect(html).toContain('配置存在不代表已经连通或办结');
  expect(html).toContain('20,000 tokens');
});

it('does not render unrecognized model states or limits as accepted', () => {
  const value = {
    state: 'private-secret',
    code: '',
    hardTokenLimit: 200000,
    probeStatus: 'NOT_TESTED',
    scope: 'configuration_only',
  } as unknown as FusionCapabilities['taskModel'];
  const html = renderToStaticMarkup(
    <TaskModelConfigurationView value={value} />
  );
  expect(html).toContain('尚未提供模型配置状态');
  expect(html).not.toContain('private-secret');
  expect(html).not.toContain('200000');
});

it('shows the new-task cap while preserving existing task approvals', () => {
  const html = render('CONFIGURED_UNVERIFIED', '', 50000);
  expect(html).toContain('50,000 tokens');
  expect(html).toContain('输入、输出及重试累计');
  expect(html).toContain('已有任务保留原批准额度');
  expect(html).not.toContain('已连通');
});

it('does not display an unsupported cap even for a recognized state', () => {
  const html = render('CONFIGURED_UNVERIFIED', '', 200000);
  expect(html).not.toContain('200,000');
  expect(html).not.toContain('200000');
  expect(html).not.toContain('新任务上限');
});
