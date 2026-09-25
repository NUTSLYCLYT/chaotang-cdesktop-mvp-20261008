import { useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwiseIcon,
  BookOpenTextIcon,
  ClockIcon,
  ScrollIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  useShiguanArchive,
  useShiguanArchives,
  useShiguanStatistics,
} from '@/shared/hooks/chaotang/useShiguan';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

export function PendingReviewWorkspace() {
  const { user, health } = useChaotangProvider();
  const archives = useShiguanArchives();
  const statistics = useShiguanStatistics();
  const [selectedId, setSelectedId] = useState<string>();
  const detail = useShiguanArchive(selectedId);

  const pending = useMemo(
    () =>
      archives.data?.filter((archive) => archive.reviewStatus === null) ?? [],
    [archives.data]
  );

  useEffect(() => {
    if (selectedId && !pending.some((archive) => archive.id === selectedId)) {
      setSelectedId(undefined);
    }
  }, [pending, selectedId]);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '史馆服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          待复盘事项来自当前账户的史馆档案，不跨账户汇总。
        </p>
      </ChaotangPanel>
    );
  }

  if (archives.isPending || statistics.isPending) {
    return (
      <div className="grid animate-pulse gap-double xl:grid-cols-[0.85fr_1.3fr]">
        <div className="h-[520px] border border-brand/15 bg-panel/60" />
        <div className="h-[520px] border border-brand/15 bg-panel/60" />
      </div>
    );
  }

  if (archives.isError || statistics.isError) {
    const message = archives.isError
      ? archives.error.message
      : statistics.error?.message;
    return (
      <ChaotangPanel className="p-double text-center">
        <WarningIcon className="mx-auto size-7 text-error" weight="duotone" />
        <h2 className="chaotang-title mt-base text-xl text-error">
          待复盘事项读取失败
        </h2>
        <p className="mt-base text-sm text-low">{message}</p>
        <ChaotangButton
          className="mt-double"
          onClick={() =>
            void Promise.all([archives.refetch(), statistics.refetch()])
          }
        >
          <ArrowsClockwiseIcon className="size-4" />
          重新读取
        </ChaotangButton>
      </ChaotangPanel>
    );
  }

  const stats = statistics.data;

  return (
    <div className="space-y-double">
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="待复盘" value={stats.pendingReview} emphasis />
        <Metric label="当前批次可见" value={pending.length} />
        <Metric label="已达成" value={stats.achieved} />
        <Metric label="未达成" value={stats.notAchieved} />
        <Metric label="部分达成" value={stats.partial} />
        <Metric label="观察中" value={stats.observing} />
      </div>

      <ChaotangPanel className="p-base">
        <div className="flex items-start gap-base">
          <ShieldCheckIcon
            className="mt-half size-5 shrink-0 text-success"
            weight="duotone"
          />
          <div>
            <p className="text-sm text-high">严格待复盘判定</p>
            <p className="mt-half text-xs leading-relaxed text-low">
              只有史馆返回的复盘状态为空时才进入本页。顶部“待复盘”来自全账户统计；列表是档案接口当前返回的最多
              50 条记录中的待复盘项。
            </p>
          </div>
          <ChaotangButton
            className="ml-auto shrink-0"
            onClick={() =>
              void Promise.all([archives.refetch(), statistics.refetch()])
            }
            disabled={archives.isFetching || statistics.isFetching}
          >
            <ArrowsClockwiseIcon
              className={cn(
                'size-4',
                (archives.isFetching || statistics.isFetching) && 'animate-spin'
              )}
            />
            重新读取
          </ChaotangButton>
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[0.85fr_1.3fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base border-b border-brand/15 pb-double">
            <BookOpenTextIcon className="size-5 text-brand" weight="duotone" />
            <div>
              <h2 className="chaotang-title text-lg text-high">待复盘档案</h2>
              <p className="mt-half text-[10px] text-low">
                当前批次 {pending.length} 项
              </p>
            </div>
          </div>

          {pending.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <ShieldCheckIcon
                className="size-8 text-success/70"
                weight="duotone"
              />
              <p className="mt-base text-sm text-high">
                当前批次没有待复盘档案
              </p>
              <p className="mt-half text-xs text-low">
                这是史馆接口返回后的真实筛选结果
              </p>
            </div>
          ) : (
            <div className="mt-double max-h-[560px] space-y-half overflow-y-auto pr-half">
              {pending.map((archive) => (
                <button
                  key={archive.id}
                  type="button"
                  onClick={() => setSelectedId(archive.id)}
                  className={cn(
                    'w-full border p-base text-left transition-colors',
                    selectedId === archive.id
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <div className="flex items-start justify-between gap-base">
                    <span className="line-clamp-2 text-sm text-high">
                      {archive.title}
                    </span>
                    <span className="shrink-0 text-[9px] text-brand">
                      {archive.archiveType === 'MEMORIAL' ? '奏折' : '回奏'}
                    </span>
                  </div>
                  <p className="mt-half text-[10px] text-low">
                    {archive.department} · {archive.matterType}
                  </p>
                  <p className="mt-base flex items-center gap-half text-[9px] text-low">
                    <ClockIcon className="size-3" />
                    {new Date(archive.createdAt).toLocaleString('zh-CN')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          {!selectedId ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <ScrollIcon className="size-8 text-brand/45" weight="duotone" />
              <p className="mt-base text-sm text-low">
                选择一份待复盘档案查看事实内容
              </p>
            </div>
          ) : detail.isPending ? (
            <div className="h-80 animate-pulse bg-brand/5" />
          ) : detail.isError ? (
            <div className="text-center">
              <p className="text-sm text-error">{detail.error.message}</p>
              <ChaotangButton
                className="mt-double"
                onClick={() => void detail.refetch()}
              >
                重新读取详情
              </ChaotangButton>
            </div>
          ) : (
            <article>
              <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-brand/55">
                    {detail.data.archiveType} · REVIEW REQUIRED
                  </p>
                  <h2 className="chaotang-title mt-half text-2xl text-high">
                    {detail.data.title}
                  </h2>
                </div>
                <span className="border border-brand/30 bg-brand/10 px-base py-half text-[9px] text-brand">
                  待复盘
                </span>
              </div>

              <p className="mt-double whitespace-pre-wrap text-sm leading-7 text-normal">
                {detail.data.content}
              </p>

              {detail.data.replyConclusion && (
                <section className="mt-double border-l border-brand/45 bg-brand/5 p-base">
                  <p className="text-[10px] text-brand">回奏结论</p>
                  <p className="mt-half text-sm leading-relaxed text-normal">
                    {detail.data.replyConclusion}
                  </p>
                </section>
              )}

              <div className="mt-double grid gap-base border-t border-brand/15 pt-double text-xs sm:grid-cols-2">
                <Field label="部门" value={detail.data.department} />
                <Field label="事项类型" value={detail.data.matterType} />
                <Field label="回奏人" value={detail.data.respondent ?? '无'} />
                <Field
                  label="来源状态"
                  value={detail.data.sourceKind ?? '无正式来源关联'}
                />
              </div>

              <div className="mt-double border-t border-brand/15 pt-double">
                <p className="text-xs leading-relaxed text-low">
                  当前客户端尚未接入复盘写入接口，不能提交
                  Outcome、备注或处置决定。
                </p>
                <div className="mt-base flex flex-wrap gap-base">
                  <ChaotangButton
                    variant="primary"
                    disabled
                    title="复盘写入接口尚未接入客户端"
                  >
                    记录复盘
                  </ChaotangButton>
                  <ChaotangButton disabled title="处置写入接口尚未接入客户端">
                    更新处置
                  </ChaotangButton>
                </div>
              </div>
            </article>
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <ChaotangPanel className="p-base">
      <p className="text-xs text-low">{label}</p>
      <p
        className={cn(
          'chaotang-title mt-half text-2xl',
          emphasis ? 'text-brand' : 'text-high'
        )}
      >
        {value}
      </p>
    </ChaotangPanel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-low">
      {label}：<span className="text-normal">{value}</span>
    </p>
  );
}
