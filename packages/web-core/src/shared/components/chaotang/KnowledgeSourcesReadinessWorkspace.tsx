import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  DatabaseIcon,
  GitBranchIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { useChaotangConnectors } from '@/shared/hooks/chaotang/useConnectors';
import { useJinyiweiSummary } from '@/shared/hooks/chaotang/useJinyiwei';
import { useShiguanStatistics } from '@/shared/hooks/chaotang/useShiguan';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

type GateState = 'available' | 'missing' | 'historical' | 'quarantined';

const STATE_META: Record<GateState, { label: string; className: string }> = {
  available: { label: 'AVAILABLE', className: 'text-success' },
  missing: { label: 'NOT_IMPLEMENTED', className: 'text-error' },
  historical: {
    label: 'HISTORICAL · REFERENCE_ONLY',
    className: 'text-low',
  },
  quarantined: { label: 'QUARANTINED', className: 'text-brand' },
};

export function KnowledgeSourcesReadinessWorkspace() {
  const { user, health } = useChaotangProvider();
  const connectors = useChaotangConnectors();
  const jinyiwei = useJinyiweiSummary();
  const shiguan = useShiguanStatistics();

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '知识事实源未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          知识来源必须由当前账户、代码批准目录与现行证据域共同核验。
        </p>
      </ChaotangPanel>
    );
  }

  if (connectors.isPending || jinyiwei.isPending || shiguan.isPending) {
    return (
      <div className="h-[560px] animate-pulse border border-brand/15 bg-panel/60" />
    );
  }

  if (connectors.isError || jinyiwei.isError || shiguan.isError) {
    return (
      <ChaotangPanel className="p-double text-center">
        <WarningIcon className="mx-auto size-7 text-error" weight="duotone" />
        <h2 className="chaotang-title mt-base text-xl text-error">
          知识来源准备度读取失败
        </h2>
        <p className="mt-base text-sm text-low">
          {connectors.error?.message ??
            jinyiwei.error?.message ??
            shiguan.error?.message}
        </p>
      </ChaotangPanel>
    );
  }

  return (
    <div className="space-y-double">
      <ChaotangPanel className="p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-brand/55">
              KNOWLEDGE SOURCE READINESS
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              知识来源准备度
            </h2>
            <p className="mt-base max-w-3xl text-sm leading-relaxed text-low">
              目标合同严格采用 Source → Version → Chunk → Span → Citation。
              当前只核验来源治理基础，不开放上传、摄取、通用搜索或模型检索。
            </p>
          </div>
          <span className="border border-brand/30 bg-brand/10 px-base py-half text-[9px] tracking-[0.14em] text-brand">
            PLANNED · INGEST_DISABLED
          </span>
        </div>

        <div className="mt-double grid gap-base sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="代码批准连接器"
            value={String(connectors.data.total)}
          />
          <Metric
            label="已启用连接器"
            value={String(connectors.data.enabledCount)}
          />
          <Metric
            label="锦衣卫独立证据"
            value={String(jinyiwei.data.distinctEvidenceCount)}
          />
          <Metric label="史馆档案" value={String(shiguan.data.total)} />
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[1.18fr_0.82fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <DatabaseIcon className="size-5 text-brand" weight="duotone" />
            <h3 className="chaotang-title text-lg text-high">来源治理门槛</h3>
          </div>
          <div className="mt-double space-y-half">
            <Gate
              title="代码批准连接器目录"
              state="available"
              detail={`当前可读取 ${connectors.data.total} 个受控连接器定义；目录不代表凭据已验证或远端已同步。`}
            />
            <Gate
              title="锦衣卫证据域"
              state="available"
              detail={`现有 ${jinyiwei.data.distinctEvidenceCount} 项独立证据，可保留来源尝试、冲突与失败关闭状态。`}
            />
            <Gate
              title="史馆只读召回"
              state="available"
              detail="owner-scoped 历史档案可作为优先证据来源；满足时效和事实槽位时不得联网。"
            />
            <Gate
              title="Source Registry"
              state="missing"
              detail="尚无统一登记所有权、许可证、PII、有效期、版本、digest 和撤回策略的现行接口。"
            />
            <Gate
              title="Version → Chunk → Span"
              state="missing"
              detail="当前没有可验证的版本化切片和原文 span 绑定，不能生成可靠 Citation。"
            />
            <Gate
              title="撤回与索引清除"
              state="missing"
              detail="尚无来源撤回后同步清除 chunk、索引、缓存与下游引用的闭环。"
            />
            <Gate
              title="旧 RAG / hybrid retrieval"
              state="historical"
              detail="只参考 chunk、ranking、query plan 与失败关闭思路；旧数据库和伪 citation 不得迁入。"
            />
            <Gate
              title="CourtOS-Brain / Super Brain"
              state="quarantined"
              detail="仅允许将通过治理审查的内容白名单导入；不得连接主线状态、认证、任务或归档。"
            />
          </div>
        </ChaotangPanel>

        <div className="flex flex-col gap-double">
          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <GitBranchIcon className="size-5 text-brand" weight="duotone" />
              <h3 className="chaotang-title text-lg text-high">目标数据链</h3>
            </div>
            <div className="mt-double flex flex-wrap gap-half">
              {['Source', 'Version', 'Chunk', 'Span', 'Citation'].map(
                (item, index) => (
                  <div key={item} className="flex items-center gap-half">
                    {index > 0 && <span className="text-low">→</span>}
                    <code className="border border-brand/20 bg-brand/5 px-half py-half text-[9px] text-normal">
                      {item}
                    </code>
                  </div>
                )
              )}
            </div>
            <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
              <li>每条 Citation 必须绑定来源版本和精确 span。</li>
              <li>每次摄取保留 owner、时间、digest 和治理决定。</li>
              <li>检索失败必须关闭，不能静默切换 provider。</li>
            </ul>
          </ChaotangPanel>

          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <LockKeyIcon className="size-5 text-error" weight="duotone" />
              <h3 className="chaotang-title text-lg text-high">禁止伪成功</h3>
            </div>
            <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
              <li>连接器存在 ≠ 来源可用或数据已同步。</li>
              <li>内容摘要 ≠ 可验证 Citation span。</li>
              <li>零向量或本地 fallback 不得伪装检索成功。</li>
              <li>通用搜索结果不得直接冒充证据。</li>
              <li>未完成治理的语料不得被模型检索或写入报告。</li>
            </ul>
          </ChaotangPanel>

          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <ShieldCheckIcon
                className="size-5 text-success"
                weight="duotone"
              />
              <h3 className="chaotang-title text-lg text-high">接入顺序</h3>
            </div>
            <ol className="mt-double space-y-base text-xs leading-relaxed text-low">
              <li>1. 建立 Source Registry 与 owner/许可证治理。</li>
              <li>2. 固化版本、digest、有效期和撤回合同。</li>
              <li>3. 实现 Chunk、Span 与 Citation 强绑定。</li>
              <li>4. 完成隔离、投毒、PII、删除与撤回负测。</li>
              <li>5. 最后按来源逐项开放检索，不开放通用 fallback。</li>
            </ol>
            <ChaotangButton
              className="mt-double"
              onClick={() =>
                void Promise.all([
                  connectors.refetch(),
                  jinyiwei.refetch(),
                  shiguan.refetch(),
                ])
              }
              disabled={
                connectors.isFetching ||
                jinyiwei.isFetching ||
                shiguan.isFetching
              }
            >
              <ArrowsClockwiseIcon
                className={cn(
                  'size-4',
                  (connectors.isFetching ||
                    jinyiwei.isFetching ||
                    shiguan.isFetching) &&
                    'animate-spin'
                )}
              />
              重新核验准备度
            </ChaotangButton>
          </ChaotangPanel>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-brand/15 bg-primary/40 p-base">
      <p className="text-xs text-low">{label}</p>
      <p className="chaotang-title mt-base text-2xl text-high">{value}</p>
    </div>
  );
}

function Gate({
  title,
  state,
  detail,
}: {
  title: string;
  state: GateState;
  detail: string;
}) {
  const meta = STATE_META[state];
  const Icon =
    state === 'available'
      ? CheckCircleIcon
      : state === 'historical'
        ? ClockCounterClockwiseIcon
        : state === 'quarantined'
          ? LockKeyIcon
          : DatabaseIcon;
  return (
    <div className="border border-brand/15 bg-primary/30 p-base">
      <div className="flex flex-wrap items-center justify-between gap-half">
        <div className="flex items-center gap-half">
          <Icon className={cn('size-4', meta.className)} weight="duotone" />
          <p className="text-sm text-normal">{title}</p>
        </div>
        <span className={cn('text-[9px] tracking-[0.12em]', meta.className)}>
          {meta.label}
        </span>
      </div>
      <p className="mt-half text-xs leading-relaxed text-low">{detail}</p>
    </div>
  );
}
