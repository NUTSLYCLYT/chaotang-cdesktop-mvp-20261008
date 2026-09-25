import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircleIcon,
  FilesIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  useJinyiweiInvestigation,
  useJinyiweiInvestigations,
  useJinyiweiSummary,
} from '@/shared/hooks/chaotang/useJinyiwei';
import {
  useChaotangProvider,
  type JinyiweiEvidence,
  type JinyiweiInvestigationStatus,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const STATUS_LABEL: Record<JinyiweiInvestigationStatus, string> = {
  RESOLVED: '已查明',
  PARTIAL: '部分查明',
  BLOCKED: '受阻',
  UNAVAILABLE: '不可得',
};

const FILTERS: Array<{
  value?: JinyiweiInvestigationStatus;
  label: string;
}> = [
  { label: '全部' },
  { value: 'RESOLVED', label: '已查明' },
  { value: 'PARTIAL', label: '部分查明' },
  { value: 'BLOCKED', label: '受阻' },
  { value: 'UNAVAILABLE', label: '不可得' },
];

export function JinyiweiWorkspace() {
  const { user, health } = useChaotangProvider();
  const [status, setStatus] = useState<JinyiweiInvestigationStatus>();
  const [selectedId, setSelectedId] = useState<string>();
  const summary = useJinyiweiSummary();
  const investigations = useJinyiweiInvestigations(status);
  const detail = useJinyiweiInvestigation(selectedId);

  useEffect(() => {
    if (
      selectedId &&
      investigations.data &&
      !investigations.data.items.some(
        (item) => item.investigationId === selectedId
      )
    ) {
      setSelectedId(undefined);
    }
  }, [investigations.data, selectedId]);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '锦衣卫档案服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          调查、证据与采纳记录严格按当前账户隔离。
        </p>
      </ChaotangPanel>
    );
  }

  if (summary.isPending || investigations.isPending) {
    return (
      <div className="h-96 animate-pulse border border-brand/15 bg-panel/60" />
    );
  }

  if (summary.isError || investigations.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {summary.error?.message ?? investigations.error?.message}
      </ChaotangPanel>
    );
  }

  return (
    <div className="space-y-double">
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '调查总数', value: summary.data.totalInvestigations },
          { label: '已查明', value: summary.data.resolvedCount },
          { label: '独立证据', value: summary.data.distinctEvidenceCount },
          {
            label: '待确认采纳',
            value: summary.data.pendingAdoptionCount,
          },
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
            className="mt-half size-5 text-success"
            weight="duotone"
          />
          <div>
            <p className="text-sm text-high">只读调查档案</p>
            <p className="mt-half text-xs leading-relaxed text-low">
              此页只读取已完成的调查、来源尝试与证据包；不会发起调查、调用
              MCP、访问外部网络或确认证据采纳。
            </p>
          </div>
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[0.82fr_1.35fr]">
        <ChaotangPanel className="p-double">
          <div className="flex flex-wrap items-center justify-between gap-base">
            <h2 className="chaotang-title text-lg text-high">调查档案</h2>
            <span className="text-xs text-low">
              {investigations.data.total} 项
            </span>
          </div>
          <div className="mt-base flex flex-wrap gap-half">
            {FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => setStatus(filter.value)}
                className={cn(
                  'border px-base py-half text-[10px] transition-colors',
                  status === filter.value
                    ? 'border-brand/45 bg-brand/10 text-brand'
                    : 'border-brand/15 text-low hover:border-brand/30 hover:text-normal'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {investigations.data.items.length === 0 ? (
            <EmptyState>当前筛选条件下没有调查档案</EmptyState>
          ) : (
            <div className="mt-double max-h-[650px] space-y-half overflow-y-auto">
              {investigations.data.items.map((item) => (
                <button
                  key={item.investigationId}
                  type="button"
                  onClick={() => setSelectedId(item.investigationId)}
                  className={cn(
                    'w-full border p-base text-left transition-colors',
                    selectedId === item.investigationId
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <div className="flex items-start justify-between gap-base">
                    <p className="line-clamp-2 text-sm leading-relaxed text-high">
                      {item.question}
                    </p>
                    <StatusTag status={item.status} />
                  </div>
                  <p className="mt-base text-[10px] text-low">
                    {item.requestingAgent} · 证据 {item.evidenceCount} ·
                    来源尝试 {item.sourceAttemptCount}
                  </p>
                  <p className="mt-half text-[10px] text-low">
                    {new Date(item.completedAt).toLocaleString('zh-CN')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          {!selectedId ? (
            <EmptyState>
              选择一项调查，查看事实槽位、证据、冲突与来源尝试
            </EmptyState>
          ) : detail.isPending ? (
            <div className="h-96 animate-pulse bg-brand/5" />
          ) : detail.isError ? (
            <p className="text-sm text-error">{detail.error.message}</p>
          ) : (
            <InvestigationDetailView detail={detail.data} />
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function InvestigationDetailView({
  detail,
}: {
  detail: NonNullable<ReturnType<typeof useJinyiweiInvestigation>['data']>;
}) {
  const evidenceGroups = useMemo(
    () => Object.entries(detail.evidenceByFact),
    [detail.evidenceByFact]
  );
  const requestQuestion =
    typeof detail.request.question === 'string'
      ? detail.request.question
      : detail.investigationId;

  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
        <div>
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            EVIDENCE PACK · {detail.packId}
          </p>
          <h2 className="chaotang-title mt-half text-2xl text-high">
            {requestQuestion}
          </h2>
        </div>
        <StatusTag status={detail.status} />
      </div>

      <div className="mt-double grid gap-base sm:grid-cols-3">
        <Metric label="已解析事实" value={detail.resolvedFacts.length} />
        <Metric label="未解析事实" value={detail.unresolvedFacts.length} />
        <Metric label="来源尝试" value={detail.sourceAttempts.length} />
      </div>

      {detail.unresolvedFacts.length > 0 && (
        <FactList title="未解析事实" items={detail.unresolvedFacts} danger />
      )}
      {detail.doNotInfer.length > 0 && (
        <FactList title="禁止推断" items={detail.doNotInfer} danger />
      )}

      <section className="mt-double">
        <div className="flex items-center gap-base">
          <FilesIcon className="size-5 text-brand" weight="duotone" />
          <h3 className="chaotang-title text-lg text-high">证据包</h3>
        </div>
        {evidenceGroups.length === 0 ? (
          <EmptyState>此调查没有可展示证据</EmptyState>
        ) : (
          <div className="mt-base space-y-double">
            {evidenceGroups.map(([factKey, evidence]) => (
              <div key={factKey}>
                <p className="border-l border-brand/45 pl-base text-xs text-brand">
                  {factKey}
                </p>
                <div className="mt-base space-y-base">
                  {evidence.map((item) => (
                    <EvidenceCard key={item.evidenceId} evidence={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-double grid gap-base border-t border-brand/15 pt-double text-xs sm:grid-cols-2">
        <p className="text-low">
          冲突记录：
          <span className="text-normal">{detail.conflicts.length}</span>
        </p>
        <p className="text-low">
          证据采纳：
          <span className="text-normal">{detail.adoptions.length}</span>
        </p>
      </div>
    </article>
  );
}

function EvidenceCard({ evidence }: { evidence: JinyiweiEvidence }) {
  const Icon = evidence.stance === 'SUPPORTS' ? CheckCircleIcon : WarningIcon;
  const value =
    typeof evidence.value === 'string'
      ? evidence.value
      : JSON.stringify(evidence.value);
  return (
    <div className="border border-brand/15 bg-primary/45 p-base">
      <div className="flex items-start gap-base">
        <Icon
          className={cn(
            'mt-half size-5 shrink-0',
            evidence.stance === 'SUPPORTS' ? 'text-success' : 'text-error'
          )}
          weight="duotone"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-base">
            <p className="text-sm text-high">{evidence.publisher}</p>
            <span className="text-[10px] text-brand">
              {evidence.quality} · {Math.round(evidence.confidence * 100)}%
            </span>
          </div>
          <p className="mt-base text-sm leading-relaxed text-normal">
            {evidence.excerpt}
          </p>
          <p className="mt-base break-words font-mono text-[10px] text-low">
            值：{value || '—'} {evidence.unit ?? ''}
          </p>
          <p className="mt-half break-all text-[10px] text-low">
            {evidence.sourceType} · {evidence.sourceUrl}
          </p>
          <p className="mt-half text-[10px] text-low">
            截止 {new Date(evidence.asOf).toLocaleString('zh-CN')}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: JinyiweiInvestigationStatus }) {
  return (
    <span
      className={cn(
        'shrink-0 border px-half py-half text-[9px]',
        status === 'RESOLVED'
          ? 'border-success/30 text-success'
          : status === 'PARTIAL'
            ? 'border-brand/30 text-brand'
            : 'border-error/30 text-error'
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-brand/15 bg-primary/35 p-base">
      <p className="text-[10px] text-low">{label}</p>
      <p className="chaotang-title mt-half text-xl text-brand">{value}</p>
    </div>
  );
}

function FactList({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: string[];
  danger?: boolean;
}) {
  return (
    <section className="mt-double">
      <h3 className={danger ? 'text-xs text-error' : 'text-xs text-brand'}>
        {title}
      </h3>
      <ul className="mt-base space-y-half text-xs leading-relaxed text-low">
        {items.map((item) => (
          <li key={item} className="border-l border-brand/25 pl-base">
            {item}
          </li>
        ))}
      </ul>
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
