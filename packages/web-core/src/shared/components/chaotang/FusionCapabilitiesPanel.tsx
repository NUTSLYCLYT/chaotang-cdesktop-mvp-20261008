import { useQuery } from '@tanstack/react-query';
import {
  type FusionCapabilities,
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';
import { ownerQueryKey } from '@/shared/lib/chaotangFusion';
import { ChaotangPanel, ChaotangButton } from './ChaotangPrimitives';

const credentials: Record<string, string> = {
  PRESENT: '已配置',
  MISSING: '缺少凭据',
  NOT_REQUIRED: '无需凭据',
  UNAVAILABLE: '状态不可用',
};

const modelReasons: Record<string, string> = {
  external_execution_required: '需要由管理员配置多部门执行服务。',
  task_provider_unsupported: '所选模型服务尚未接入任务总预算，请管理员检查。',
  task_model_invalid: '尚未设置有效模型，请管理员检查。',
  task_provider_credential_missing: '缺少朝堂专用模型凭据，请管理员配置。',
  task_provider_credential_invalid: '模型凭据格式有误，请管理员检查。',
};

/** Only a complete, current payload may be shown as the account's capability. */
function hasCurrentCapabilities(
  value: FusionCapabilities | undefined
): value is FusionCapabilities {
  return Boolean(
    value &&
      value.execution &&
      typeof value.networkEnabled === 'boolean' &&
      typeof value.registryStatus === 'string' &&
      Array.isArray(value.connectors)
  );
}

export function TaskModelConfigurationView({
  value,
}: {
  value?: FusionCapabilities['taskModel'];
}) {
  const labels: Record<string, string> = {
    DISABLED: '暂未启用',
    BLOCKED: '配置待完善',
    CONFIGURED_UNVERIFIED: '已配置，真实任务待验证',
  };
  const known = value && Object.hasOwn(labels, value.state);
  return (
    <div className="rounded border p-base space-y-base">
      <h4 className="text-high">大臣团队的真实模型</h4>
      <p>{known ? labels[value.state] : '当前服务尚未提供模型配置状态'}</p>
      <p className="text-low">
        {value?.state === 'BLOCKED'
          ? Object.hasOwn(modelReasons, value.code)
            ? modelReasons[value.code]
            : '配置检查未通过，请管理员检查。'
          : value?.state === 'DISABLED'
            ? '可以先体验现金计算、成果下载与史馆；模型办理尚未启用。'
            : value?.state === 'CONFIGURED_UNVERIFIED'
              ? '配置存在不代表已经连通或办结，请以真实任务结果和证据为准。'
              : '刷新可重新读取；状态缺失不代表已连通。'}
      </p>
      {known &&
        (value.hardTokenLimit === 20000 || value.hardTokenLimit === 50000) && (
          <p className="text-low">
            新任务上限 {value.hardTokenLimit.toLocaleString('en-US')}{' '}
            tokens，输入、输出及重试累计；已有任务保留原批准额度。
          </p>
        )}
    </div>
  );
}

export function FusionCapabilitiesPanel() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const query = useQuery({
    queryKey: ownerQueryKey(user?.id, 'fusion-capabilities'),
    queryFn: () => client.fusionCapabilities!(),
    enabled: Boolean(user && client.fusionCapabilities),
    retry: false,
  });
  const capabilities =
    !query.isFetching && !query.isError && hasCurrentCapabilities(query.data)
      ? query.data
      : undefined;
  return (
    <ChaotangPanel className="space-y-base p-double">
      <h3 className="text-lg text-high">军机处执行与鸿胪寺连接能力</h3>
      <p className="text-low">
        只读本地配置与文件存在性；凭据已配置不代表远端已连通，不会自动发起外部探测。
      </p>
      {!user ? (
        <p>登录后查看当前账户可见的能力状态。</p>
      ) : !client.fusionCapabilities ? (
        <p>当前客户端尚未接入能力状态，请管理员检查服务版本。</p>
      ) : (
        <>
          <ChaotangButton
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? '读取中…' : '刷新能力状态'}
          </ChaotangButton>
          {query.isFetching ? (
            <p role="status">正在读取能力状态…</p>
          ) : query.isError ? (
            <p role="alert" className="text-error">
              能力状态读取失败，请检查服务版本与连接，然后刷新重试。
            </p>
          ) : !capabilities ? (
            <p role="status">
              尚未读取到能力状态数据，请刷新重试；数据缺失不代表没有连接器。
            </p>
          ) : (
            <>
              <TaskModelConfigurationView value={capabilities.taskModel} />
              <p>
                执行模式：
                {capabilities.execution.mode === 'external'
                  ? '外置 Harness'
                  : '既有执行器'}
              </p>
              <p>
                运行程序文件：
                {capabilities.execution.nodeAvailable ? '存在' : '缺失'} ·
                Harness 宿主文件：
                {capabilities.execution.hostAvailable ? '存在' : '缺失'}
              </p>
              <p>
                网络配置：{capabilities.networkEnabled ? '允许' : '禁用'} ·
                工具注册表：
                {capabilities.registryStatus === 'VALID'
                  ? '配置有效'
                  : '配置无效'}
              </p>
              <p className="text-low">
                以上仅是本地可用条件，业务执行仍以真实任务结果为准。
              </p>
              {capabilities.connectors.length ? (
                capabilities.connectors.map((connector) => (
                  <details key={connector.id} className="rounded border p-base">
                    <summary className="cursor-pointer">
                      {connector.id} ·{' '}
                      {connector.enabled ? '配置启用' : '配置禁用'} · 未验证连通
                    </summary>
                    <p>
                      凭据：
                      {credentials[connector.credentialStatus] ??
                        '状态不可用'}{' '}
                      · 授权版本：{connector.approvalRevision}
                    </p>
                    {connector.approvedTools.length ? (
                      connector.approvedTools.map((tool) => (
                        <p key={tool.id}>
                          {tool.id} · {tool.enabled ? '配置启用' : '配置禁用'} ·
                          授权版本：{tool.approvalRevision}
                        </p>
                      ))
                    ) : (
                      <p>未配置授权工具</p>
                    )}
                  </details>
                ))
              ) : (
                <p>当前没有已登记的连接器。</p>
              )}
            </>
          )}
        </>
      )}
    </ChaotangPanel>
  );
}
