import { useState } from 'react';
import {
  DatabaseIcon,
  GlobeHemisphereWestIcon,
  KeyIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useChaotangConnectors } from '@/shared/hooks/chaotang/useConnectors';
import {
  useChaotangProvider,
  type ChaotangConnector,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

export function ConnectorsWorkspace() {
  const { user, health } = useChaotangProvider();
  const catalog = useChaotangConnectors();
  const [selectedId, setSelectedId] = useState<string>();

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '连接器注册表未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          目录只读取代码批准的数据源，不检查凭据或访问远端服务。
        </p>
      </ChaotangPanel>
    );
  }
  if (catalog.isPending) {
    return (
      <div className="h-96 animate-pulse border border-brand/15 bg-panel/60" />
    );
  }
  if (catalog.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {catalog.error.message}
      </ChaotangPanel>
    );
  }

  const selected = catalog.data.items.find(
    (item) => item.connectorId === selectedId
  );
  const notProbed = catalog.data.items.filter(
    (item) => item.health === 'NOT_PROBED'
  ).length;

  return (
    <div className="space-y-double">
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '连接器', value: catalog.data.total },
          { label: '已启用配置', value: catalog.data.enabledCount },
          { label: '无需凭据', value: catalog.data.credentialFreeCount },
          { label: '未主动探测', value: notProbed },
        ].map((item) => (
          <ChaotangPanel key={item.label} className="p-base">
            <p className="text-xs text-low">{item.label}</p>
            <p className="chaotang-title mt-half text-2xl text-brand">
              {item.value}
            </p>
          </ChaotangPanel>
        ))}
      </div>

      <ChaotangPanel className="p-base">
        <div className="flex items-start gap-base">
          <ShieldCheckIcon
            className="mt-half size-5 shrink-0 text-success"
            weight="duotone"
          />
          <div>
            <p className="text-sm text-high">按需读取，无后台同步</p>
            <p className="mt-half text-xs leading-relaxed text-low">
              当前连接器仅在正式调查流程获得授权后按需读取；本页面不添加来源、不触发同步、不检查凭据，也不伪造“最近同步”时间。
            </p>
          </div>
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[0.9fr_1.25fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <DatabaseIcon className="size-5 text-brand" weight="duotone" />
            <h2 className="chaotang-title text-lg text-high">数据连接器</h2>
          </div>
          <div className="mt-double space-y-base">
            {catalog.data.items.map((connector) => {
              const Icon =
                connector.kind === 'PUBLIC_API'
                  ? GlobeHemisphereWestIcon
                  : KeyIcon;
              return (
                <button
                  key={connector.connectorId}
                  type="button"
                  onClick={() => setSelectedId(connector.connectorId)}
                  className={cn(
                    'flex w-full items-start gap-base border p-base text-left',
                    selectedId === connector.connectorId
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <Icon
                    className="mt-half size-5 shrink-0 text-brand"
                    weight="duotone"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-base">
                      <p className="text-sm text-high">
                        {connector.displayName}
                      </p>
                      <span className="text-[9px] text-success">
                        {connector.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    <p className="mt-half break-all font-mono text-[10px] text-low">
                      {connector.connectorId}
                    </p>
                    <p className="mt-base text-[10px] text-low">
                      {connector.kind} · {credentialLabel(connector)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          {!selected ? (
            <EmptyState>选择一个连接器查看来源范围与数据边界</EmptyState>
          ) : (
            <ConnectorDetail connector={selected} />
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function ConnectorDetail({ connector }: { connector: ChaotangConnector }) {
  return (
    <article>
      <div className="border-b border-brand/15 pb-double">
        <p className="text-[9px] tracking-[0.2em] text-brand/55">
          {connector.kind} ·{' '}
          {connector.health === 'NOT_PROBED' ? '未探测' : '已禁用'}
        </p>
        <h2 className="chaotang-title mt-half text-2xl text-high">
          {connector.displayName}
        </h2>
        <p className="mt-half text-xs text-low">
          发布者：{connector.publisher}
        </p>
      </div>
      <Field label="访问策略" value={connector.accessPolicy} />
      <Field label="凭据状态" value={credentialLabel(connector)} />
      <Field label="同步方式" value="按需读取" />
      <Field
        label="最近同步"
        value={
          connector.lastSyncAt
            ? new Date(connector.lastSyncAt).toLocaleString('zh-CN')
            : '无后台同步记录'
        }
      />
      <TagList title="数据类别" items={connector.categories} />
      <TagList title="覆盖范围" items={connector.coverage} />
      {connector.qualityCeiling && (
        <Field label="质量上限" value={connector.qualityCeiling} />
      )}
      <p className="mt-double border-t border-brand/15 pt-double text-xs leading-relaxed text-low">
        连接地址、查询参数、凭据引用和解析器均由后端代码持有，未向客户端公开。
      </p>
    </article>
  );
}

function credentialLabel(connector: ChaotangConnector) {
  return connector.credentialStatus === 'NOT_REQUIRED'
    ? '无需凭据'
    : '凭据未检查';
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-base grid gap-half border-b border-brand/10 pb-base sm:grid-cols-[100px_1fr]">
      <span className="text-xs text-low">{label}</span>
      <span className="break-all text-xs text-normal">{value}</span>
    </div>
  );
}

function TagList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-double">
      <h3 className="text-xs text-brand">{title}</h3>
      <div className="mt-base flex flex-wrap gap-half">
        {items.map((item) => (
          <span
            key={item}
            className="border border-brand/20 bg-brand/5 px-half py-half text-[9px] text-normal"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
      {children}
    </p>
  );
}
