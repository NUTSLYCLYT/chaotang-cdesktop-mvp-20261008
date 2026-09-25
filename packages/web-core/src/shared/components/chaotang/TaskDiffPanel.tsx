import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useChaotangClient,
  useChaotangProvider,
  type DecreeDesktopResources,
} from '@/shared/providers/ChaotangProvider';
import {
  createTaskDiffScopeGate,
  decodeTaskDiff,
  taskDiffError,
  taskDiffInput,
  type TaskDiff,
  type TaskDiffClient,
  type TaskDiffEntry,
  type TaskDiffScope,
} from './taskDiffContract';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand';
type Problem = ReturnType<typeof taskDiffError>;
type Gate = ReturnType<typeof createTaskDiffScopeGate>;

export function TaskDiffPanel({
  resources,
  connected,
}: {
  resources: DecreeDesktopResources;
  connected: boolean;
}) {
  const baseClient = useChaotangClient();
  const client = baseClient as typeof baseClient & Partial<TaskDiffClient>;
  const { user, authGeneration } = useChaotangProvider();
  const scope = useMemo<TaskDiffScope | undefined>(
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
  const active = useRef<{ gate: Gate; scope: TaskDiffScope } | null>(null);
  const [result, setResult] = useState<{
    loading?: boolean;
    data?: TaskDiff;
    problem?: Problem;
  }>({});
  const supported = Boolean(client.taskDiff);

  const load = useCallback(
    async (context = active.current) => {
      if (!context || !client.taskDiff) return;
      const ticket = context.gate.begin();
      setResult({ loading: true });
      const input = taskDiffInput({ jobId: context.scope.jobId });
      const settled = await context.gate.settle(
        ticket,
        client.taskDiff(input),
        (value) => decodeTaskDiff(value, ticket.scope)
      );
      if (settled.status === 'accepted') setResult({ data: settled.value });
      if (settled.status === 'error')
        setResult({ problem: taskDiffError(settled.error) });
    },
    [client]
  );

  useEffect(() => {
    active.current?.gate.dispose();
    active.current = null;
    setResult({});
    if (!scope || !supported) return;
    const context = { gate: createTaskDiffScopeGate(scope), scope };
    active.current = context;
    void load(context);
    return () => {
      context.gate.dispose();
      if (active.current === context) active.current = null;
    };
  }, [load, scopeKey, supported]);

  return (
    <TaskDiffView
      supported={supported}
      connected={connected}
      loading={result.loading}
      problem={result.problem}
      data={result.data}
      onReload={() => void load()}
    />
  );
}

const changeLabels: Record<TaskDiffEntry['change'], string> = {
  added: '新增',
  deleted: '已删除',
  modified: '已修改',
  renamed: '已重命名',
  copied: '已复制',
  type_changed: '类型变化',
  conflicted: '存在冲突',
  unreadable: '无法读取',
};

export function TaskDiffView({
  supported,
  connected,
  loading,
  problem,
  data,
  onReload,
}: {
  supported: boolean;
  connected: boolean;
  loading?: boolean;
  problem?: Problem;
  data?: TaskDiff;
  onReload: () => void;
}) {
  return (
    <section
      aria-label="任务真实差异"
      className="space-y-base rounded border p-base"
    >
      <div className="flex items-center justify-between gap-base">
        <div>
          <h3 className="text-lg text-high">任务差异</h3>
          <p className="text-low">相对于当前任务 Git 基线的真实未提交变更。</p>
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
        <p>当前客户端暂不支持任务差异。</p>
      ) : loading ? (
        <p role="status">正在读取真实差异…</p>
      ) : problem ? (
        <p role="alert" className="text-error">
          {problem.message}
        </p>
      ) : !data ? (
        <p role="status">等待读取任务差异。</p>
      ) : data.state === 'not_git_repository' ? (
        <p role="status">当前任务目录不是 Git 仓库。</p>
      ) : data.state === 'no_baseline' ? (
        <p role="status">当前 Git 仓库尚无基线提交。</p>
      ) : data.state === 'clean' ? (
        <p role="status">当前任务相对基线没有未提交变更。</p>
      ) : (
        <>
          <p className="text-low break-all">
            基线 {data.branch ?? 'HEAD'} · {data.head?.slice(0, 12)}
          </p>
          <ul className="space-y-half">
            {data.entries.map((entry) => (
              <li key={entry.path} className="rounded border p-half break-all">
                <span>{changeLabels[entry.change]}</span> · {entry.path}
                {entry.oldPath ? ` · 原路径 ${entry.oldPath}` : ''}
                {entry.binary ? ' · 二进制' : ''}
              </li>
            ))}
          </ul>
          {data.patch && (
            <details>
              <summary>查看受限补丁</summary>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border p-half text-sm">
                {data.patch}
              </pre>
            </details>
          )}
          {data.truncated && (
            <p className="text-low">差异较多或补丁较大，显示内容已截断。</p>
          )}
        </>
      )}
    </section>
  );
}
