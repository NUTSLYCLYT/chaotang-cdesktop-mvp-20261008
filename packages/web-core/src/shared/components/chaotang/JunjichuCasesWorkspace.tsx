import { useEffect, useState } from 'react';
import {
  ArrowsClockwiseIcon,
  BuildingsIcon,
  CheckCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  useCaseReply,
  useJunjichuCase,
  useJunjichuCases,
} from '@/shared/hooks/chaotang/useJunjichuCases';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  MINISTRY_REVIEWING: '六部办理中',
  COUNCIL_REVIEWING: '军机会审中',
  CHANCELLOR_FINALIZING: '丞相裁定中',
  ARCHIVED: '已回奏归档',
  FAILED: '办理失败',
};

export function JunjichuCasesWorkspace() {
  const { user, health } = useChaotangProvider();
  const cases = useJunjichuCases();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = useJunjichuCase(selectedId);
  const reply = useCaseReply(selected.data?.replyId);

  useEffect(() => {
    if (!selectedId && cases.data?.[0]) setSelectedId(cases.data[0].id);
  }, [cases.data, selectedId]);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center text-sm text-low">
        {!user ? '请先登录朝堂账户' : '朝堂后端未连接'}
      </ChaotangPanel>
    );
  }

  if (cases.isPending) {
    return (
      <ChaotangPanel className="h-[520px] animate-pulse bg-panel/60">
        <span className="sr-only">正在读取军机处案卷</span>
      </ChaotangPanel>
    );
  }

  if (cases.isError) {
    return (
      <ChaotangPanel className="p-double text-center">
        <WarningIcon className="mx-auto size-7 text-error" />
        <p className="mt-base text-sm text-error">{cases.error.message}</p>
        <ChaotangButton
          className="mt-base"
          onClick={() => void cases.refetch()}
        >
          重新读取
        </ChaotangButton>
      </ChaotangPanel>
    );
  }

  return (
    <div className="space-y-double">
      <div className="grid grid-cols-2 border border-brand/20 bg-secondary/85 lg:grid-cols-5">
        <CaseMetric label="案卷总数" value={cases.data.length} />
        <CaseMetric
          label="六部办理"
          value={countCases(cases.data, 'MINISTRY_REVIEWING')}
        />
        <CaseMetric
          label="军机会审"
          value={countCases(cases.data, 'COUNCIL_REVIEWING')}
        />
        <CaseMetric
          label="丞相裁定"
          value={countCases(cases.data, 'CHANCELLOR_FINALIZING')}
        />
        <CaseMetric label="已回奏" value={countCases(cases.data, 'ARCHIVED')} />
      </div>
      <div className="grid gap-double xl:grid-cols-[0.72fr_1.5fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base border-b border-brand/15 pb-double">
            <BuildingsIcon className="size-5 text-brand" weight="duotone" />
            <h2 className="chaotang-title text-xl text-high">军机处案卷</h2>
            <ChaotangButton
              className="ml-auto"
              disabled={cases.isFetching}
              onClick={() => void cases.refetch()}
            >
              <ArrowsClockwiseIcon
                className={cn('size-4', cases.isFetching && 'animate-spin')}
              />
            </ChaotangButton>
          </div>
          {!cases.data.length ? (
            <p className="py-20 text-center text-sm text-[#786f5d]">
              当前账户尚无 multi 路径案卷
            </p>
          ) : (
            <div className="mt-double max-h-[620px] space-y-half overflow-y-auto">
              {cases.data.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'w-full border p-base text-left',
                    selectedId === item.id
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <div className="flex justify-between gap-base">
                    <code className="truncate text-[10px] text-normal">
                      {item.id}
                    </code>
                    <span className="shrink-0 text-[9px] text-brand">
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </div>
                  <p className="mt-base line-clamp-2 text-xs leading-relaxed text-low">
                    {item.decreeText}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>

        <section className="border border-[#bda65d]/55 bg-[#e9e2cc] p-1 text-[#272116] shadow-[0_20px_65px_rgba(0,0,0,0.38)]">
          <div className="h-full border border-[#9b8140]/35 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.7),transparent_42%),linear-gradient(135deg,#eee9d9,#dcd3bb)] p-double sm:p-8">
            {!selectedId ? (
              <p className="py-20 text-center text-sm text-low">
                选择案卷查看办理链
              </p>
            ) : selected.isPending ? (
              <div className="h-72 animate-pulse bg-primary/35" />
            ) : selected.isError ? (
              <p className="text-sm text-[#9a372b]">{selected.error.message}</p>
            ) : selected.data ? (
              <article>
                <div className="border-b border-[#9b8140]/30 pb-double">
                  <p className="text-[9px] tracking-[0.2em] text-[#8f6f2a]">
                    COUNCIL CASE · LIVE
                  </p>
                  <div className="mt-half flex flex-wrap items-center gap-base">
                    <h2 className="chaotang-title text-xl text-[#272116]">
                      案卷办理链
                    </h2>
                    <span className="text-xs text-[#9a372b]">
                      {STATUS_LABELS[selected.data.status] ??
                        selected.data.status}
                    </span>
                  </div>
                  <p className="mt-base whitespace-pre-wrap text-sm leading-7 text-[#312a1e]">
                    {selected.data.decreeText}
                  </p>
                </div>

                <CaseProgress status={selected.data.status} />

                <section className="mt-double">
                  <h3 className="chaotang-title text-base text-[#272116]">
                    批准路径
                  </h3>
                  <div className="mt-base flex flex-wrap gap-half">
                    {selected.data.processingPath.map((step, index) => (
                      <span
                        key={`${step}-${index}`}
                        className="border border-[#9b8140]/35 bg-white/20 px-base py-half text-xs text-[#4d422d]"
                      >
                        {index + 1}. {step}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="mt-double space-y-base">
                  <h3 className="chaotang-title text-base text-[#272116]">
                    司议与部议
                  </h3>
                  {selected.data.completedMinistryOpinions.length ? (
                    selected.data.completedMinistryOpinions.map((ministry) => (
                      <div
                        key={ministry.department}
                        className="border border-[#9b8140]/30 bg-white/20 p-base"
                      >
                        <p className="text-sm text-[#8f6f2a]">
                          {ministry.department}
                        </p>
                        {ministry.bureauOpinions.map((bureau) => (
                          <p
                            key={bureau.bureau}
                            className="mt-base text-xs leading-relaxed text-[#665d4c]"
                          >
                            {bureau.bureau}：{bureau.opinion}
                          </p>
                        ))}
                        <p className="mt-base border-t border-[#9b8140]/20 pt-base text-sm leading-7 text-[#312a1e]">
                          部议：{ministry.opinion}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[#786f5d]">
                      尚未形成已完成部议。
                    </p>
                  )}
                </section>

                {selected.data.councilVerdict && (
                  <section className="mt-double border border-[#9b8140]/35 bg-white/25 p-base">
                    <p className="text-xs text-[#8f6f2a]">军机处会审结论</p>
                    <p className="mt-base whitespace-pre-wrap text-sm leading-7 text-[#312a1e]">
                      {selected.data.councilVerdict}
                    </p>
                  </section>
                )}

                {selected.data.failureReason && (
                  <p className="mt-double border border-error/25 bg-error/5 p-base text-xs text-error">
                    {selected.data.failureReason}
                  </p>
                )}

                {selected.data.replyId && (
                  <section className="mt-double border border-[#71814f]/45 bg-[#71814f]/10 p-base">
                    <div className="flex items-center gap-base text-success">
                      <CheckCircleIcon className="size-5" weight="duotone" />
                      <h3 className="chaotang-title text-base">
                        最终回奏 · 史馆归档
                      </h3>
                    </div>
                    {reply.isPending ? (
                      <p className="mt-base text-xs text-low">
                        正在读取唯一 REPLY…
                      </p>
                    ) : reply.isError ? (
                      <p className="mt-base text-xs text-error">
                        {reply.error.message}
                      </p>
                    ) : reply.data ? (
                      <div className="mt-base">
                        <p className="text-sm text-[#272116]">
                          {reply.data.title}
                        </p>
                        <p className="mt-base whitespace-pre-wrap text-sm leading-7 text-[#312a1e]">
                          {reply.data.content}
                        </p>
                        {reply.data.replyConclusion && (
                          <p className="mt-base border-t border-[#71814f]/25 pt-base text-xs text-[#665d4c]">
                            结论：{reply.data.replyConclusion}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </section>
                )}
              </article>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function countCases(items: Array<{ status: string }>, status: string) {
  return items.filter((item) => item.status === status).length;
}

function CaseMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-r border-brand/15 p-base last:border-r-0 lg:border-b-0">
      <p className="text-[9px] text-low">{label}</p>
      <p className="chaotang-title mt-half text-xl text-brand">{value}</p>
    </div>
  );
}

function CaseProgress({ status }: { status: string }) {
  const order = [
    'MINISTRY_REVIEWING',
    'COUNCIL_REVIEWING',
    'CHANCELLOR_FINALIZING',
    'ARCHIVED',
  ];
  const current = status === 'FAILED' ? -1 : order.indexOf(status);
  return (
    <div className="mt-double grid grid-cols-4 border border-[#9b8140]/30">
      {['六部办理', '军机会审', '丞相裁定', '回奏归档'].map((label, index) => (
        <div
          key={label}
          className={`border-r border-[#9b8140]/25 p-base text-center text-[10px] last:border-r-0 ${status === 'FAILED' ? 'text-[#9a372b]' : index < current ? 'text-[#5f7142]' : index === current ? 'bg-[#d8bd69]/30 text-[#7b5d1d]' : 'text-[#8a806c]'}`}
        >
          {index < current ? '✓ ' : ''}
          {label}
        </div>
      ))}
    </div>
  );
}
