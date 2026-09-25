import { useMemo, useState } from 'react';
import {
  FingerprintIcon,
  FunnelIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import {
  useAuditTrail,
  type AuditDomain,
  type ChaotangAuditEvent,
} from '@/shared/hooks/chaotang/useAuditTrail';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const ACTION_LABEL: Record<ChaotangAuditEvent['action'], string> = {
  INVESTIGATION_COMPLETED: '调查完成',
  WORK_PRODUCT_RECORDED: '成果登记',
};

export function AuditWorkspace() {
  const { user, health } = useChaotangProvider();
  const audit = useAuditTrail();
  const [domain, setDomain] = useState<AuditDomain>();
  const [selectedId, setSelectedId] = useState<string>();

  const visibleEvents = useMemo(
    () =>
      audit.data?.filter((event) => !domain || event.domain === domain) ?? [],
    [audit.data, domain]
  );
  const selected = audit.data?.find((event) => event.id === selectedId);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '审计数据源未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          审计投影严格按当前账户读取，不访问跨用户运行时内存。
        </p>
      </ChaotangPanel>
    );
  }
  if (audit.isPending) {
    return (
      <div className="h-96 animate-pulse border border-brand/15 bg-panel/60" />
    );
  }
  if (audit.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {audit.error.message}
      </ChaotangPanel>
    );
  }

  const investigationCount = audit.data.filter(
    (event) => event.domain === '锦衣卫'
  ).length;
  const productCount = audit.data.length - investigationCount;
  const pendingCount = audit.data.filter(
    (event) => event.result === 'PENDING' || event.result === 'PARTIAL'
  ).length;

  return (
    <div className="space-y-double">
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '可见审计事件', value: audit.data.length },
          { label: '锦衣卫调查', value: investigationCount },
          { label: '户部成果', value: productCount },
          { label: '待确认或部分完成', value: pendingCount },
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
            <p className="text-sm text-high">账户级只读审计投影</p>
            <p className="mt-half text-xs leading-relaxed text-low">
              当前汇总锦衣卫调查与户部成果两类持久化记录，不包含跨用户内存审计，也不冒充尚未接入的全系统审计账本。
            </p>
          </div>
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[0.9fr_1.25fr]">
        <ChaotangPanel className="p-double">
          <div className="flex flex-wrap items-center justify-between gap-base">
            <div className="flex items-center gap-base">
              <FunnelIcon className="size-5 text-brand" />
              <h2 className="chaotang-title text-lg text-high">审计流水</h2>
            </div>
            <span className="text-xs text-low">{visibleEvents.length} 项</span>
          </div>
          <div className="mt-base flex gap-half">
            {[
              { label: '全部', value: undefined },
              { label: '锦衣卫', value: '锦衣卫' as const },
              { label: '户部', value: '户部' as const },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setDomain(item.value)}
                className={cn(
                  'border px-base py-half text-[10px]',
                  domain === item.value
                    ? 'border-brand/45 bg-brand/10 text-brand'
                    : 'border-brand/15 text-low hover:border-brand/30'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {visibleEvents.length === 0 ? (
            <EmptyState>当前账户没有可展示的审计事件</EmptyState>
          ) : (
            <div className="mt-double max-h-[650px] space-y-half overflow-y-auto">
              {visibleEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedId(event.id)}
                  className={cn(
                    'w-full border p-base text-left',
                    selectedId === event.id
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <div className="flex items-center justify-between gap-base">
                    <span className="text-xs text-brand">{event.domain}</span>
                    <span className="text-[9px] text-low">{event.result}</span>
                  </div>
                  <p className="mt-base text-sm text-high">
                    {ACTION_LABEL[event.action]}
                  </p>
                  <p className="mt-half line-clamp-2 text-xs leading-relaxed text-low">
                    {event.summary}
                  </p>
                  <p className="mt-base text-[10px] text-low">
                    {new Date(event.occurredAt).toLocaleString('zh-CN')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          {!selected ? (
            <EmptyState>
              选择一条流水查看 actor、action、object 与 receipt
            </EmptyState>
          ) : (
            <article>
              <div className="flex items-start gap-base border-b border-brand/15 pb-double">
                <FingerprintIcon
                  className="mt-half size-6 shrink-0 text-brand"
                  weight="duotone"
                />
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-brand/55">
                    {selected.domain} · {selected.result}
                  </p>
                  <h2 className="chaotang-title mt-half text-2xl text-high">
                    {ACTION_LABEL[selected.action]}
                  </h2>
                </div>
              </div>
              <p className="mt-double text-sm leading-7 text-normal">
                {selected.summary}
              </p>
              <div className="mt-double space-y-base">
                <AuditField
                  label="actor"
                  value={selected.actor ?? '当前只读契约未公开'}
                />
                <AuditField label="action" value={selected.action} mono />
                <AuditField label="object" value={selected.objectRef} mono />
                <AuditField label="receipt" value={selected.receiptRef} mono />
                <AuditField
                  label="时间"
                  value={new Date(selected.occurredAt).toLocaleString('zh-CN')}
                />
                {selected.evidenceCount !== null && (
                  <AuditField
                    label="证据数量"
                    value={String(selected.evidenceCount)}
                  />
                )}
              </div>
              <p className="mt-double border-t border-brand/15 pt-double text-xs leading-relaxed text-low">
                本页面没有重放、删除、修改或导出凭据的能力。
              </p>
            </article>
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function AuditField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-half border-b border-brand/10 pb-base sm:grid-cols-[100px_1fr]">
      <span className="text-xs text-low">{label}</span>
      <span
        className={cn('break-all text-xs text-normal', mono && 'font-mono')}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
      {children}
    </p>
  );
}
