import type {
  DecreeJob,
  DecreeWorkspace,
} from '@/shared/providers/ChaotangProvider';

const states: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function count(value: number | undefined): string {
  return Number.isSafeInteger(value) && value! >= 0 ? String(value) : '未知';
}

export function TaskInspector({
  job,
  workspace,
}: {
  job: DecreeJob;
  workspace?: DecreeWorkspace;
}) {
  const currentWorkspace =
    workspace?.jobId === job.jobId ? workspace : undefined;
  const agents = currentWorkspace?.agentsAvailable
    ? currentWorkspace.agents
    : undefined;
  const tools = currentWorkspace?.tools;
  const events = tools
    ? [...tools].sort((a, b) => a.sequence - b.sequence)
    : undefined;
  const names = new Map(agents?.map((agent) => [agent.id, agent.name]));
  const latestEvent = events?.at(-1);
  const cancelPending =
    job.cancelRequested && ['QUEUED', 'RUNNING'].includes(job.state);
  const progress = cancelPending
    ? [
        '已请求取消，正在核对最终状态',
        '取消请求已登记，但收尾阶段仍可能完成；请以后端最终状态为准。',
      ]
    : ({
        QUEUED: ['等待办理', '任务已排队，开始后会显示新的执行记录。'],
        RUNNING: [
          '正在办理',
          '可查看下方记录；需要停止时，使用下方的请求取消。任务可能已进入收尾阶段，取消不保证一定生效。',
        ],
        SUCCEEDED: [
          '执行已结束',
          job.result
            ? '请查看成果，并核对来源与验收状态。'
            : '成果尚未返回，请核对任务记录后重新读取任务。',
        ],
        FAILED: [
          '办理受阻',
          '请查看下方失败说明；如提供重试入口，修复原因后再重试。',
        ],
        CANCELLED: ['已取消', '本次办理已停止，可查看已有记录或新建任务。'],
      }[job.state] ?? ['状态待确认', '请重新读取任务后再决定下一步。']);

  return (
    <section
      aria-label="执行监察"
      className="space-y-base rounded border p-base"
    >
      <h3 className="text-lg text-high">办理进展</h3>
      <div className="space-y-half rounded bg-secondary p-base">
        <p className="text-lg text-high">{progress[0]}</p>
        <p>
          <span className="text-high">下一步：</span>
          {progress[1]}
        </p>
        {job.state === 'SUCCEEDED' && (
          <p className="text-low">执行结束不等于成果已验收或归档。</p>
        )}
      </div>
      {latestEvent && (
        <div className="space-y-half break-words">
          <p className="text-low">
            工具记录摘要（按序号） · 不代表当前分派或最近发生
          </p>
          <p>
            {names.get(latestEvent.agentId) ?? '执行智能体'} ·{' '}
            {latestEvent.name} · {states[latestEvent.state] ?? '状态待确认'}
          </p>
        </div>
      )}
      <details>
        <summary className="cursor-pointer rounded py-half text-high focus-visible:outline focus-visible:outline-brand">
          查看执行详情与用量说明
        </summary>
        <dl className="mt-base grid gap-base sm:grid-cols-2">
          <div>
            <dt>任务状态</dt>
            <dd>{states[job.state.toLowerCase()] ?? '状态待确认'}</dd>
          </div>
          <div>
            <dt>执行尝试</dt>
            <dd>{count(job.attemptCount)}</dd>
          </div>
          <div>
            <dt>模型请求</dt>
            <dd>{count(job.providerRequestCount)}</dd>
          </div>
          <div>
            <dt>协作智能体</dt>
            <dd>{agents ? agents.length : '未知'}</dd>
          </div>
          <div>
            <dt>工具记录</dt>
            <dd>{tools ? tools.length : '未知'}</dd>
          </div>
          <div>
            <dt>Token 与费用</dt>
            <dd>后端未提供</dd>
          </div>
        </dl>
        <p className="mt-base text-low">
          这里仅展示后端已记录的事实；未提供的用量与事件保持未知。
        </p>
      </details>
      <details>
        <summary className="cursor-pointer rounded py-half text-high focus-visible:outline focus-visible:outline-brand">
          查看执行记录
        </summary>
        {events?.length ? (
          <ol className="mt-base space-y-half">
            {events.map((event) => (
              <li key={event.id} className="break-words border-t pt-half">
                #{count(event.sequence)} ·{' '}
                {names.get(event.agentId) ?? '执行智能体'} · {event.name} ·{' '}
                {states[event.state] ?? '状态待确认'}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-base text-low">
            {events ? '暂无已记录的工具调用' : '工具记录尚未接入'}
          </p>
        )}
      </details>
    </section>
  );
}
