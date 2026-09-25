import { useMemo, useState } from 'react';
import {
  PlugsConnectedIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { useChaotangMcpCatalog } from '@/shared/hooks/chaotang/useMcp';
import {
  useChaotangProvider,
  type ChaotangMcpTool,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

export function McpWorkspace() {
  const { user, health } = useChaotangProvider();
  const catalog = useChaotangMcpCatalog();
  const [selectedTool, setSelectedTool] = useState<string>();

  const tools = useMemo(
    () =>
      catalog.data?.servers.flatMap((server) =>
        server.tools.map((tool) => ({ server, tool }))
      ) ?? [],
    [catalog.data]
  );
  const selected = tools.find(
    ({ server, tool }) => `${server.serverId}:${tool.toolName}` === selectedTool
  );

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : 'MCP 注册表未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          MCP 目录需要通过账户认证，但不会向 WebView 返回凭据。
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

  const unprobedCount = catalog.data.servers.filter(
    (server) => server.health === 'NOT_PROBED'
  ).length;

  return (
    <div className="space-y-double">
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'MCP Server', value: catalog.data.serverCount },
          { label: '批准工具', value: catalog.data.toolCount },
          { label: '已启用工具', value: catalog.data.enabledToolCount },
          { label: '未主动探测', value: unprobedCount },
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
            <p className="text-sm text-high">凭据隔离与零调用目录</p>
            <p className="mt-half text-xs leading-relaxed text-low">
              此页仅读取仓库批准配置，不做工具发现、网络探测或 MCP
              调用；“已启用”只代表管理员配置允许，不代表当前网络健康。
            </p>
          </div>
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[0.9fr_1.25fr]">
        <div className="space-y-double">
          {catalog.data.servers.map((server) => (
            <ChaotangPanel key={server.serverId} className="p-double">
              <div className="flex items-start justify-between gap-base">
                <div className="flex items-start gap-base">
                  <PlugsConnectedIcon
                    className="mt-half size-6 text-brand"
                    weight="duotone"
                  />
                  <div>
                    <h2 className="chaotang-title text-lg text-high">
                      {server.displayName}
                    </h2>
                    <p className="mt-half font-mono text-[10px] text-low">
                      {server.serverId} · {server.transport}
                    </p>
                  </div>
                </div>
                <span className="border border-brand/25 px-half py-half text-[9px] text-brand">
                  {server.health === 'NOT_PROBED' ? '未探测' : '已禁用'}
                </span>
              </div>
              <div className="mt-base grid gap-half text-[10px] text-low sm:grid-cols-2">
                <p>来源：{server.sourceKind}</p>
                <p>访问：{server.accessPolicy}</p>
                <p className="sm:col-span-2">
                  审批版本：{server.approvalVersion}
                </p>
              </div>
              <div className="mt-double space-y-half">
                {server.tools.map((tool) => {
                  const id = `${server.serverId}:${tool.toolName}`;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedTool(id)}
                      className={cn(
                        'flex w-full items-center gap-base border p-base text-left',
                        selectedTool === id
                          ? 'border-brand/45 bg-brand/10'
                          : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                      )}
                    >
                      <WrenchIcon className="size-4 shrink-0 text-brand" />
                      <span className="font-mono text-xs text-high">
                        {tool.toolName}
                      </span>
                      <span className="ml-auto text-[9px] text-success">
                        {tool.effect}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ChaotangPanel>
          ))}
        </div>

        <ChaotangPanel className="p-double">
          {!selected ? (
            <EmptyState>选择一个已批准工具查看作用域与审批边界</EmptyState>
          ) : (
            <ToolDetail
              tool={selected.tool}
              serverId={selected.server.serverId}
            />
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function ToolDetail({
  tool,
  serverId,
}: {
  tool: ChaotangMcpTool;
  serverId: string;
}) {
  return (
    <article>
      <div className="border-b border-brand/15 pb-double">
        <p className="text-[9px] tracking-[0.2em] text-brand/55">
          {serverId} · APPROVED TOOL
        </p>
        <h2 className="chaotang-title mt-half text-2xl text-high">
          {tool.toolName}
        </h2>
        <div className="mt-base flex flex-wrap gap-half">
          <Tag>{tool.effect}</Tag>
          {tool.resolverOnly && <Tag>仅实体解析</Tag>}
          <Tag>{tool.enabled ? '已启用' : '已禁用'}</Tag>
        </div>
      </div>
      <Field label="审批版本" value={tool.approvalVersion} />
      <Field label="优先级" value={String(tool.priority)} />
      <List title="事实类别" items={tool.factCategories} />
      <List title="数据范围" items={tool.dataScopes} />
      <List title="司法辖区" items={tool.jurisdictions} />
      <p className="mt-double border-t border-brand/15 pt-double text-xs leading-relaxed text-low">
        未向客户端公开 endpoint、credential_ref、远端 Schema
        或调用参数；页面也没有连接测试和执行入口。
      </p>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-base grid gap-half border-b border-brand/10 pb-base sm:grid-cols-[100px_1fr]">
      <span className="text-xs text-low">{label}</span>
      <span className="break-all font-mono text-xs text-normal">{value}</span>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mt-double">
      <h3 className="text-xs text-brand">{title}</h3>
      <div className="mt-base flex flex-wrap gap-half">
        {items.map((item) => (
          <Tag key={item}>{item}</Tag>
        ))}
      </div>
    </section>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="border border-brand/20 bg-brand/5 px-half py-half text-[9px] text-normal">
      {children}
    </span>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
      {children}
    </p>
  );
}
