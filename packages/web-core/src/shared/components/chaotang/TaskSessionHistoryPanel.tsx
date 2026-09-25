import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useChaotangClient,
  useChaotangProvider,
  type DecreeDesktopResources,
} from '@/shared/providers/ChaotangProvider';
import {
  createTaskSessionScopeGate,
  decodeTaskSessionHistory,
  taskSessionError,
  taskSessionHistoryInput,
  type TaskSessionClient,
  type TaskSessionEvent,
  type TaskSessionHistory,
  type TaskSessionScope,
} from './taskSessionContract';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand';
type Problem = ReturnType<typeof taskSessionError>;
type Gate = ReturnType<typeof createTaskSessionScopeGate>;

export function TaskSessionHistoryPanel({
  resources,
  connected,
}: {
  resources: DecreeDesktopResources;
  connected: boolean;
}) {
  const baseClient = useChaotangClient();
  const client = baseClient as typeof baseClient & Partial<TaskSessionClient>;
  const { user, authGeneration } = useChaotangProvider();
  const scope = useMemo<TaskSessionScope | undefined>(
    () =>
      user
        ? {
            ownerId: user.id,
            generation: String(authGeneration),
            bindingId: resources.binding.bindingId,
            jobId: resources.jobId,
            workspaceId: resources.workspace.id,
            sessionId: resources.session.id,
          }
        : undefined,
    [
      authGeneration,
      resources.binding.bindingId,
      resources.jobId,
      resources.session.id,
      resources.workspace.id,
      user,
    ]
  );
  const scopeKey = scope
    ? [
        scope.ownerId,
        scope.generation,
        scope.bindingId,
        scope.jobId,
        scope.workspaceId,
        scope.sessionId,
      ].join('\u0000')
    : '';
  const active = useRef<{ gate: Gate; scope: TaskSessionScope } | null>(null);
  const [history, setHistory] = useState<{
    loading?: boolean;
    data?: TaskSessionHistory;
    problem?: Problem;
  }>({});
  const supported = Boolean(client.taskSessionHistory);

  const load = useCallback(
    async (context = active.current) => {
      if (!context || !client.taskSessionHistory) return;
      const ticket = context.gate.begin();
      setHistory({ loading: true });
      const input = taskSessionHistoryInput({ jobId: context.scope.jobId });
      const settled = await context.gate.settle(
        ticket,
        client.taskSessionHistory(input),
        (value) => decodeTaskSessionHistory(value, ticket.scope)
      );
      if (settled.status === 'accepted') setHistory({ data: settled.value });
      if (settled.status === 'error')
        setHistory({ problem: taskSessionError(settled.error) });
    },
    [client]
  );

  useEffect(() => {
    active.current?.gate.dispose();
    active.current = null;
    setHistory({});
    if (!scope || !supported) return;
    const context = { gate: createTaskSessionScopeGate(scope), scope };
    active.current = context;
    void load(context);
    return () => {
      context.gate.dispose();
      if (active.current === context) active.current = null;
    };
  }, [load, scopeKey, supported]);

  return (
    <TaskSessionHistoryView
      supported={supported}
      connected={connected}
      loading={history.loading}
      problem={history.problem}
      entries={history.data?.entries ?? []}
      truncated={history.data?.truncated}
      onReload={() => void load()}
    />
  );
}

const kindLabels: Record<TaskSessionEvent['kind'], string> = {
  setupscript: '环境准备',
  cleanupscript: '环境清理',
  archivescript: '任务归档',
  codingagent: '智能体执行',
  devserver: '预览服务',
};
const stateLabels: Record<TaskSessionEvent['state'], string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  killed: '已停止',
};

export function TaskSessionHistoryView({
  supported,
  connected,
  loading,
  problem,
  entries,
  truncated,
  onReload,
}: {
  supported: boolean;
  connected: boolean;
  loading?: boolean;
  problem?: Problem;
  entries: TaskSessionEvent[];
  truncated?: boolean;
  onReload: () => void;
}) {
  return (
    <section
      aria-label="任务会话记录"
      className="space-y-base rounded border p-base"
    >
      <div className="flex items-center justify-between gap-base">
        <div>
          <h3 className="text-lg text-high">会话记录</h3>
          <p className="text-low">来自当前任务绑定会话的真实执行历史。</p>
        </div>
        <button
          type="button"
          className={button}
          disabled={!supported || !connected || loading}
          onClick={onReload}
        >
          重新读取
        </button>
      </div>
      {!supported ? (
        <p>当前客户端暂不支持会话记录。</p>
      ) : loading ? (
        <p role="status">正在读取会话记录…</p>
      ) : problem ? (
        <p role="alert" className="text-error">
          {problem.message}
        </p>
      ) : entries.length === 0 ? (
        <p role="status">该会话尚无执行记录。</p>
      ) : (
        <ol className="space-y-half">
          {entries.map((entry) => (
            <li key={entry.eventId} className="rounded border p-half">
              <p className="text-high">
                {kindLabels[entry.kind]} · {stateLabels[entry.state]}
              </p>
              <p className="text-low">
                开始 {entry.startedAt}
                {entry.completedAt ? ` · 完成 ${entry.completedAt}` : ''}
                {entry.exitCode === null ? '' : ` · 退出码 ${entry.exitCode}`}
              </p>
            </li>
          ))}
        </ol>
      )}
      {truncated && <p className="text-low">记录较多，仅显示最近 200 条。</p>}
    </section>
  );
}
