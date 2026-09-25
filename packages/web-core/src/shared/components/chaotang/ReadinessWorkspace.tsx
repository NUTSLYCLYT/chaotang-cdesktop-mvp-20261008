import { FusionCapabilitiesPanel } from './FusionCapabilitiesPanel';
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  DatabaseIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { useChaotangReadiness } from '@/shared/hooks/chaotang/useChaotangReadiness';
import { useChaotangMcpCatalog } from '@/shared/hooks/chaotang/useMcp';
import { useChaotangConnectors } from '@/shared/hooks/chaotang/useConnectors';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

type ReadinessState = 'ready' | 'limited' | 'unprobed' | 'offline';

const STATE_META: Record<ReadinessState, { label: string; className: string }> =
  {
    ready: { label: '已就绪', className: 'text-success' },
    limited: { label: '有限就绪', className: 'text-brand' },
    unprobed: { label: '未探测', className: 'text-low' },
    offline: { label: '未连接', className: 'text-error' },
  };

export function ReadinessWorkspace() {
  const { health, user, error, isChecking, refresh } = useChaotangProvider();
  const readiness = useChaotangReadiness();
  const mcp = useChaotangMcpCatalog();
  const connectors = useChaotangConnectors();

  const refreshAll = async () => {
    await refresh();
    await Promise.all([
      readiness.refetch(),
      user ? mcp.refetch() : Promise.resolve(),
      user ? connectors.refetch() : Promise.resolve(),
    ]);
  };

  const runtimeState: ReadinessState = !health
    ? 'offline'
    : readiness.data?.ready
      ? 'ready'
      : 'limited';
  const mcpUnprobed =
    mcp.data?.servers.filter((server) => server.health === 'NOT_PROBED')
      .length ?? 0;
  const connectorUnprobed =
    connectors.data?.items.filter((item) => item.health === 'NOT_PROBED')
      .length ?? 0;
  const isRefreshing =
    isChecking ||
    readiness.isFetching ||
    mcp.isFetching ||
    connectors.isFetching;

  return (
    <div className="space-y-double">
      <FusionCapabilitiesPanel />
      <ChaotangPanel className="p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-brand/55">
              SYSTEM READINESS
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              系统就绪状态
            </h2>
            <p className="mt-base max-w-3xl text-sm leading-relaxed text-low">
              汇总本地领域服务、运行条件、MCP
              与数据连接器目录。配置启用不等于远端健康，未执行探测的能力会保持“未探测”。
            </p>
          </div>
          <ChaotangButton
            variant="secondary"
            onClick={() => void refreshAll()}
            disabled={isRefreshing}
          >
            <ArrowsClockwiseIcon
              className={cn('size-4', isRefreshing && 'animate-spin')}
            />
            {isRefreshing ? '正在检查' : '重新检查'}
          </ChaotangButton>
        </div>

        <div className="mt-double grid gap-base md:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            icon={ShieldCheckIcon}
            title="领域服务"
            state={health ? 'ready' : 'offline'}
            value={
              health
                ? `${health.service} · v${health.version}`
                : 'FastAPI 未连接'
            }
            detail={health?.baseUrl ?? error ?? '等待本地原生层连接'}
          />
          <StatusCard
            icon={CheckCircleIcon}
            title="运行条件"
            state={runtimeState}
            value={
              readiness.isPending && health
                ? '正在读取 /readyz'
                : readiness.data?.ready
                  ? '后端报告已就绪'
                  : '存在诊断项'
            }
            detail="由 /readyz 汇总，不在客户端拆解推测"
          />
          <StatusCard
            icon={PlugsConnectedIcon}
            title="MCP 注册表"
            state={!user || !mcp.data ? 'unprobed' : 'unprobed'}
            value={
              !user
                ? '登录后可读取'
                : mcp.isPending
                  ? '正在读取目录'
                  : `${mcp.data?.serverCount ?? 0} 个 Server · ${mcp.data?.enabledToolCount ?? 0} 个已启用工具`
            }
            detail={
              mcp.data
                ? `${mcpUnprobed} 个 Server 未执行远端探测`
                : '不接触凭据，不主动调用工具'
            }
          />
          <StatusCard
            icon={DatabaseIcon}
            title="数据连接器"
            state="unprobed"
            value={
              !user
                ? '登录后可读取'
                : connectors.isPending
                  ? '正在读取目录'
                  : `${connectors.data?.enabledCount ?? 0}/${connectors.data?.total ?? 0} 个配置已启用`
            }
            detail={
              connectors.data
                ? `${connectorUnprobed} 个连接器未执行远端探测`
                : '不触发同步，不生成最近同步时间'
            }
          />
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[1.25fr_0.8fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            {runtimeState === 'ready' ? (
              <CheckCircleIcon
                className="size-5 text-success"
                weight="duotone"
              />
            ) : (
              <WarningIcon className="size-5 text-brand" weight="duotone" />
            )}
            <h3 className="chaotang-title text-lg text-high">运行诊断</h3>
          </div>

          {!health ? (
            <DiagnosticMessage state="offline">
              当前无法访问领域服务；请确认本地 FastAPI 已启动后重新检查。
            </DiagnosticMessage>
          ) : readiness.isError ? (
            <DiagnosticMessage state="offline">
              {readiness.error.message}
            </DiagnosticMessage>
          ) : readiness.isPending ? (
            <DiagnosticMessage state="unprobed">
              正在读取后端就绪条件…
            </DiagnosticMessage>
          ) : readiness.data?.ready ? (
            <DiagnosticMessage state="ready">
              `/readyz` 未返回阻塞代码，后端报告当前运行条件已就绪。
            </DiagnosticMessage>
          ) : (
            <div className="mt-double space-y-base">
              {(readiness.data?.codes ?? []).map((code) => (
                <div
                  key={code}
                  className="flex items-center gap-base border border-brand/20 bg-brand/5 px-base py-base"
                >
                  <WarningIcon className="size-4 shrink-0 text-brand" />
                  <code className="break-all text-xs text-normal">{code}</code>
                </div>
              ))}
              {!readiness.data?.codes.length && (
                <DiagnosticMessage state="limited">
                  后端报告有限就绪，但没有返回可展示的诊断代码。
                </DiagnosticMessage>
              )}
            </div>
          )}
        </ChaotangPanel>

        <div className="flex flex-col gap-double">
          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <UserCircleIcon className="size-5 text-brand" weight="duotone" />
              <h3 className="chaotang-title text-lg text-high">访问上下文</h3>
            </div>
            <div className="mt-double space-y-base text-sm">
              <Row label="当前账户" value={user?.username ?? '未登录'} />
              <Row
                label="目录权限"
                value={user ? '已认证，只读' : '未授权读取'}
              />
              <Row label="写入操作" value="此页禁用" />
            </div>
          </ChaotangPanel>

          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <ShieldCheckIcon
                className="size-5 text-success"
                weight="duotone"
              />
              <h3 className="chaotang-title text-lg text-high">真实性边界</h3>
            </div>
            <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
              <li>“已连接”只表示本地领域服务可响应。</li>
              <li>“已启用”只表示仓库配置允许，不表示远端可用。</li>
              <li>“未探测”不会自动提升为健康，也不会触发网络请求。</li>
              <li>检查操作不执行任务、不调用 MCP、不同步数据。</li>
            </ul>
          </ChaotangPanel>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  title,
  state,
  value,
  detail,
}: {
  icon: typeof ShieldCheckIcon;
  title: string;
  state: ReadinessState;
  value: string;
  detail: string;
}) {
  const meta = STATE_META[state];
  return (
    <div className="border border-brand/15 bg-primary/40 p-base">
      <div className="flex items-center justify-between gap-base">
        <Icon className={cn('size-5', meta.className)} weight="duotone" />
        <span className={cn('text-[9px] tracking-[0.12em]', meta.className)}>
          {meta.label}
        </span>
      </div>
      <p className="mt-base text-xs text-low">{title}</p>
      <p className="mt-half text-sm text-high">{value}</p>
      <p className="mt-base break-all text-[10px] leading-relaxed text-low">
        {detail}
      </p>
    </div>
  );
}

function DiagnosticMessage({
  state,
  children,
}: {
  state: ReadinessState;
  children: string;
}) {
  return (
    <p
      className={cn(
        'mt-double border px-base py-double text-sm leading-relaxed',
        state === 'ready' && 'border-success/25 bg-success/5 text-success',
        state === 'limited' && 'border-brand/25 bg-brand/5 text-brand',
        state === 'unprobed' && 'border-brand/15 bg-primary/40 text-low',
        state === 'offline' && 'border-error/25 bg-error/5 text-error'
      )}
    >
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-base border-b border-brand/10 pb-base">
      <span className="text-low">{label}</span>
      <span className="text-right text-normal">{value}</span>
    </div>
  );
}
