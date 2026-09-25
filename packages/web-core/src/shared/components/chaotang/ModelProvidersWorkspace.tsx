import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CpuIcon,
  KeyIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { useProviders } from '@/shared/hooks/useProviders';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';

const SUPPORTED_PROVIDERS = [
  {
    presetId: 'openai',
    name: 'OpenAI · GPT',
    description: '官方 Responses API，供 Codex 与 OpenCode 会话调用。',
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
  },
  {
    presetId: 'deepseek',
    name: 'DeepSeek',
    description: '兼容 Responses、Chat Completions 与 Anthropic 协议。',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
] as const;

export function ModelProvidersWorkspace() {
  const providers = useProviders();

  return (
    <div className="space-y-double">
      <ChaotangPanel className="relative overflow-hidden p-double">
        <div className="pointer-events-none absolute right-0 top-0 size-72 bg-[radial-gradient(circle,rgba(194,155,76,0.18),transparent_68%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-double">
          <div className="flex items-start gap-base">
            <div className="border border-brand/35 bg-brand/10 p-base text-brand">
              <CpuIcon className="size-7" weight="duotone" />
            </div>
            <div>
              <p className="text-[9px] tracking-[0.28em] text-brand/60">
                MODEL PROVIDERS
              </p>
              <h1 className="chaotang-title mt-half text-2xl text-high">
                模型服务
              </h1>
              <p className="mt-base max-w-2xl text-sm leading-relaxed text-low">
                统一配置 GPT 与 DeepSeek。选择官方预设、填写自己的 API
                密钥并校验模型列表后，即可在新会话中直接选择模型。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => SettingsDialog.show({ initialSection: 'providers' })}
            className="inline-flex items-center gap-half border border-brand/35 bg-brand/10 px-base py-half text-xs text-brand hover:bg-brand/15"
          >
            <SlidersHorizontalIcon className="size-4" />
            管理模型服务
          </button>
        </div>
      </ChaotangPanel>

      {providers.isPending ? (
        <div className="h-48 animate-pulse border border-brand/15 bg-panel/60" />
      ) : providers.isError ? (
        <ChaotangPanel className="p-double text-center text-error">
          <p>模型服务读取失败：{providers.error.message}</p>
          <button
            type="button"
            onClick={() => providers.refetch()}
            className="mt-base inline-flex items-center gap-half border border-error/30 px-base py-half text-xs"
          >
            <ArrowClockwiseIcon className="size-4" /> 重新读取
          </button>
        </ChaotangPanel>
      ) : (
        <div className="grid gap-double lg:grid-cols-2">
          {SUPPORTED_PROVIDERS.map((definition) => {
            const record = providers.data?.find(
              (provider) => provider.presetId === definition.presetId
            );
            const ready = Boolean(record?.enabled && record.apiKey);
            return (
              <ChaotangPanel key={definition.presetId} className="p-double">
                <div className="flex items-start justify-between gap-base">
                  <div>
                    <p className="text-[9px] tracking-[0.2em] text-brand/55">
                      OFFICIAL PRESET
                    </p>
                    <h2 className="chaotang-title mt-half text-xl text-high">
                      {definition.name}
                    </h2>
                  </div>
                  <span
                    className={
                      ready
                        ? 'border border-success/35 bg-success/10 px-base py-half text-[9px] text-success'
                        : 'border border-brand/25 bg-brand/5 px-base py-half text-[9px] text-brand'
                    }
                  >
                    {ready ? '已配置' : '待填写密钥'}
                  </span>
                </div>
                <p className="mt-base text-xs leading-relaxed text-low">
                  {definition.description}
                </p>
                <div className="mt-double space-y-base border-t border-brand/15 pt-double">
                  <div className="flex items-center gap-base text-xs text-normal">
                    <KeyIcon className="size-4 text-brand" />
                    API 密钥：{record?.apiKey ? '已保存' : '未设置'}
                  </div>
                  <div className="flex items-start gap-base text-xs text-normal">
                    <CheckCircleIcon className="mt-px size-4 shrink-0 text-brand" />
                    <span>
                      已启用模型：
                      {record?.enabledModels.length
                        ? record.enabledModels
                            .map((model) => model.id)
                            .join('、')
                        : definition.models.join('、')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    SettingsDialog.show({ initialSection: 'providers' })
                  }
                  className="mt-double w-full border border-brand/25 px-base py-base text-xs text-brand hover:bg-brand/10"
                >
                  {record ? '编辑与验证' : '添加并填写密钥'}
                </button>
              </ChaotangPanel>
            );
          })}
        </div>
      )}

      <ChaotangPanel className="p-double">
        <h2 className="chaotang-title text-lg text-high">接入边界</h2>
        <ul className="mt-base space-y-half text-xs leading-relaxed text-low">
          <li>“已保存”仅表示本机已有配置，不等于密钥一定有效。</li>
          <li>
            请在服务商设置中点击“从端点获取”，成功返回模型列表后再视为验证通过。
          </li>
          <li>模型调用仍受所选 Agent、模型权限、账户余额与供应商限流约束。</li>
        </ul>
      </ChaotangPanel>
    </div>
  );
}
