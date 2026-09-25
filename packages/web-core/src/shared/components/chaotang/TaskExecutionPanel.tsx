import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useChaotangClient,
  useChaotangProvider,
  type DecreeDesktopResources,
} from '@/shared/providers/ChaotangProvider';
import {
  decodeTaskSessionHistory,
  taskSessionHistoryInput,
  type TaskSessionClient,
} from './taskSessionContract';
import {
  createTaskExecutionScopeGate,
  decodeTaskExecution,
  decodeTaskExecutionApprovals,
  taskApprovalResponseInput,
  taskExecutionError,
  taskExecutionReadInput,
  taskExecutionStartInput,
  type TaskApprovalDecision,
  type TaskApprovalInfo,
  type TaskExecution,
  type TaskExecutionClient,
  type TaskExecutionScope,
} from './taskExecutionContract';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand';
type Problem = ReturnType<typeof taskExecutionError>;
type Gate = ReturnType<typeof createTaskExecutionScopeGate>;
type Context = { gate: Gate; scope: TaskExecutionScope };
export type QuestionDraft = { question: string; answer: string };

export function TaskExecutionPanel({
  resources,
  connected,
}: {
  resources: DecreeDesktopResources;
  connected: boolean;
}) {
  const baseClient = useChaotangClient();
  const client = baseClient as typeof baseClient &
    Partial<TaskExecutionClient & TaskSessionClient>;
  const { user, authGeneration } = useChaotangProvider();
  const scope = useMemo<TaskExecutionScope | undefined>(
    () =>
      user
        ? {
            ownerId: user.id,
            generation: String(authGeneration),
            bindingId: resources.binding.bindingId,
            jobId: resources.jobId,
            workspaceId: resources.workspace.id,
            sessionId: resources.session.id,
            businessAttemptId: resources.binding.businessAttemptId,
          }
        : undefined,
    [
      authGeneration,
      resources.binding.bindingId,
      resources.binding.businessAttemptId,
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
        scope.businessAttemptId ?? '',
      ].join('\u0000')
    : '';
  const active = useRef<Context | null>(null);
  const refreshing = useRef(false);
  const [prompt, setPrompt] = useState('');
  const [execution, setExecution] = useState<TaskExecution>();
  const [approvals, setApprovals] = useState<TaskApprovalInfo[]>([]);
  const [questionDrafts, setQuestionDrafts] = useState<
    Record<string, QuestionDraft>
  >({});
  const [problem, setProblem] = useState<Problem>();
  const [busy, setBusy] = useState(false);
  const supported = Boolean(
    client.startTaskExecution &&
      client.readTaskExecution &&
      client.cancelTaskExecution &&
      client.taskExecutionApprovals &&
      client.respondTaskExecutionApproval
  );

  const loadApprovals = useCallback(
    async (context: Context, executionId: string) => {
      if (!client.taskExecutionApprovals) return;
      const ticket = context.gate.begin();
      const input = taskExecutionReadInput({
        jobId: context.scope.jobId,
        executionId,
      });
      const settled = await context.gate.settle(
        ticket,
        client.taskExecutionApprovals(input),
        (value) =>
          decodeTaskExecutionApprovals(value, ticket.scope, executionId)
      );
      if (settled.status === 'accepted') {
        setApprovals(settled.value.entries);
        setQuestionDrafts((current) =>
          Object.fromEntries(
            settled.value.entries
              .filter((entry) => entry.isQuestion)
              .map((entry) => [
                entry.approvalId,
                current[entry.approvalId] ?? { question: '', answer: '' },
              ])
          )
        );
      }
      if (settled.status === 'error')
        setProblem(taskExecutionError(settled.error));
    },
    [client]
  );

  const loadExecution = useCallback(
    async (context: Context, executionId: string) => {
      if (!client.readTaskExecution || refreshing.current) return;
      refreshing.current = true;
      try {
        const ticket = context.gate.begin();
        const input = taskExecutionReadInput({
          jobId: context.scope.jobId,
          executionId,
        });
        const settled = await context.gate.settle(
          ticket,
          client.readTaskExecution(input),
          (value) => decodeTaskExecution(value, ticket.scope)
        );
        if (settled.status === 'accepted') {
          setExecution(settled.value);
          setProblem(undefined);
          if (settled.value.state === 'running')
            await loadApprovals(context, settled.value.executionId);
          else setApprovals([]);
        }
        if (settled.status === 'error')
          setProblem(taskExecutionError(settled.error));
      } finally {
        refreshing.current = false;
      }
    },
    [client, loadApprovals]
  );

  const recoverLatest = useCallback(
    async (context: Context) => {
      if (!client.taskSessionHistory || !client.readTaskExecution) return;
      const ticket = context.gate.begin();
      const settled = await context.gate.settle(
        ticket,
        client.taskSessionHistory(
          taskSessionHistoryInput({ jobId: context.scope.jobId })
        ),
        (value) => decodeTaskSessionHistory(value, ticket.scope)
      );
      if (settled.status === 'accepted') {
        const latest = settled.value.entries
          .slice()
          .reverse()
          .find((entry) => entry.kind === 'codingagent');
        if (latest) await loadExecution(context, latest.eventId);
      }
      if (settled.status === 'error')
        setProblem(taskExecutionError(settled.error));
    },
    [client, loadExecution]
  );

  useEffect(() => {
    active.current?.gate.dispose();
    active.current = null;
    refreshing.current = false;
    setExecution(undefined);
    setApprovals([]);
    setQuestionDrafts({});
    setProblem(undefined);
    if (!scope || !supported) return;
    const context = { gate: createTaskExecutionScopeGate(scope), scope };
    active.current = context;
    void recoverLatest(context);
    return () => {
      context.gate.dispose();
      if (active.current === context) active.current = null;
    };
  }, [recoverLatest, scopeKey, supported]);

  useEffect(() => {
    if (execution?.state !== 'running') return;
    const timer = window.setInterval(() => {
      const context = active.current;
      if (context) void loadExecution(context, execution.executionId);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [execution?.executionId, execution?.state, loadExecution]);

  const start = useCallback(async () => {
    const context = active.current;
    if (!context || !client.startTaskExecution || busy) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const ticket = context.gate.begin();
      const input = taskExecutionStartInput({
        jobId: context.scope.jobId,
        prompt,
      });
      const settled = await context.gate.settle(
        ticket,
        client.startTaskExecution(input),
        (value) => decodeTaskExecution(value, ticket.scope)
      );
      if (settled.status === 'accepted') {
        setExecution(settled.value);
        setPrompt('');
        await loadApprovals(context, settled.value.executionId);
      }
      if (settled.status === 'error')
        setProblem(taskExecutionError(settled.error));
    } catch (error) {
      setProblem(taskExecutionError(error));
    } finally {
      setBusy(false);
    }
  }, [busy, client, loadApprovals, prompt]);

  const cancel = useCallback(async () => {
    const context = active.current;
    if (!context || !execution || !client.cancelTaskExecution || busy) return;
    setBusy(true);
    setProblem(undefined);
    try {
      const ticket = context.gate.begin();
      const input = taskExecutionReadInput({
        jobId: context.scope.jobId,
        executionId: execution.executionId,
      });
      const settled = await context.gate.settle(
        ticket,
        client.cancelTaskExecution(input),
        (value) => decodeTaskExecution(value, ticket.scope)
      );
      if (settled.status === 'accepted') {
        setExecution(settled.value);
        setApprovals([]);
      }
      if (settled.status === 'error')
        setProblem(taskExecutionError(settled.error));
    } finally {
      setBusy(false);
    }
  }, [busy, client, execution]);

  const respond = useCallback(
    async (approval: TaskApprovalInfo, response: TaskApprovalDecision) => {
      const context = active.current;
      if (
        !context ||
        !execution ||
        !client.respondTaskExecutionApproval ||
        busy
      )
        return;
      setBusy(true);
      setProblem(undefined);
      try {
        const input = taskApprovalResponseInput({
          jobId: context.scope.jobId,
          executionId: execution.executionId,
          approvalId: approval.approvalId,
          response,
        });
        const ticket = context.gate.begin();
        const settled = await context.gate.settle(
          ticket,
          client.respondTaskExecutionApproval(input),
          () => true
        );
        if (settled.status === 'accepted') {
          await loadApprovals(context, execution.executionId);
          await loadExecution(context, execution.executionId);
        }
        if (settled.status === 'error')
          setProblem(taskExecutionError(settled.error));
      } catch (error) {
        setProblem(taskExecutionError(error));
      } finally {
        setBusy(false);
      }
    },
    [busy, client, execution, loadApprovals, loadExecution]
  );

  return (
    <TaskExecutionView
      supported={supported}
      connected={connected}
      busy={busy}
      prompt={prompt}
      execution={execution}
      approvals={approvals}
      questionDrafts={questionDrafts}
      problem={problem}
      onPromptChange={setPrompt}
      onStart={() => void start()}
      onReload={() => {
        const context = active.current;
        if (!context) return;
        if (execution) void loadExecution(context, execution.executionId);
        else void recoverLatest(context);
      }}
      onCancel={() => void cancel()}
      onApprove={(approval) => void respond(approval, { decision: 'approve' })}
      onDeny={(approval) =>
        void respond(approval, {
          decision: 'deny',
          reason: '用户在朝堂技术工作区拒绝本次工具调用',
        })
      }
      onQuestionDraftChange={(approvalId, draft) =>
        setQuestionDrafts((current) => ({ ...current, [approvalId]: draft }))
      }
      onAnswer={(approval) => {
        const draft = questionDrafts[approval.approvalId];
        if (!draft?.question.trim() || !draft.answer.trim()) {
          setProblem({ kind: 'error', message: '请填写问题原文和答案。' });
          return;
        }
        void respond(approval, {
          decision: 'answer',
          answers: [
            {
              question: draft.question.trim(),
              answer: [draft.answer.trim()],
            },
          ],
        });
      }}
    />
  );
}

const stateLabels: Record<TaskExecution['state'], string> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  killed: '已停止',
};

export function TaskExecutionView({
  supported,
  connected,
  busy,
  prompt,
  execution,
  approvals,
  questionDrafts,
  problem,
  onPromptChange,
  onStart,
  onReload,
  onCancel,
  onApprove,
  onDeny,
  onQuestionDraftChange,
  onAnswer,
}: {
  supported: boolean;
  connected: boolean;
  busy?: boolean;
  prompt: string;
  execution?: TaskExecution;
  approvals: TaskApprovalInfo[];
  questionDrafts: Record<string, QuestionDraft>;
  problem?: Problem;
  onPromptChange: (value: string) => void;
  onStart: () => void;
  onReload: () => void;
  onCancel: () => void;
  onApprove: (approval: TaskApprovalInfo) => void;
  onDeny: (approval: TaskApprovalInfo) => void;
  onQuestionDraftChange: (approvalId: string, draft: QuestionDraft) => void;
  onAnswer: (approval: TaskApprovalInfo) => void;
}) {
  const running = execution?.state === 'running';
  return (
    <section
      aria-label="任务受监督执行"
      className="space-y-base rounded border p-base"
    >
      <div className="flex items-center justify-between gap-base">
        <div>
          <h3 className="text-lg text-high">任务执行</h3>
          <p className="text-low">
            在当前任务目录和绑定会话中运行受监督 Codex；工具调用逐次审批。
          </p>
        </div>
        <button
          type="button"
          className={button}
          disabled={!supported || !connected || busy}
          onClick={onReload}
        >
          刷新
        </button>
      </div>
      {!supported ? (
        <p>当前客户端暂不支持任务执行。</p>
      ) : (
        <>
          <label className="block space-y-half">
            <span className="text-low">输入本任务需要完成的技术工作</span>
            <textarea
              className="min-h-24 w-full rounded border bg-primary p-half"
              value={prompt}
              maxLength={65_536}
              disabled={!connected || running || busy}
              onChange={(event) => onPromptChange(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-half">
            <button
              type="button"
              className={button}
              disabled={!connected || running || busy || !prompt.trim()}
              onClick={onStart}
            >
              {busy && !running ? '正在启动…' : '启动受监督执行'}
            </button>
            {running && (
              <button
                type="button"
                className={button}
                disabled={!connected || busy}
                onClick={onCancel}
              >
                停止执行
              </button>
            )}
          </div>
          {problem && (
            <p role="alert" className="text-error">
              {problem.message}
            </p>
          )}
          {execution ? (
            <div className="space-y-base">
              <p role="status">{stateLabels[execution.state]} · 受监督工作区</p>
              <p className="break-all text-low">
                执行 {execution.executionId} · 开始 {execution.startedAt}
                {execution.completedAt
                  ? ` · 结束 ${execution.completedAt}`
                  : ''}
                {execution.exitCode === null
                  ? ''
                  : ` · 退出码 ${execution.exitCode}`}
              </p>
              <p className="break-all text-low">
                业务执行追踪：
                {execution.businessAttemptId ??
                  '本次技术执行未关联业务 attempt'}
              </p>
              {execution.entries.length === 0 ? (
                <p className="text-low">正在等待执行输出。</p>
              ) : (
                <ol aria-label="执行输出" className="space-y-half">
                  {execution.entries.map((entry, index) => (
                    <li
                      key={`${entry.kind}-${index}`}
                      className="rounded border p-half"
                    >
                      <p className="text-low">
                        {entry.kind === 'stderr' ? '错误输出' : '执行输出'}
                      </p>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">
                        {entry.text}
                      </pre>
                    </li>
                  ))}
                </ol>
              )}
              {execution.truncated && (
                <p className="text-low">输出较多，仅显示最近的受限记录。</p>
              )}
            </div>
          ) : (
            <p role="status" className="text-low">
              当前会话尚无可恢复的 Codex 执行。
            </p>
          )}
          {approvals.length > 0 && (
            <section aria-label="待处理工具审批" className="space-y-half">
              <h4 className="text-high">待处理审批</h4>
              {approvals.map((approval) => {
                const draft = questionDrafts[approval.approvalId] ?? {
                  question: '',
                  answer: '',
                };
                return (
                  <div
                    key={approval.approvalId}
                    className="space-y-half rounded border p-half"
                  >
                    <p className="break-all">{approval.toolName}</p>
                    <p className="text-low">本次执行专用，超时后自动失效。</p>
                    {approval.isQuestion ? (
                      <>
                        <label className="block">
                          <span className="text-low">问题原文</span>
                          <input
                            className="w-full rounded border bg-primary p-half"
                            value={draft.question}
                            disabled={busy}
                            onChange={(event) =>
                              onQuestionDraftChange(approval.approvalId, {
                                ...draft,
                                question: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-low">答案</span>
                          <textarea
                            className="min-h-16 w-full rounded border bg-primary p-half"
                            value={draft.answer}
                            disabled={busy}
                            onChange={(event) =>
                              onQuestionDraftChange(approval.approvalId, {
                                ...draft,
                                answer: event.target.value,
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className={button}
                          disabled={busy || !connected}
                          onClick={() => onAnswer(approval)}
                        >
                          提交答案
                        </button>
                      </>
                    ) : (
                      <div className="flex gap-half">
                        <button
                          type="button"
                          className={button}
                          disabled={busy || !connected}
                          onClick={() => onApprove(approval)}
                        >
                          允许一次
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy || !connected}
                          onClick={() => onDeny(approval)}
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </section>
  );
}
