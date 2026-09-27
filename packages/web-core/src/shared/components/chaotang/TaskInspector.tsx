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

  return (
    <section
      aria-label="执行监察"
      className="space-y-base rounded border p-base"
    >
      <h3 className="text-lg text-high">执行监察</h3>
      <dl className="grid gap-base sm:grid-cols-2">
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
      {job.cancelRequested && <p>已请求取消，等待任务停止。</p>}
      <details>
        <summary className="cursor-pointer">查看执行记录</summary>
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
      <p className="text-low">
        这里仅展示后端已记录的事实；未提供的用量与事件保持未知。
      </p>
    </section>
  );
}
