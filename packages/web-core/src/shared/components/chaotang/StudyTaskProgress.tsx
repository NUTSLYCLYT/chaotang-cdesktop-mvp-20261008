import { ShieldCheckIcon } from '@phosphor-icons/react';
import type { DecreeJob } from '@/shared/providers/ChaotangProvider';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';
import { ValidatedDecreeResult } from './CourtWorkspace';
import { decreeJobStatus } from './decreeJobStatus';

export function StudyTaskProgress({
  jobId,
  job,
  readError,
  cancelError,
  isFetching,
  isCancelling,
  onRefresh,
  onCancel,
}: {
  jobId: string;
  job?: DecreeJob;
  readError?: string;
  cancelError?: string;
  isFetching: boolean;
  isCancelling: boolean;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  const mismatch = job && job.jobId !== jobId;
  const confirmed = mismatch ? undefined : job;
  const error = mismatch ? '任务回执不匹配，请重新读取。' : readError;
  const status = confirmed ? decreeJobStatus(confirmed) : undefined;
  return (
    <ChaotangPanel className="p-double" aria-label="旨意任务进度">
      <div className="flex flex-wrap items-center gap-base">
        <ShieldCheckIcon className="size-5 text-brand" weight="duotone" />
        <h3 className="chaotang-title text-xl text-high">旨意任务</h3>
        <ChaotangButton
          className="ml-auto"
          disabled={isFetching}
          onClick={onRefresh}
        >
          {isFetching ? '正在读取任务状态…' : '重新读取状态'}
        </ChaotangButton>
      </div>
      {error && (
        <p role="alert" className="mt-base text-xs text-error">
          {error}
          {confirmed && ' 以下为上次已确认状态，当前进度暂未确认。'}
        </p>
      )}
      <dl className="mt-double grid gap-base sm:grid-cols-4">
        <Metric label="任务编号" value={jobId} mono />
        <Metric
          label={error && confirmed ? '上次已确认状态' : '办理状态'}
          value={status?.label ?? '尚未读取'}
        />
        <Metric label="办理阶段" value={confirmed?.stage ?? '尚未读取'} />
        <Metric
          label="模型请求次数"
          value={
            confirmed ? String(confirmed.providerRequestCount) : '尚未读取'
          }
        />
      </dl>
      {status?.notice && <p role="status" className="mt-base text-xs text-normal">{status.notice}</p>}
      {confirmed?.error && (
        <p role="alert" className="mt-base text-xs text-error">
          {confirmed.error.code} · {confirmed.error.stage} ·{' '}
          {confirmed.error.category}
        </p>
      )}
      {confirmed?.result && <ValidatedDecreeResult value={confirmed.result} />}
      {cancelError && (
        <p role="alert" className="mt-base text-xs text-error">
          取消请求未确认：{cancelError}。请重新读取状态后再决定是否重试。
        </p>
      )}
      {confirmed && ['QUEUED', 'RUNNING'].includes(confirmed.state) && (
        <ChaotangButton
          className="mt-base"
          disabled={isCancelling || confirmed.cancelRequested || Boolean(error)}
          onClick={onCancel}
        >
          {confirmed.cancelRequested
            ? '已请求取消，等待后端确认'
            : isCancelling
              ? '正在请求取消…'
              : '请求取消'}
        </ChaotangButton>
      )}
    </ChaotangPanel>
  );
}

function Metric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 border border-brand/15 bg-primary/35 p-base">
      <dt className="text-[9px] text-low">{label}</dt>
      <dd
        title={value}
        className={`mt-half truncate text-xs text-normal ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
