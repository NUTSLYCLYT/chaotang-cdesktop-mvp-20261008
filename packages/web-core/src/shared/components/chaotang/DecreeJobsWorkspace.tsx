import { useMemo, useState } from 'react';
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  HourglassIcon,
  ScrollIcon,
  ShieldCheckIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { useDecreeJobs } from '@/shared/hooks/chaotang/useDecreeJobs';
import { useCancelDecreeJob } from '@/shared/hooks/chaotang/useChancellor';
import {
  useChaotangProvider,
  type DecreeJob,
  type DecreeJobState,
} from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const STATE_META: Record<DecreeJobState, { label: string; className: string }> =
  {
    QUEUED: { label: '排队中', className: 'text-brand' },
    RUNNING: { label: '执行中', className: 'text-brand' },
    SUCCEEDED: { label: '已完成', className: 'text-success' },
    FAILED: { label: '失败', className: 'text-error' },
    CANCELLED: { label: '已取消', className: 'text-low' },
  };

export function DecreeJobsWorkspace() {
  const { user, health } = useChaotangProvider();
  const jobs = useDecreeJobs();
  const cancel = useCancelDecreeJob();
  const [stateFilter, setStateFilter] = useState<DecreeJobState>();
  const [selectedId, setSelectedId] = useState<string>();

  const filtered = useMemo(
    () =>
      jobs.data?.items.filter(
        (job) => !stateFilter || job.state === stateFilter
      ) ?? [],
    [jobs.data, stateFilter]
  );
  const selected = jobs.data?.items.find((job) => job.jobId === selectedId);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '旨意任务服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          任务状态严格按当前账户隔离，不读取其他账户的执行记录。
        </p>
      </ChaotangPanel>
    );
  }

  if (jobs.isPending) {
    return (
      <div className="grid animate-pulse gap-double xl:grid-cols-[0.9fr_1.25fr]">
        <div className="h-[520px] border border-brand/15 bg-panel/60" />
        <div className="h-[520px] border border-brand/15 bg-panel/60" />
      </div>
    );
  }

  if (jobs.isError) {
    return (
      <ChaotangPanel className="p-double text-center">
        <WarningIcon className="mx-auto size-7 text-error" weight="duotone" />
        <h2 className="chaotang-title mt-base text-xl text-error">
          旨意任务读取失败
        </h2>
        <p className="mt-base text-sm text-low">{jobs.error.message}</p>
        <ChaotangButton
          className="mt-double"
          onClick={() => void jobs.refetch()}
        >
          <ArrowsClockwiseIcon className="size-4" />
          重新读取
        </ChaotangButton>
      </ChaotangPanel>
    );
  }

  const counts = countStates(jobs.data.items);

  return (
    <div className="space-y-double">
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="任务总数" value={jobs.data.total} />
        <Metric label="排队中" value={counts.QUEUED} />
        <Metric label="执行中" value={counts.RUNNING} />
        <Metric label="已完成" value={counts.SUCCEEDED} success />
        <Metric label="失败或取消" value={counts.FAILED + counts.CANCELLED} />
      </div>

      <ChaotangPanel className="p-base">
        <div className="flex flex-wrap items-start gap-base">
          <ShieldCheckIcon
            className="mt-half size-5 shrink-0 text-success"
            weight="duotone"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-high">账户隔离的安全任务投影</p>
            <p className="mt-half text-xs leading-relaxed text-low">
              客户端只接收 Job
              ID、公开状态、阶段、尝试次数、公开结果与安全错误元数据；旨意正文、审批路由和内部租约不会进入
              WebView。
            </p>
          </div>
          <ChaotangButton
            onClick={() => void jobs.refetch()}
            disabled={jobs.isFetching}
          >
            <ArrowsClockwiseIcon
              className={cn('size-4', jobs.isFetching && 'animate-spin')}
            />
            重新读取
          </ChaotangButton>
        </div>
      </ChaotangPanel>

      <div className="grid gap-double xl:grid-cols-[0.9fr_1.25fr]">
        <ChaotangPanel className="p-double">
          <div className="border-b border-brand/15 pb-double">
            <div className="flex items-center gap-base">
              <ScrollIcon className="size-5 text-brand" weight="duotone" />
              <h2 className="chaotang-title text-lg text-high">旨意任务</h2>
              <span className="ml-auto text-[10px] text-low">
                当前批次 {jobs.data.items.length}/{jobs.data.total}
              </span>
            </div>
            <div className="mt-base flex flex-wrap gap-half">
              <FilterButton
                active={!stateFilter}
                onClick={() => setStateFilter(undefined)}
              >
                全部
              </FilterButton>
              {(Object.keys(STATE_META) as DecreeJobState[]).map((state) => (
                <FilterButton
                  key={state}
                  active={stateFilter === state}
                  onClick={() => setStateFilter(state)}
                >
                  {STATE_META[state].label}
                </FilterButton>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <HourglassIcon
                className="size-8 text-brand/50"
                weight="duotone"
              />
              <p className="mt-base text-sm text-low">
                {jobs.data.total === 0
                  ? '当前账户没有旨意任务记录'
                  : '当前筛选条件下没有任务'}
              </p>
            </div>
          ) : (
            <div className="mt-double max-h-[560px] space-y-half overflow-y-auto pr-half">
              {filtered.map((job) => (
                <button
                  key={job.jobId}
                  type="button"
                  onClick={() => setSelectedId(job.jobId)}
                  className={cn(
                    'w-full border p-base text-left transition-colors',
                    selectedId === job.jobId
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <div className="flex items-center justify-between gap-base">
                    <code className="truncate text-xs text-high">
                      {job.jobId}
                    </code>
                    <span
                      className={cn(
                        'shrink-0 text-[9px]',
                        STATE_META[job.state].className
                      )}
                    >
                      {STATE_META[job.state].label}
                    </span>
                  </div>
                  <div className="mt-base flex items-center justify-between gap-base text-[10px] text-low">
                    <span>{job.stage}</span>
                    <span>
                      {new Date(job.updatedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          {!selected ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <ClockIcon className="size-8 text-brand/45" weight="duotone" />
              <p className="mt-base text-sm text-low">
                选择一项任务查看执行状态
              </p>
            </div>
          ) : (
            <JobDetail
              job={selected}
              cancelling={cancel.isPending}
              cancelError={cancel.error?.message}
              onCancel={() => cancel.mutate(selected.jobId)}
            />
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function JobDetail({
  job,
  cancelling,
  cancelError,
  onCancel,
}: {
  job: DecreeJob;
  cancelling: boolean;
  cancelError?: string;
  onCancel: () => void;
}) {
  const meta = STATE_META[job.state];
  const canRequestCancel =
    ['QUEUED', 'RUNNING'].includes(job.state) &&
    !['ARCHIVING', 'PUBLISHING'].includes(job.stage) &&
    !job.cancelRequested;
  const StateIcon =
    job.state === 'SUCCEEDED'
      ? CheckCircleIcon
      : ['FAILED', 'CANCELLED'].includes(job.state)
        ? XCircleIcon
        : HourglassIcon;

  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
        <div>
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            DECREE JOB
          </p>
          <h2 className="chaotang-title mt-half text-xl text-high">
            旨意任务详情
          </h2>
          <code className="mt-half block break-all text-[10px] text-low">
            {job.jobId}
          </code>
        </div>
        <span
          className={cn('flex items-center gap-half text-xs', meta.className)}
        >
          <StateIcon className="size-4" weight="duotone" />
          {meta.label}
        </span>
      </div>

      <div className="mt-double grid gap-base text-sm sm:grid-cols-2">
        <Field label="公开阶段" value={job.stage} />
        <Field label="执行尝试" value={String(job.attemptCount)} />
        <Field label="Provider 请求" value={String(job.providerRequestCount)} />
        <Field
          label="取消请求"
          value={job.cancelRequested ? '已登记' : '未登记'}
        />
        <Field label="创建时间" value={formatDate(job.createdAt)} />
        <Field label="更新时间" value={formatDate(job.updatedAt)} />
      </div>

      {job.error && (
        <section className="mt-double border border-error/25 bg-error/5 p-base">
          <div className="flex items-center gap-base text-error">
            <WarningIcon className="size-5" weight="duotone" />
            <h3 className="chaotang-title text-base">安全错误信息</h3>
          </div>
          <div className="mt-base grid gap-base text-xs sm:grid-cols-3">
            <Field label="错误代码" value={job.error.code} />
            <Field label="错误阶段" value={job.error.stage} />
            <Field label="错误类别" value={job.error.category} />
          </div>
        </section>
      )}

      {job.result && (
        <section className="mt-double">
          <h3 className="chaotang-title text-base text-high">公开结果</h3>
          <pre className="mt-base max-h-60 overflow-auto whitespace-pre-wrap break-all border border-brand/15 bg-primary/45 p-base text-[10px] leading-relaxed text-normal">
            {JSON.stringify(job.result, null, 2)}
          </pre>
        </section>
      )}

      <div className="mt-double border-t border-brand/15 pt-double">
        <p className="text-xs leading-relaxed text-low">
          {canRequestCancel
            ? '当前阶段可向后端申请取消；最终状态以任务轮询结果为准。'
            : '当前状态或阶段不提供取消操作。'}
        </p>
        {cancelError && (
          <p className="mt-base text-xs text-error">{cancelError}</p>
        )}
        <ChaotangButton
          className="mt-base"
          variant="danger"
          disabled={!canRequestCancel || cancelling}
          onClick={onCancel}
        >
          {cancelling ? '正在申请…' : '请求取消'}
        </ChaotangButton>
      </div>
    </article>
  );
}

function countStates(items: DecreeJob[]) {
  return items.reduce<Record<DecreeJobState, number>>(
    (counts, item) => ({ ...counts, [item.state]: counts[item.state] + 1 }),
    { QUEUED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, CANCELLED: 0 }
  );
}

function Metric({
  label,
  value,
  success = false,
}: {
  label: string;
  value: number;
  success?: boolean;
}) {
  return (
    <ChaotangPanel className="p-base">
      <p className="text-xs text-low">{label}</p>
      <p
        className={cn(
          'chaotang-title mt-half text-2xl',
          success ? 'text-success' : 'text-brand'
        )}
      >
        {value}
      </p>
    </ChaotangPanel>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border px-base py-half text-[10px]',
        active
          ? 'border-brand/45 bg-brand/10 text-brand'
          : 'border-brand/15 text-low hover:border-brand/30'
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-brand/10 pb-base">
      <p className="text-[10px] text-low">{label}</p>
      <p className="mt-half break-all text-xs text-normal">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}
