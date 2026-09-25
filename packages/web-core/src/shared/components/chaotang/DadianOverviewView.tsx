import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRightIcon,
  BuildingsIcon,
  ClockIcon,
  ScrollIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import type {
  ChaotangReadiness,
  DadianOverview,
  DailyMemorialLatest,
  DailyMemorialStatus,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';

const memorialStatusLabels: Record<DailyMemorialStatus, string> = {
  PENDING: '待生成',
  GENERATING: '编制中',
  READY_FOR_REVIEW: '待审阅',
  SKIPPED_NO_FACTS: '今日无可用事实',
  FAILED: '生成失败',
  CONFIRMED: '已确认归档',
};

export function DadianOverviewView({
  overview,
  readiness,
  dailyMemorial,
  readinessError,
  dailyMemorialError,
}: {
  overview: DadianOverview;
  readiness?: ChaotangReadiness;
  dailyMemorial?: DailyMemorialLatest | null;
  readinessError?: string;
  dailyMemorialError?: string;
}) {
  const navigate = useNavigate();
  const hasWork = overview.replyCount > 0 || overview.pendingReviewCount > 0;
  return (
    <div className="space-y-double">
      <div className="grid gap-base xl:grid-cols-[0.72fr_1.5fr_0.78fr]">
        <ChaotangPanel className="p-double">
          <p className="text-[9px] tracking-[0.22em] text-brand/55">
            TODAY & YOU
          </p>
          <h2 className="chaotang-title mt-half text-xl text-high">
            今日与你有关
          </h2>
          <div className="mt-double space-y-base">
            <FactCard
              label="你能得到"
              value={
                hasWork
                  ? '真实回奏、待复盘事项与唯一下一步'
                  : '建立第一项真实任务并持续追踪'
              }
            />
            <FactCard label="现在最值得做" value={overview.todayFocus} />
            <FactCard label="当前主责" value="丞相统筹 · 各部按批准路径承办" />
          </div>
          <ChaotangButton
            className="mt-double w-full"
            onClick={() => void navigate({ to: '/court' })}
          >
            进入上书房
            <ArrowRightIcon className="size-4" />
          </ChaotangButton>
        </ChaotangPanel>

        <section className="relative overflow-hidden border border-[#bda65d]/55 bg-[#e9e2cc] p-1 text-[#272116] shadow-[0_22px_70px_rgba(0,0,0,0.4)]">
          <div className="h-full border border-[#9b8140]/40 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.75),transparent_45%),linear-gradient(135deg,#eee9d9,#dcd3bb)] px-double py-8 sm:px-10">
            <div className="flex items-center justify-between gap-base text-[10px] text-[#79642f]">
              <span>大殿 · 今日御断</span>
              <span>LIVE · 真实账户投影</span>
            </div>
            <p className="mt-8 text-xs text-[#9a372b]">一句判断</p>
            <h2 className="chaotang-title mt-base text-2xl leading-relaxed text-[#262016] sm:text-3xl">
              {overview.todayFocus}
            </h2>
            <div className="mt-8 grid border border-[#9b8140]/30 sm:grid-cols-3">
              <VerdictMetric
                label="发生了什么"
                value={`${overview.replyCount} 项正式回奏`}
              />
              <VerdictMetric
                label="与你的关系"
                value={`${overview.pendingReviewCount} 项等待复盘`}
              />
              <VerdictMetric
                label="现在做什么"
                value={
                  overview.pendingReviewCount
                    ? '先完成一项复盘'
                    : '查看最新回奏'
                }
              />
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-base">
              <button
                type="button"
                onClick={() => void navigate({ to: '/court' })}
                className="border border-[#8f6c22] bg-[#d8bd69] px-double py-base text-sm font-semibold text-[#282014] shadow-[0_5px_18px_rgba(83,59,12,0.2)] hover:bg-[#e2ca7e]"
              >
                丞相 · 查看并处理今日要务
              </button>
              <button
                type="button"
                onClick={() => void navigate({ to: '/learning' })}
                className="border border-[#9b8140]/45 px-base py-base text-xs text-[#665323] hover:bg-white/30"
              >
                进入史馆复盘
              </button>
            </div>
            <p className="mt-base text-center text-[10px] text-[#786f5d]">
              只显示后端返回的真实数量与状态，不生成演示朝报。
            </p>
          </div>
        </section>

        <div className="space-y-base">
          <ChaotangPanel className="p-double">
            <p className="text-[9px] tracking-[0.2em] text-brand/55">
              RESULT & BOUNDARY
            </p>
            <h2 className="chaotang-title mt-half text-xl text-high">
              结果与边界
            </h2>
            <div className="mt-double flex items-center gap-base">
              {readiness?.ready ? (
                <ShieldCheckIcon
                  className="size-5 text-success"
                  weight="duotone"
                />
              ) : (
                <WarningIcon className="size-5 text-brand" weight="duotone" />
              )}
              <div>
                <p className="text-sm text-high">
                  {readiness?.ready ? '完整能力已就绪' : '当前为有限就绪'}
                </p>
                <p className="mt-half text-[10px] text-low">
                  {readinessError ??
                    readiness?.codes.join(' · ') ??
                    '正在检查运行条件'}
                </p>
              </div>
            </div>
          </ChaotangPanel>
          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <ScrollIcon className="size-5 text-brand" />
              <h3 className="chaotang-title text-lg text-high">每日奏报</h3>
            </div>
            {dailyMemorialError ? (
              <p className="mt-base text-xs text-error">{dailyMemorialError}</p>
            ) : dailyMemorial ? (
              <div className="mt-base">
                <div className="flex justify-between gap-base text-xs">
                  <span className="text-normal">
                    {dailyMemorial.draft?.reportDate ?? '本日奏报'}
                  </span>
                  <span className="text-brand">
                    {memorialStatusLabels[dailyMemorial.status]}
                  </span>
                </div>
                {dailyMemorial.draft && (
                  <p className="mt-base line-clamp-4 text-xs leading-relaxed text-low">
                    {dailyMemorial.draft.content}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-base text-xs text-low">
                当前账户尚无每日奏报记录。
              </p>
            )}
          </ChaotangPanel>
        </div>
      </div>

      <div className="grid gap-base xl:grid-cols-[1.25fr_0.75fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <ScrollIcon className="size-5 text-brand" />
            <h2 className="chaotang-title text-lg text-high">最近回奏</h2>
          </div>
          {overview.recentReplies.length === 0 ? (
            <p className="mt-double border border-dashed border-brand/20 py-12 text-center text-sm text-low">
              当前没有真实回奏记录
            </p>
          ) : (
            <div className="mt-double grid gap-base md:grid-cols-2">
              {overview.recentReplies.map((reply) => (
                <article
                  key={reply.id}
                  className="border border-brand/15 bg-primary/45 p-base"
                >
                  <h3 className="truncate text-sm text-high">{reply.title}</h3>
                  <p className="mt-half line-clamp-2 text-xs leading-relaxed text-low">
                    {reply.replyConclusion}
                  </p>
                  <div className="mt-base flex flex-wrap gap-base text-[10px] text-low">
                    <span>{reply.participatingDepartments.join(' · ')}</span>
                    <span className="flex items-center gap-half">
                      <ClockIcon className="size-3" />
                      {new Date(reply.replyTime).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </ChaotangPanel>
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <BuildingsIcon className="size-5 text-brand" />
            <h2 className="chaotang-title text-lg text-high">部门参与</h2>
          </div>
          <div className="mt-double space-y-base">
            {overview.departmentCounts.length ? (
              overview.departmentCounts.map((item) => (
                <div
                  key={item.department}
                  className="flex justify-between border-b border-brand/10 pb-base text-sm"
                >
                  <span className="text-normal">{item.department}</span>
                  <span className="font-mono text-brand">{item.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-low">当前没有部门回奏统计。</p>
            )}
          </div>
        </ChaotangPanel>
      </div>
    </div>
  );
}

function FactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-brand/15 bg-primary/40 p-base">
      <p className="text-[10px] text-brand">{label}</p>
      <p className="mt-base text-xs leading-relaxed text-normal">{value}</p>
    </div>
  );
}
function VerdictMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#9b8140]/30 p-base last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] text-[#8f6f2a]">{label}</p>
      <p className="mt-base text-sm font-medium text-[#2a241a]">{value}</p>
    </div>
  );
}
