import type { DecreeJob, DecreeJobState } from '@/shared/providers/ChaotangProvider';

const labels: Record<DecreeJobState, string> = {
  QUEUED: '排队中', RUNNING: '执行中', SUCCEEDED: '办理完成',
  FAILED: '办理失败', CANCELLED: '已取消',
};

/** Presentation of a confirmed receipt only; never creates a new task state. */
export function decreeJobStatus(job: Pick<DecreeJob, 'state' | 'cancelRequested' | 'error'>) {
  if (job.state === 'FAILED' && ['external_execution_uncertain', 'gateway_cleanup_unconfirmed'].includes(job.error?.code ?? '')) {
    return {
      label: '外部执行待核对',
      notice: '尚未确认外部执行结束，未确认用量的预留额度仍保留。请勿重复发起；请管理员核对供应商执行与用量，再决定下一步。',
    };
  }
  if (['QUEUED', 'RUNNING'].includes(job.state) && job.cancelRequested) {
    return {
      label: '正在取消',
      notice: '取消请求已受理，正在核对最终状态；收尾阶段仍可能完成。确认前请勿重复发起。',
    };
  }
  return { label: labels[job.state], notice: null };
}
