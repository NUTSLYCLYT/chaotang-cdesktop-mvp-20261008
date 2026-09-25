import {
  ArrowsClockwiseIcon,
  CalendarBlankIcon,
  DatabaseIcon,
  FingerprintIcon,
  ScrollIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  useConfirmDailyMemorial,
  useDailyMemorialLatest,
} from '@/shared/hooks/chaotang/useDailyMemorialLatest';
import {
  useChaotangProvider,
  type DailyMemorialStatus,
} from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const STATUS_META: Record<
  DailyMemorialStatus,
  { label: string; className: string; description: string }
> = {
  PENDING: {
    label: '待生成',
    className: 'border-brand/30 bg-brand/10 text-brand',
    description: '后端已登记生成任务，尚未形成可审阅草稿。',
  },
  GENERATING: {
    label: '编制中',
    className: 'border-brand/30 bg-brand/10 text-brand',
    description: '后端正在基于冻结的事实窗口编制奏报。',
  },
  READY_FOR_REVIEW: {
    label: '待审阅',
    className: 'border-success/30 bg-success/10 text-success',
    description: '草稿已经生成，可进行人工审阅；当前客户端尚未开放确认写入。',
  },
  SKIPPED_NO_FACTS: {
    label: '今日无可用事实',
    className: 'border-brand/20 bg-primary/40 text-low',
    description: '事实窗口内没有足够的真实结果，系统没有生成空洞奏报。',
  },
  FAILED: {
    label: '生成失败',
    className: 'border-error/30 bg-error/10 text-error',
    description: '后端未能完成本次编制，请以失败代码诊断。',
  },
  CONFIRMED: {
    label: '已确认归档',
    className: 'border-success/30 bg-success/10 text-success',
    description: '奏报已经确认，并关联正式档案。',
  },
};

export function DailyMemorialWorkspace() {
  const { user, health } = useChaotangProvider();
  const latest = useDailyMemorialLatest();
  const confirm = useConfirmDailyMemorial();

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '朝堂服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          每日奏报按账户隔离，只能从已认证的本地领域服务读取。
        </p>
      </ChaotangPanel>
    );
  }

  if (latest.isPending) {
    return (
      <div className="grid animate-pulse gap-double xl:grid-cols-[1.3fr_0.75fr]">
        <div className="h-[520px] border border-brand/15 bg-panel/60" />
        <div className="h-80 border border-brand/15 bg-panel/60" />
      </div>
    );
  }

  if (latest.isError) {
    return (
      <ChaotangPanel className="p-double text-center">
        <WarningIcon className="mx-auto size-7 text-error" weight="duotone" />
        <h2 className="chaotang-title mt-base text-xl text-error">
          每日奏报读取失败
        </h2>
        <p className="mt-base text-sm text-low">{latest.error.message}</p>
        <ChaotangButton
          className="mt-double"
          onClick={() => void latest.refetch()}
        >
          <ArrowsClockwiseIcon className="size-4" />
          重新读取
        </ChaotangButton>
      </ChaotangPanel>
    );
  }

  if (!latest.data) {
    return (
      <ChaotangPanel className="p-double text-center">
        <ScrollIcon className="mx-auto size-8 text-brand/55" weight="duotone" />
        <h2 className="chaotang-title mt-base text-xl text-high">
          当前没有每日奏报记录
        </h2>
        <p className="mx-auto mt-base max-w-xl text-sm leading-relaxed text-low">
          接口返回了真实空结果。这不等于服务未连接，也不会使用演示内容填充。
        </p>
        <ChaotangButton
          className="mt-double"
          onClick={() => void latest.refetch()}
        >
          <ArrowsClockwiseIcon className="size-4" />
          重新读取
        </ChaotangButton>
      </ChaotangPanel>
    );
  }

  const memorial = latest.data;
  const draft = memorial.draft;
  const status = STATUS_META[memorial.status];

  return (
    <div className="grid gap-double xl:grid-cols-[1.3fr_0.75fr]">
      <ChaotangPanel className="p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-brand/55">
              DAILY MEMORIAL
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              {draft?.reportDate ? `${draft.reportDate} 每日奏报` : '每日奏报'}
            </h2>
          </div>
          <span
            className={cn(
              'border px-base py-half text-[9px] tracking-[0.14em]',
              status.className
            )}
          >
            {status.label}
          </span>
        </div>

        <p className="mt-base text-xs leading-relaxed text-low">
          {status.description}
        </p>

        {draft ? (
          <>
            <div className="mt-double grid gap-base sm:grid-cols-3">
              <Metric label="草稿版本" value={`v${draft.version}`} />
              <Metric
                label="司级结果"
                value={String(draft.bureauResultCount)}
              />
              <Metric
                label="部级结果"
                value={String(draft.ministryResultCount)}
              />
            </div>

            <article className="mt-double border border-brand/20 bg-primary/45 p-double">
              <div className="flex items-center gap-base border-b border-brand/10 pb-base">
                <ScrollIcon className="size-5 text-brand" weight="duotone" />
                <h3 className="chaotang-title text-lg text-high">奏报正文</h3>
              </div>
              <p className="mt-double whitespace-pre-wrap text-sm leading-7 text-normal">
                {draft.content}
              </p>
            </article>

            <section className="mt-double">
              <div className="flex items-center gap-base">
                <DatabaseIcon className="size-5 text-brand" weight="duotone" />
                <h3 className="chaotang-title text-lg text-high">
                  事实引用 · {draft.factRefs.length}
                </h3>
              </div>
              {draft.factRefs.length > 0 ? (
                <div className="mt-base grid gap-half sm:grid-cols-2">
                  {draft.factRefs.map((factRef) => (
                    <code
                      key={factRef}
                      className="break-all border border-brand/15 bg-primary/35 px-base py-base text-[10px] text-normal"
                    >
                      {factRef}
                    </code>
                  ))}
                </div>
              ) : (
                <p className="mt-base border border-dashed border-brand/20 px-base py-double text-center text-xs text-low">
                  该草稿没有返回事实引用
                </p>
              )}
            </section>
          </>
        ) : (
          <p className="mt-double border border-dashed border-brand/20 px-double py-12 text-center text-sm text-low">
            当前状态尚未产生可展示草稿
          </p>
        )}
      </ChaotangPanel>

      <div className="flex flex-col gap-double">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <CalendarBlankIcon className="size-5 text-brand" weight="duotone" />
            <h3 className="chaotang-title text-lg text-high">事实窗口</h3>
          </div>
          <div className="mt-double space-y-base text-sm">
            <Row label="报告日期" value={draft?.reportDate ?? '尚未生成'} />
            <Row
              label="窗口开始"
              value={formatDateTime(draft?.sourceWindowStart)}
            />
            <Row
              label="窗口结束"
              value={formatDateTime(draft?.sourceWindowEnd)}
            />
          </div>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <FingerprintIcon className="size-5 text-brand" weight="duotone" />
            <h3 className="chaotang-title text-lg text-high">版本与归档</h3>
          </div>
          <div className="mt-double space-y-base text-sm">
            <Row label="草稿 ID" value={draft?.id ?? '尚未生成'} mono />
            <Row
              label="内容指纹"
              value={draft?.fingerprint ?? '尚未生成'}
              mono
            />
            <Row
              label="归档 ID"
              value={memorial.memorialId ?? '尚未归档'}
              mono
            />
            <Row label="失败代码" value={memorial.failureCode ?? '无'} mono />
          </div>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <ShieldCheckIcon className="size-5 text-success" weight="duotone" />
            <h3 className="chaotang-title text-lg text-high">真实性边界</h3>
          </div>
          <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
            <li>只读取当前账户最新一份真实记录。</li>
            <li>事实引用、窗口、版本和指纹均由后端返回。</li>
            <li>空结果与“今日无事实”会明确区分。</li>
            <li>确认使用草稿版本与指纹，冲突时由后端失败关闭。</li>
          </ul>
          <div className="mt-double flex gap-base border-t border-brand/15 pt-double">
            <ChaotangButton
              variant="primary"
              disabled={
                memorial.status !== 'READY_FOR_REVIEW' ||
                !draft ||
                confirm.isPending
              }
              onClick={() =>
                draft &&
                confirm.mutate({
                  draftId: draft.id,
                  version: draft.version,
                  fingerprint: draft.fingerprint,
                })
              }
            >
              {confirm.isPending ? '正在确认…' : '确认奏报'}
            </ChaotangButton>
            <ChaotangButton onClick={() => void latest.refetch()}>
              <ArrowsClockwiseIcon className="size-4" />
              重新读取
            </ChaotangButton>
          </div>
          {confirm.error && (
            <p className="mt-base text-xs text-error">
              {confirm.error.message}
            </p>
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-brand/15 bg-primary/40 p-base">
      <p className="text-[9px] tracking-[0.14em] text-low">{label}</p>
      <p className="chaotang-title mt-base text-2xl text-high">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-half border-b border-brand/10 pb-base">
      <span className="text-xs text-low">{label}</span>
      <span
        className={cn(
          'break-all text-xs text-normal',
          mono && 'font-mono text-[10px]'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN') : '尚未生成';
}
