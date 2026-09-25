import { useQuery } from '@tanstack/react-query';
import {
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

export function FusionCapabilitiesPanel() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const query = useQuery({
    queryKey: ownerQueryKey(user?.id, 'fusion-capabilities'),
    queryFn: () => client.fusionCapabilities!(),
    enabled: Boolean(user && client.fusionCapabilities),
    retry: false,
  });
  return (
    <ChaotangPanel className="space-y-base p-double">
      <h3 className="text-lg text-high">军机处执行与鸿胪寺连接能力</h3>
      <p className="text-low">
        只读本地配置与文件存在性；凭据已配置不代表远端已连通，不会自动发起外部探测。
      </p>
      {!user ? (
        <p>登录后查看当前账户可见的能力状态。</p>
      ) : !client.fusionCapabilities ? (
        <p>当前客户端尚未接入能力状态。</p>
      ) : (
        <>
          <ChaotangButton
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? '读取中…' : '刷新能力状态'}
          </ChaotangButton>
          {query.isError && (
            <p role="alert" className="text-error">
              能力状态读取失败，请检查服务版本与连接。
            </p>
          )}
          {query.data && (
            <>
              <p>
                执行模式：
                {query.data.execution.mode === 'external'
                  ? '外置 Harness'
                  : '既有执行器'}
              </p>
              <p>
                运行程序文件：
                {query.data.execution.nodeAvailable ? '存在' : '缺失'} · Harness
                宿主文件：{query.data.execution.hostAvailable ? '存在' : '缺失'}
              </p>
              <p>
                网络配置：{query.data.networkEnabled ? '允许' : '禁用'} ·
                工具注册表：
                {query.data.registryStatus === 'VALID'
                  ? '配置有效'
                  : '配置无效'}
              </p>
              <p className="text-low">
                以上仅是本地可用条件，业务执行仍以真实任务结果为准。
              </p>
              {query.data.connectors.length ? (
                query.data.connectors.map((connector) => (
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
