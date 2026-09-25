import {
  ArrowsClockwiseIcon,
  ChartLineIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  DatabaseIcon,
  LockKeyIcon,
  ScalesIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  useQintianForecasts,
  useQintianPendingTriggers,
} from '@/shared/hooks/chaotang/useQintianjian';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

type GateState = 'available' | 'no_data' | 'not_implemented';

const GATE_META: Record<GateState, { label: string; className: string }> = {
  available: { label: 'AVAILABLE', className: 'text-success' },
  no_data: { label: 'NO_DATA', className: 'text-brand' },
  not_implemented: { label: 'NOT_IMPLEMENTED', className: 'text-error' },
};

export function CalibrationWorkspace() {
  const { user, health } = useChaotangProvider();
  const forecasts = useQintianForecasts();
  const triggers = useQintianPendingTriggers();

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '钦天监服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          校准准备度只读取当前账户的正式推演、触发器和人工复核记录。
        </p>
      </ChaotangPanel>
    );
  }

  if (forecasts.isPending || triggers.isPending) {
    return (
      <div className="h-[520px] animate-pulse border border-brand/15 bg-panel/60" />
    );
  }

  if (forecasts.isError || triggers.isError) {
    return (
      <ChaotangPanel className="p-double text-center">
        <WarningIcon className="mx-auto size-7 text-error" weight="duotone" />
        <h2 className="chaotang-title mt-base text-xl text-error">
          校准准备度读取失败
        </h2>
        <p className="mt-base text-sm text-low">
          {forecasts.error?.message ?? triggers.error?.message}
        </p>
      </ChaotangPanel>
    );
  }

  const allTriggers = forecasts.data.reduce(
    (count, forecast) => count + forecast.triggers.length,
    0
  );
  const reviewCount = forecasts.data.reduce(
    (count, forecast) => count + forecast.reviews.length,
    0
  );
  const dueCount = triggers.data.filter((trigger) => trigger.isDue).length;

  return (
    <div className="space-y-double">
      <ChaotangPanel className="p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-brand/55">
              CALIBRATION READINESS
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              回测与校准准备度
            </h2>
            <p className="mt-base max-w-3xl text-sm leading-relaxed text-low">
              当前只核验校准所需数据链是否存在。没有认证
              Outcome、冻结信息集与版本化评分方法时，不计算 Brier
              Score，也不生成命中率。
            </p>
          </div>
          <span className="border border-brand/30 bg-brand/10 px-base py-half text-[9px] tracking-[0.14em] text-brand">
            PLANNED · NO_DATA
          </span>
        </div>

        <div className="mt-double grid gap-base sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={ChartLineIcon}
            label="正式推演"
            value={String(forecasts.data.length)}
          />
          <Metric
            icon={ClockCountdownIcon}
            label="证伪触发器"
            value={String(allTriggers)}
          />
          <Metric
            icon={ScalesIcon}
            label="人工复核"
            value={String(reviewCount)}
          />
          <Metric
            icon={WarningIcon}
            label="已到复核时间"
            value={String(dueCount)}
          />
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[1.2fr_0.8fr]">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <DatabaseIcon className="size-5 text-brand" weight="duotone" />
            <h3 className="chaotang-title text-lg text-high">校准数据门槛</h3>
          </div>
          <div className="mt-double space-y-half">
            <Gate
              title="正式推演样本"
              state="available"
              detail={`${forecasts.data.length} 条当前账户记录；包含三情景、假设和触发器。`}
            />
            <Gate
              title="人工复核记录"
              state="available"
              detail={`${reviewCount} 条决策记录；只能证明人工判断，不能替代真实结果。`}
            />
            <Gate
              title="认证 OutcomeEvent"
              state="no_data"
              detail="仓库尚无 append-only、按 owner 与预测绑定的真实结果账。"
            />
            <Gate
              title="冻结信息集"
              state="not_implemented"
              detail="尚未冻结预测时点可见证据，无法证明评分过程没有时间泄漏。"
            />
            <Gate
              title="版本化校准方法"
              state="not_implemented"
              detail="没有批准的概率映射和 Brier Score 版本，因此不得由客户端自行计算。"
            />
          </div>
        </ChaotangPanel>

        <div className="flex flex-col gap-double">
          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <LockKeyIcon className="size-5 text-error" weight="duotone" />
              <h3 className="chaotang-title text-lg text-high">当前不可输出</h3>
            </div>
            <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
              <li>不可输出 Brier Score、准确率或校准曲线。</li>
              <li>不可把人工 ReviewStatus 当作真实 Outcome。</li>
              <li>不可使用 synthetic fixture 声称业务预测有效。</li>
              <li>不可把 HIGH / MEDIUM / LOW 置信标签转换成概率。</li>
            </ul>
          </ChaotangPanel>

          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <ShieldCheckIcon
                className="size-5 text-success"
                weight="duotone"
              />
              <h3 className="chaotang-title text-lg text-high">未来接入契约</h3>
            </div>
            <ol className="mt-double space-y-base text-xs leading-relaxed text-low">
              <li>1. 追加认证且不可改写的 OutcomeEvent。</li>
              <li>2. 冻结预测时点的信息集与证据摘要。</li>
              <li>3. 由后端版本化方法确定概率和结算规则。</li>
              <li>4. 只向客户端返回已结算样本与可复核评分。</li>
            </ol>
            <ChaotangButton
              className="mt-double"
              onClick={() =>
                void Promise.all([forecasts.refetch(), triggers.refetch()])
              }
              disabled={forecasts.isFetching || triggers.isFetching}
            >
              <ArrowsClockwiseIcon
                className={cn(
                  'size-4',
                  (forecasts.isFetching || triggers.isFetching) &&
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

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ChartLineIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-brand/15 bg-primary/40 p-base">
      <div className="flex items-center justify-between gap-base">
        <p className="text-xs text-low">{label}</p>
        <Icon className="size-5 text-brand" weight="duotone" />
      </div>
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
  const meta = GATE_META[state];
  const Icon = state === 'available' ? CheckCircleIcon : WarningIcon;
  return (
    <div className="flex items-start gap-base border border-brand/12 bg-primary/35 p-base">
      <Icon className={cn('mt-half size-5 shrink-0', meta.className)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-half">
          <p className="text-sm text-high">{title}</p>
          <span className={cn('text-[9px] tracking-[0.12em]', meta.className)}>
            {meta.label}
          </span>
        </div>
        <p className="mt-half text-xs leading-relaxed text-low">{detail}</p>
      </div>
    </div>
  );
}
