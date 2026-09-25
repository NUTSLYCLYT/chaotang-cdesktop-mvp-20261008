import { useEffect, useState, type FormEvent } from 'react';
import {
  BookOpenTextIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ScrollIcon,
} from '@phosphor-icons/react';
import {
  useShiguanArchive,
  useShiguanArchives,
  useShiguanRecall,
  useShiguanStatistics,
} from '@/shared/hooks/chaotang/useShiguan';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import type { ShiguanArchiveType } from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

export function ShiguanWorkspace({ mode }: { mode: 'archives' | 'recall' }) {
  const { user, health } = useChaotangProvider();
  const [archiveType, setArchiveType] = useState<ShiguanArchiveType>();
  const archives = useShiguanArchives(archiveType);
  const statistics = useShiguanStatistics();
  const [selectedId, setSelectedId] = useState<string>();
  const detail = useShiguanArchive(selectedId);
  const recall = useShiguanRecall();
  const [matterType, setMatterType] = useState('');
  const [department, setDepartment] = useState('');

  useEffect(() => {
    if (selectedId && !archives.data?.some((item) => item.id === selectedId)) {
      setSelectedId(undefined);
    }
  }, [archives.data, selectedId]);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '史馆服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          史馆严格按当前账户隔离，只显示属于当前用户的档案。
        </p>
      </ChaotangPanel>
    );
  }

  if (mode === 'recall') {
    const submitRecall = (event: FormEvent) => {
      event.preventDefault();
      recall.mutate({ matterType, department, limit: 10 });
    };
    return (
      <div className="grid gap-double xl:grid-cols-[0.8fr_1.35fr]">
        <ChaotangPanel className="p-double">
          <p className="text-[9px] tracking-[0.24em] text-brand/55">
            HISTORICAL RECALL
          </p>
          <h2 className="chaotang-title mt-base text-2xl text-high">
            相似旧案召回
          </h2>
          <p className="mt-base text-xs leading-relaxed text-low">
            至少填写事项类型或部门。召回只读取当前账户档案，不触发模型或外部网络。
          </p>
          <form onSubmit={submitRecall} className="mt-double space-y-base">
            <input
              value={matterType}
              onChange={(event) => setMatterType(event.target.value)}
              placeholder="事项类型，例如：月度核算"
              className="w-full border border-brand/20 bg-primary/55 px-base py-base text-sm text-normal outline-none placeholder:text-low focus:border-brand/55"
            />
            <input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="部门，例如：户部"
              className="w-full border border-brand/20 bg-primary/55 px-base py-base text-sm text-normal outline-none placeholder:text-low focus:border-brand/55"
            />
            <ChaotangButton
              variant="primary"
              disabled={
                recall.isPending || (!matterType.trim() && !department.trim())
              }
            >
              <MagnifyingGlassIcon className="size-4" />
              {recall.isPending ? '召回中…' : '发起召回'}
            </ChaotangButton>
          </form>
          {recall.isError && (
            <p className="mt-base text-xs text-error">{recall.error.message}</p>
          )}
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-lg text-high">召回结果</h2>
          {!recall.data ? (
            <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
              填写条件后检索相似历史档案
            </p>
          ) : recall.data.length === 0 ? (
            <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
              未找到符合条件的旧案
            </p>
          ) : (
            <div className="mt-double space-y-base">
              {recall.data.map((item) => (
                <article
                  key={item.archiveId}
                  className="border border-brand/15 bg-primary/45 p-base"
                >
                  <div className="flex justify-between gap-base">
                    <span className="text-xs text-brand">
                      {item.matchReason}
                    </span>
                    <span className="font-mono text-[9px] text-low">
                      {item.archiveId}
                    </span>
                  </div>
                  <p className="mt-base text-sm leading-relaxed text-normal">
                    {item.historicalConclusion}
                  </p>
                  {item.lessonsLearned && (
                    <p className="mt-base text-xs text-low">
                      所得经验：{item.lessonsLearned}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </ChaotangPanel>
      </div>
    );
  }

  return (
    <div className="space-y-double">
      <div className="grid grid-cols-2 border border-brand/20 bg-secondary/85 lg:grid-cols-5">
        {[
          ['档案总数', statistics.data?.total ?? '—'],
          ['待复盘', statistics.data?.pendingReview ?? '—'],
          ['已达成', statistics.data?.achieved ?? '—'],
          ['部分达成', statistics.data?.partial ?? '—'],
          [
            '达成率',
            statistics.data?.successRate == null
              ? '—'
              : `${Math.round(statistics.data.successRate * 100)}%`,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-b border-r border-brand/15 p-base last:border-r-0 lg:border-b-0"
          >
            <p className="text-xs text-low">{label}</p>
            <p className="chaotang-title mt-half text-2xl text-brand">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-double xl:grid-cols-[0.85fr_1.3fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center justify-between gap-base">
            <div className="flex items-center gap-base">
              <BookOpenTextIcon className="size-5 text-brand" />
              <h2 className="chaotang-title text-lg text-high">史馆档案</h2>
            </div>
            <div className="flex gap-half">
              {[
                [undefined, '全部'],
                ['MEMORIAL', '奏折'],
                ['REPLY', '回奏'],
              ].map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setArchiveType(value as ShiguanArchiveType)}
                  className={cn(
                    'border px-base py-half text-[10px]',
                    archiveType === value
                      ? 'border-brand/45 bg-brand/10 text-brand'
                      : 'border-brand/15 text-low'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {archives.isPending ? (
            <div className="mt-double h-64 animate-pulse bg-brand/5" />
          ) : archives.isError ? (
            <p className="mt-double text-sm text-error">
              {archives.error.message}
            </p>
          ) : archives.data.length === 0 ? (
            <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
              当前账户没有此类档案
            </p>
          ) : (
            <div className="relative mt-double max-h-[560px] space-y-half overflow-y-auto border-l border-brand/20 pl-base pr-half">
              {archives.data.map((archive) => (
                <button
                  key={archive.id}
                  type="button"
                  onClick={() => setSelectedId(archive.id)}
                  className={cn(
                    'relative w-full border p-base text-left transition-colors before:absolute before:-left-[21px] before:top-5 before:size-2 before:rounded-full before:border before:border-brand/50 before:bg-secondary',
                    selectedId === archive.id
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <div className="flex items-center justify-between gap-base">
                    <span className="truncate text-sm text-high">
                      {archive.title}
                    </span>
                    <span className="text-[9px] text-brand">
                      {archive.archiveType === 'MEMORIAL' ? '奏折' : '回奏'}
                    </span>
                  </div>
                  <p className="mt-half text-[10px] text-low">
                    {archive.department} · {archive.matterType}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>

        <section className="border border-[#bda65d]/55 bg-[#e9e2cc] p-1 text-[#272116] shadow-[0_20px_65px_rgba(0,0,0,0.38)]">
          <div className="h-full border border-[#9b8140]/35 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.72),transparent_42%),linear-gradient(135deg,#eee9d9,#dcd3bb)] p-double sm:p-8">
            {!selectedId ? (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <ScrollIcon
                  className="size-8 text-[#8f6f2a]"
                  weight="duotone"
                />
                <p className="mt-base text-sm text-[#786f5d]">
                  选择一份档案查看详情
                </p>
              </div>
            ) : detail.isPending ? (
              <div className="h-72 animate-pulse bg-brand/5" />
            ) : detail.isError ? (
              <p className="text-sm text-[#9a372b]">{detail.error.message}</p>
            ) : (
              <article>
                <div className="flex flex-wrap items-start justify-between gap-base border-b border-[#9b8140]/30 pb-double">
                  <div>
                    <p className="text-[9px] tracking-[0.2em] text-[#8f6f2a]">
                      {detail.data.archiveType}
                    </p>
                    <h2 className="chaotang-title mt-half text-2xl text-[#272116]">
                      {detail.data.title}
                    </h2>
                  </div>
                  <span className="flex items-center gap-half text-[10px] text-[#786f5d]">
                    <ClockIcon className="size-3" />
                    {new Date(detail.data.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <p className="mt-double whitespace-pre-wrap text-sm leading-7 text-[#312a1e]">
                  {detail.data.content}
                </p>
                {detail.data.replyConclusion && (
                  <div className="mt-double border-l border-[#9a372b] bg-white/20 p-base">
                    <p className="text-[10px] text-[#9a372b]">回奏结论</p>
                    <p className="mt-half text-sm leading-relaxed text-[#312a1e]">
                      {detail.data.replyConclusion}
                    </p>
                  </div>
                )}
                <div className="mt-double grid gap-base border-t border-[#9b8140]/30 pt-double text-xs sm:grid-cols-2">
                  <p className="text-[#786f5d]">
                    部门：
                    <span className="text-[#312a1e]">
                      {detail.data.department}
                    </span>
                  </p>
                  <p className="text-[#786f5d]">
                    事项：
                    <span className="text-[#312a1e]">
                      {detail.data.matterType}
                    </span>
                  </p>
                  <p className="text-[#786f5d]">
                    复盘：
                    <span className="text-[#312a1e]">
                      {detail.data.reviewStatus?.status ?? '待复盘'}
                    </span>
                  </p>
                  <p className="text-[#786f5d]">
                    回奏人：
                    <span className="text-[#312a1e]">
                      {detail.data.respondent ?? '—'}
                    </span>
                  </p>
                </div>
              </article>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
