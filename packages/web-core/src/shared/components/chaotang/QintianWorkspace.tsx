import { useState } from 'react';
import {
  ClockCountdownIcon,
  EyeIcon,
  GaugeIcon,
  ScalesIcon,
} from '@phosphor-icons/react';
import {
  useQintianForecast,
  useQintianForecasts,
  useQintianPendingTriggers,
  useCreateQintianForecast,
  useReviewQintianForecast,
} from '@/shared/hooks/chaotang/useQintianjian';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

type QintianMode = 'overview' | 'forecasts' | 'triggers' | 'reviews';

const confidenceLabel = { LOW: '低', MEDIUM: '中', HIGH: '高' } as const;
const scenarioLabel = {
  OPTIMISTIC: '乐观情景',
  BASELINE: '基准情景',
  PESSIMISTIC: '悲观情景',
} as const;

export function QintianWorkspace({ mode }: { mode: QintianMode }) {
  const { user, health } = useChaotangProvider();
  const forecasts = useQintianForecasts();
  const triggers = useQintianPendingTriggers();
  const [selectedId, setSelectedId] = useState<string>();
  const detail = useQintianForecast(selectedId);
  const create = useCreateQintianForecast();
  const review = useReviewQintianForecast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [question, setQuestion] = useState('');
  const [reviewAt, setReviewAt] = useState('');
  const [reviewTarget, setReviewTarget] = useState<{
    forecastId: string;
    triggerId: string;
  }>();
  const [observation, setObservation] = useState('');

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '钦天监服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          推演、触发器与复核结果严格按当前账户隔离。
        </p>
      </ChaotangPanel>
    );
  }

  if (forecasts.isPending || triggers.isPending) {
    return (
      <div className="h-96 animate-pulse border border-brand/15 bg-panel/60" />
    );
  }
  if (forecasts.isError || triggers.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {forecasts.error?.message ?? triggers.error?.message}
      </ChaotangPanel>
    );
  }

  if (mode === 'overview') {
    const reviewCount = forecasts.data.reduce(
      (total, forecast) => total + forecast.reviews.length,
      0
    );
    const overviewCards = [
      { label: '正式推演', value: forecasts.data.length, icon: EyeIcon },
      {
        label: '待验证触发器',
        value: triggers.data.length,
        icon: ClockCountdownIcon,
      },
      { label: '人工复核', value: reviewCount, icon: ScalesIcon },
    ];
    return (
      <div className="space-y-double">
        <CelestialBanner
          title="钦天监 · 条件推演"
          subtitle="比较条件、情景与失效信号，不提供无依据的单一路径保证。"
          forecastCount={forecasts.data.length}
          triggerCount={triggers.data.length}
        />
        <div className="grid gap-base sm:grid-cols-3">
          {overviewCards.map(({ label, value, icon: Icon }) => (
            <ChaotangPanel key={label} className="p-double">
              <div className="flex items-center justify-between">
                <p className="text-xs text-low">{label}</p>
                <Icon className="size-5 text-brand" weight="duotone" />
              </div>
              <p className="chaotang-title mt-base text-3xl text-brand">
                {value}
              </p>
            </ChaotangPanel>
          ))}
        </div>
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-xl text-high">近期推演</h2>
          {forecasts.data.length === 0 ? (
            <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
              当前账户尚无正式推演
            </p>
          ) : (
            <div className="mt-double grid gap-base md:grid-cols-2">
              {forecasts.data.slice(0, 4).map((forecast) => (
                <ForecastSummary key={forecast.id} forecast={forecast} />
              ))}
            </div>
          )}
        </ChaotangPanel>
      </div>
    );
  }

  if (mode === 'triggers') {
    return (
      <div className="space-y-double">
        <CelestialBanner
          title="触发与失效台"
          subtitle="提前定义什么变化会强化、削弱或推翻当前判断。"
          forecastCount={forecasts.data.length}
          triggerCount={triggers.data.length}
        />
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-xl text-high">待验证触发器</h2>
          {triggers.data.length === 0 ? (
            <EmptyState>当前没有待验证触发器</EmptyState>
          ) : (
            <div className="mt-double grid gap-base md:grid-cols-2">
              {triggers.data.map((trigger) => (
                <article
                  key={trigger.id}
                  className="border border-brand/15 bg-primary/45 p-base"
                >
                  <div className="flex justify-between gap-base">
                    <span className="text-xs text-brand">
                      {trigger.isDue ? '已到复核时间' : '等待观察'}
                    </span>
                    <span className="text-[10px] text-low">
                      {new Date(trigger.reviewAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <h3 className="mt-base text-sm text-high">
                    {trigger.signal}
                  </h3>
                  <p className="mt-half text-xs leading-relaxed text-low">
                    阈值：{trigger.threshold} · 窗口：{trigger.window}
                  </p>
                  <p className="mt-base border-t border-brand/10 pt-base text-xs text-normal">
                    {trigger.forecastSummary}
                  </p>
                  <ChaotangButton
                    className="mt-base"
                    onClick={() =>
                      setReviewTarget({
                        forecastId: trigger.forecastId,
                        triggerId: trigger.id,
                      })
                    }
                  >
                    提交人工复核
                  </ChaotangButton>
                </article>
              ))}
            </div>
          )}
          {reviewTarget && (
            <div className="mt-double border-t border-brand/15 pt-double">
              <textarea
                value={observation}
                onChange={(event) => setObservation(event.target.value)}
                placeholder="填写实际观察结果…"
                className="w-full border border-brand/20 bg-primary/50 p-base text-sm text-normal"
              />
              <div className="mt-base flex gap-base">
                <ChaotangButton
                  variant="primary"
                  disabled={!observation.trim() || review.isPending}
                  onClick={() =>
                    review.mutate(
                      {
                        forecastId: reviewTarget.forecastId,
                        input: {
                          decision: 'KEEP',
                          triggerId: reviewTarget.triggerId,
                          observation: observation.trim(),
                          judgmentInvalidated: false,
                        },
                      },
                      {
                        onSuccess: () => {
                          setReviewTarget(undefined);
                          setObservation('');
                        },
                      }
                    )
                  }
                >
                  {review.isPending ? '提交中…' : '维持原判断'}
                </ChaotangButton>
                <ChaotangButton
                  variant="danger"
                  disabled={!observation.trim() || review.isPending}
                  onClick={() =>
                    review.mutate({
                      forecastId: reviewTarget.forecastId,
                      input: {
                        decision: 'INVALIDATE',
                        triggerId: reviewTarget.triggerId,
                        observation: observation.trim(),
                        judgmentInvalidated: true,
                      },
                    })
                  }
                >
                  判定失效
                </ChaotangButton>
              </div>
              {review.error && (
                <p className="mt-base text-xs text-error">
                  {review.error.message}
                </p>
              )}
            </div>
          )}
        </ChaotangPanel>
      </div>
    );
  }

  if (mode === 'reviews') {
    const reviews = forecasts.data.flatMap((forecast) =>
      forecast.reviews.map((review) => ({ review, forecast }))
    );
    return (
      <div className="space-y-double">
        <CelestialBanner
          title="人工复核"
          subtitle="用实际观察更新判断，但保留原始推演与历史版本。"
          forecastCount={forecasts.data.length}
          triggerCount={triggers.data.length}
        />
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-xl text-high">人工复核记录</h2>
          {reviews.length === 0 ? (
            <EmptyState>当前没有已提交的人工复核</EmptyState>
          ) : (
            <div className="mt-double space-y-base">
              {reviews.map(({ review, forecast }) => (
                <article
                  key={review.id}
                  className="border border-brand/15 bg-primary/45 p-base"
                >
                  <div className="flex flex-wrap justify-between gap-base">
                    <span className="text-xs text-brand">
                      {review.decision}
                    </span>
                    <span className="text-[10px] text-low">
                      {new Date(review.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <h3 className="mt-base text-sm text-high">
                    {forecast.subject.title}
                  </h3>
                  <p className="mt-half text-xs leading-relaxed text-normal">
                    {review.observation}
                  </p>
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
      <CelestialBanner
        title="三景推演室"
        subtitle="上行、基线、受阻三种条件情景共享同一问题、证据与复核时间。"
        forecastCount={forecasts.data.length}
        triggerCount={triggers.data.length}
      />
      <ChaotangPanel className="p-double">
        <h2 className="chaotang-title text-lg text-high">创建正式推演</h2>
        <div className="mt-base grid gap-base md:grid-cols-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="推演主题"
            className="border border-brand/20 bg-primary/50 p-base text-sm text-normal"
          />
          <input
            type="datetime-local"
            value={reviewAt}
            onChange={(event) => setReviewAt(event.target.value)}
            className="border border-brand/20 bg-primary/50 p-base text-sm text-normal"
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="主题背景与已知事实"
            className="border border-brand/20 bg-primary/50 p-base text-sm text-normal md:col-span-2"
          />
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="需要推演的核心问题"
            className="border border-brand/20 bg-primary/50 p-base text-sm text-normal md:col-span-2"
          />
        </div>
        <ChaotangButton
          className="mt-base"
          variant="primary"
          disabled={
            !title.trim() ||
            !content.trim() ||
            !question.trim() ||
            !reviewAt ||
            create.isPending
          }
          onClick={() =>
            create.mutate(
              {
                idempotencyKey: crypto.randomUUID(),
                subject: {
                  kind: 'DRAFT',
                  id: crypto.randomUUID(),
                  title: title.trim(),
                  content: content.trim(),
                },
                question: question.trim(),
                evidenceRefs: [],
                reviewAt: new Date(reviewAt).toISOString(),
              },
              {
                onSuccess: () => {
                  setTitle('');
                  setContent('');
                  setQuestion('');
                  setReviewAt('');
                },
              }
            )
          }
        >
          {create.isPending ? '推演中…' : '创建正式推演'}
        </ChaotangButton>
        {create.error && (
          <p className="mt-base text-xs text-error">{create.error.message}</p>
        )}
      </ChaotangPanel>
      <div className="grid gap-double xl:grid-cols-[0.78fr_1.4fr]">
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-lg text-high">正式推演</h2>
          {forecasts.data.length === 0 ? (
            <EmptyState>当前账户尚无正式推演</EmptyState>
          ) : (
            <div className="mt-double max-h-[620px] space-y-half overflow-y-auto">
              {forecasts.data.map((forecast) => (
                <button
                  key={forecast.id}
                  type="button"
                  onClick={() => setSelectedId(forecast.id)}
                  className={cn(
                    'w-full border p-base text-left',
                    selectedId === forecast.id
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <p className="truncate text-sm text-high">
                    {forecast.subject.title}
                  </p>
                  <p className="mt-half line-clamp-2 text-xs text-low">
                    {forecast.question}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>
        <ChaotangPanel className="p-double">
          {!selectedId ? (
            <EmptyState>选择一项推演查看三情景与判断依据</EmptyState>
          ) : detail.isPending ? (
            <div className="h-80 animate-pulse bg-brand/5" />
          ) : detail.isError ? (
            <p className="text-sm text-error">{detail.error.message}</p>
          ) : (
            <article>
              <div className="flex flex-wrap justify-between gap-base border-b border-brand/15 pb-double">
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-brand/55">
                    {detail.data.methodologyVersion}
                  </p>
                  <h2 className="chaotang-title mt-half text-2xl text-high">
                    {detail.data.subject.title}
                  </h2>
                </div>
                <span className="flex items-center gap-half text-xs text-brand">
                  <GaugeIcon className="size-4" />
                  置信度 {confidenceLabel[detail.data.confidence]}
                </span>
              </div>
              <p className="mt-double text-sm leading-7 text-normal">
                {detail.data.judgment}
              </p>
              <p className="mt-base text-xs leading-relaxed text-low">
                {detail.data.confidenceBasis}
              </p>
              <div className="mt-double grid gap-base lg:grid-cols-3">
                {detail.data.scenarios.map((scenario) => (
                  <section
                    key={scenario.kind}
                    className="border border-brand/15 bg-primary/45 p-base"
                  >
                    <p className="text-xs text-brand">
                      {scenarioLabel[scenario.kind]}
                    </p>
                    <p className="mt-base text-sm leading-relaxed text-normal">
                      {scenario.summary}
                    </p>
                    <p className="mt-base text-xs leading-relaxed text-low">
                      影响：{scenario.impact}
                    </p>
                    <p className="mt-half text-[10px] text-low">
                      窗口：{scenario.timeWindow}
                    </p>
                  </section>
                ))}
              </div>
              <div className="mt-double grid gap-base lg:grid-cols-2">
                <section className="border border-brand/15 bg-primary/45 p-base">
                  <p className="text-xs text-brand">关键假设</p>
                  {detail.data.assumptions.length ? (
                    <ul className="mt-base space-y-base text-xs leading-relaxed text-normal">
                      {detail.data.assumptions.map((assumption) => (
                        <li
                          key={assumption.statement}
                          className="flex gap-base"
                        >
                          <span
                            className={
                              assumption.critical ? 'text-error' : 'text-brand'
                            }
                          >
                            {assumption.critical ? '关键' : '一般'}
                          </span>
                          <span>{assumption.statement}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-base text-xs text-low">
                      没有返回结构化假设。
                    </p>
                  )}
                </section>
                <section className="border border-brand/15 bg-primary/45 p-base">
                  <p className="text-xs text-brand">触发与失效条件</p>
                  {detail.data.triggers.length ? (
                    <div className="mt-base space-y-base">
                      {detail.data.triggers.map((trigger) => (
                        <div
                          key={trigger.id}
                          className="border-l border-brand/35 pl-base"
                        >
                          <p className="text-xs text-normal">
                            {trigger.signal}
                          </p>
                          <p className="mt-half text-[10px] text-low">
                            阈值：{trigger.threshold} · 窗口：{trigger.window}
                          </p>
                          <p className="mt-half text-[10px] text-brand">
                            复核：
                            {new Date(trigger.reviewAt).toLocaleString('zh-CN')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-base text-xs text-low">
                      没有返回结构化触发器。
                    </p>
                  )}
                </section>
              </div>
              <p className="mt-double border-t border-brand/15 pt-base text-[10px] text-low">
                {detail.data.disclaimer}
              </p>
            </article>
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function CelestialBanner({
  title,
  subtitle,
  forecastCount,
  triggerCount,
}: {
  title: string;
  subtitle: string;
  forecastCount: number;
  triggerCount: number;
}) {
  return (
    <section className="relative overflow-hidden border border-brand/30 bg-[#090d10]/90 px-double py-8 shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_18%_30%,rgba(216,193,105,.7)_0_1px,transparent_2px),radial-gradient(circle_at_72%_22%,rgba(216,193,105,.5)_0_1px,transparent_2px),radial-gradient(circle_at_58%_72%,rgba(216,193,105,.45)_0_1px,transparent_2px),radial-gradient(ellipse_at_center,rgba(74,102,112,.22),transparent_62%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-double">
        <div>
          <p className="text-[9px] tracking-[0.24em] text-brand/60">
            CELESTIAL CONDITION MAP · LIVE
          </p>
          <h2 className="chaotang-title mt-half text-2xl text-high">{title}</h2>
          <p className="mt-base max-w-2xl text-xs leading-relaxed text-low">
            {subtitle}
          </p>
        </div>
        <div className="flex gap-base">
          <div className="border border-brand/20 bg-primary/35 px-double py-base text-center">
            <p className="text-[9px] text-low">正式推演</p>
            <p className="chaotang-title mt-half text-xl text-brand">
              {forecastCount}
            </p>
          </div>
          <div className="border border-brand/20 bg-primary/35 px-double py-base text-center">
            <p className="text-[9px] text-low">待验证</p>
            <p className="chaotang-title mt-half text-xl text-brand">
              {triggerCount}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ForecastSummary({
  forecast,
}: {
  forecast: import('@/shared/providers/ChaotangProvider').QintianForecast;
}) {
  return (
    <article className="border border-brand/15 bg-primary/45 p-base">
      <div className="flex justify-between gap-base">
        <h3 className="truncate text-sm text-high">{forecast.subject.title}</h3>
        <span className="text-[10px] text-brand">
          置信度{confidenceLabel[forecast.confidence]}
        </span>
      </div>
      <p className="mt-base line-clamp-2 text-xs leading-relaxed text-normal">
        {forecast.judgment}
      </p>
      <p className="mt-base text-[10px] text-low">
        {new Date(forecast.createdAt).toLocaleString('zh-CN')}
      </p>
    </article>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
      {children}
    </p>
  );
}
