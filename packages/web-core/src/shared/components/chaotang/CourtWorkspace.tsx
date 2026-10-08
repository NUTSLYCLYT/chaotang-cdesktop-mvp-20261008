import { FilesIcon, UsersThreeIcon, BookOpenIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { TaskDesktopResources } from './TaskDesktopResources';
import { TaskInspector } from './TaskInspector';
import { TaskDeliveryReview } from './TaskDeliveryReview';
import { decreeJobStatus } from './decreeJobStatus';
import {
  confirmStudyIntent,
  isStudyIntentCurrent,
  prepareConfirmedStudyDraft,
  type ConfirmedStudyIntent,
} from './studyIntentConfirmation';
import {
  createArtifactTransfer,
  canArchiveHistory,
  canRetryTask,
  filterTaskHistory,
  taskTitle,
  type ArtifactTransferResult,
} from './taskWorkspaceState';
import {
  useChaotangClient,
  type DecreeJob,
  type DecreeWorkspace,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';
import {
  useChancellorConsult,
  useChancellorDraft,
  useIssueChancellorDecree,
  useDecreeJob,
  useCancelDecreeJob,
  useRetryDecreeJob,
  useDecreeWorkspace,
} from '@/shared/hooks/chaotang/useChancellor';
import {
  useDecreeJobs,
  useSetDecreeHistoryArchived,
} from '@/shared/hooks/chaotang/useDecreeJobs';
import {
  decreeIdempotencyKey,
  parseDecreeResult,
  projectDraftAcceptance,
} from '@/shared/lib/chaotangFusion';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary';
const input =
  'w-full rounded border bg-secondary p-base text-normal focus:ring-1 focus:ring-brand';

type HistoryView = {
  search: string;
  q: string;
  offset: number;
  archived: 'active' | 'archived' | 'all';
  state: string;
};
const emptyHistory: HistoryView = {
  search: '',
  q: '',
  offset: 0,
  archived: 'active',
  state: 'ALL',
};

const taskErrors: Record<string, string> = {
  cancelled: '任务已取消',
  deadline_exceeded: '任务办理超时',
  provider_budget_exceeded: '模型请求预算已用完',
  token_budget_transport_unavailable:
    '本次未开始模型生成：任务预算与模型配置尚未接通。请管理员修复后再点“修复后重试”；原批准范围和累计用量会保留。',
  gateway_cleanup_unconfirmed:
    '执行连接尚未确认关闭，请管理员核对后处理。为避免重复执行，此任务暂不提供重试。',
  execution_mode_incompatible:
    '这是旧执行方式的任务，当前服务不能直接接续。原记录保留；如需重新办理，请回上书房核对范围并重新确认。',
  provider_failed: '模型服务调用失败',
  retry_exhausted: '已达到重试上限，请检查原因后再处理',
  accounting_source_unavailable: '所需会计资料不可用',
  format_unrecognized: '资料格式无法识别',
  tool_unavailable: '所需工具不可用',
  source_not_found: '未找到所需资料',
  validation_failed: '结果未通过校验',
  model_failed: '模型未返回有效结果',
  artifact_failed: '成果生成或发布失败',
  job_failed: '任务办理失败',
};
const agentStates: Record<string, string> = {
  queued: '排队中',
  pending: '等待中',
  waiting: '等待中',
  running: '运行中',
  succeeded: '已完成',
  completed: '已完成',
  failed: '失败',
  blocked: '等待处理',
  cancelled: '已取消',
};

const agentRoles: Record<string, string> = {
  minister: '部门主办',
  subagent: '子智能体',
};

const stateReasons: Record<string, string> = {
  execution_ended_without_completion: '任务已结束，未收到完成记录',
  execution_cancelled: '任务已取消',
};

const terminalJobStates = ['SUCCEEDED', 'FAILED', 'CANCELLED'];
const jobStateLabels: Record<string, string> = {
  SUCCEEDED: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
};

export function CancelRequestControl({
  job,
  receipt,
  isPending,
  error,
  connected,
  onCancel,
}: {
  job: Pick<DecreeJob, 'jobId' | 'state' | 'cancelRequested'>;
  receipt?: Pick<DecreeJob, 'jobId' | 'state' | 'cancelRequested'>;
  isPending: boolean;
  error?: string;
  connected: boolean;
  onCancel: () => void;
}) {
  if (!['QUEUED', 'RUNNING'].includes(job.state)) return null;
  const matched = receipt?.jobId === job.jobId ? receipt : undefined;
  return (
    <>
      <button
        className={button}
        disabled={!connected || isPending || job.cancelRequested}
        onClick={onCancel}
      >
        {isPending
          ? '正在请求取消…'
          : job.cancelRequested
            ? '已请求取消，正在核对最终状态'
            : '请求取消'}
      </button>
      {isPending && (
        <p role="status">取消请求已发出，等待后端受理，请勿重复点击。</p>
      )}
      {!isPending && error && (
        <p role="alert" className="text-error">
          取消请求未确认：{error}。请重新读取任务状态后再决定。
        </p>
      )}
      {!isPending &&
        !error &&
        matched &&
        (terminalJobStates.includes(matched.state) ? (
          <p role="status">
            {`后端已确认任务结束：${jobStateLabels[matched.state] ?? matched.state}。`}
          </p>
        ) : matched.cancelRequested ? (
          <p role="status">
            取消请求已受理，正在核对最终状态；收尾阶段仍可能完成，请以后端最终状态为准。
          </p>
        ) : (
          <p role="status">
            后端回执尚未登记取消标志；请重新读取任务状态确认是否受理。
          </p>
        ))}
    </>
  );
}

export function CourtWorkspace({
  selectedJobId,
  onSelectJob,
  embedded = false,
  scrollPresentation = false,
}: {
  selectedJobId?: string;
  onSelectJob: (id?: string, replace?: boolean) => void;
  embedded?: boolean;
  scrollPresentation?: boolean;
}) {
  const {
    user,
    health,
    login,
    logout,
    authError,
    error,
    logoutNotice,
    isLoggingOut,
  } = useChaotangProvider();
  const previousOwner = useRef<string>();
  const [historyView, setHistoryView] = useState<{
    owner?: string;
    value: HistoryView;
  }>({ value: emptyHistory });
  const history =
    historyView.owner === user?.id ? historyView.value : emptyHistory;
  const updateHistory = (patch: Partial<HistoryView>) =>
    setHistoryView((current) => ({
      owner: user?.id,
      value: {
        ...(current.owner === user?.id ? current.value : emptyHistory),
        ...patch,
      },
    }));
  useEffect(() => {
    if (previousOwner.current && previousOwner.current !== user?.id) {
      onSelectJob(undefined, true);
      setHistoryView({ owner: user?.id, value: emptyHistory });
    }
    previousOwner.current = user?.id;
  }, [user?.id, onSelectJob]);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <div className="court-task-root flex h-full min-h-0 flex-col bg-primary text-base text-normal">
      {!embedded && (
        <header className="flex flex-wrap items-center justify-between gap-base border-b p-base">
          <div>
            <h1 className="text-xl text-high">朝堂工作区</h1>
            <p className="text-low">咨询 → 拟旨 → 明确确认 → 办理与成果</p>
          </div>
          {user && (
            <div>
              {user.username}{' '}
              <button
                className={button}
                onClick={() => void logout().catch(() => undefined)}
              >
                退出朝堂账户
              </button>
            </div>
          )}
        </header>
      )}
      {!health && (
        <p role="alert" className="p-base text-error">
          {error ?? '正在检查朝堂连接'}
        </p>
      )}
      {!user ? (
        <form
          className="max-w-md space-y-base p-double"
          onSubmit={(event) => {
            event.preventDefault();
            if (isLoggingOut) return;
            setPending(true);
            void login(identifier, password)
              .then(() => setPassword(''))
              .catch(() => undefined)
              .finally(() => setPending(false));
          }}
        >
          <h2 className="text-lg">登录朝堂账户</h2>
          {isLoggingOut && <p role="status">正在退出账户并确认会话状态…</p>}
          {logoutNotice && (
            <p role="alert" className="text-error">
              {logoutNotice}
            </p>
          )}
          <label className="block">
            用户名或邮箱
            <input
              required
              autoComplete="username"
              className={input}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </label>
          <label className="block">
            密码
            <input
              required
              type="password"
              autoComplete="current-password"
              className={input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {authError && (
            <p role="alert" className="text-error">
              {authError}
            </p>
          )}
          <button
            disabled={pending || isLoggingOut || !health}
            className={button}
          >
            {pending ? '登录中…' : '登录'}
          </button>
        </form>
      ) : (
        <CourtSession
          key={`${user.id}:${selectedJobId ?? 'new'}`}
          owner={user.id}
          jobId={selectedJobId}
          onSelectJob={onSelectJob}
          connected={Boolean(health)}
          history={history}
          updateHistory={updateHistory}
          scrollPresentation={scrollPresentation}
        />
      )}
    </div>
  );
}

function CourtSession({
  owner,
  connected,
  jobId,
  onSelectJob,
  history,
  updateHistory,
  scrollPresentation,
}: {
  owner: string;
  connected: boolean;
  jobId?: string;
  onSelectJob: (id?: string, replace?: boolean) => void;
  history: HistoryView;
  updateHistory: (patch: Partial<HistoryView>) => void;
  scrollPresentation: boolean;
}) {
  const [objective, setObjective] = useState('');
  const [confirmedIntent, setConfirmedIntent] =
    useState<ConfirmedStudyIntent | null>(null);
  const [draftIntent, setDraftIntent] = useState<ConfirmedStudyIntent | null>(
    null
  );
  const contextGeneration = useRef(0);
  const consultationGeneration = useRef(0);
  const authorizationEpoch = useRef(0);
  const renderedEpoch = authorizationEpoch.current;
  const [approved, setApproved] = useState(false);
  const setJobId = (id?: string) => onSelectJob(id);
  const taskHeading = useRef<HTMLHeadingElement>(null);
  const objectiveInput = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    (jobId ? taskHeading.current : objectiveInput.current)?.focus();
  }, [jobId]);
  const [version, setVersion] = useState(1);
  const [issueError, setIssueError] = useState<string>();
  const consult = useChancellorConsult();
  const draft = useChancellorDraft();
  const issue = useIssueChancellorDecree();
  const jobs = useDecreeJobs({
    q: history.q,
    offset: history.offset,
    limit: 50,
    archived: history.archived,
  });
  const archive = useSetDecreeHistoryArchived();
  const job = useDecreeJob(jobId);
  const workspace = useDecreeWorkspace(jobId);
  const cancel = useCancelDecreeJob();
  const retry = useRetryDecreeJob();
  const currentIntent = {
    ownerId: owner,
    normalizedOriginalGoal: objective,
    exactLatestChancellorRestatement: consult.data?.reply ?? '',
    consultationGeneration: consultationGeneration.current,
    contextGeneration: contextGeneration.current,
  };
  const confirmed = isStudyIntentCurrent(confirmedIntent, currentIntent);
  const draftIsCurrent = confirmed && draftIntent === confirmedIntent;
  const invalidateApproval = () => {
    ++authorizationEpoch.current;
    setConfirmedIntent(null);
    setDraftIntent(null);
    setApproved(false);
    draft.reset();
    issue.reset();
    setIssueError(undefined);
  };
  useEffect(() => {
    if (confirmedIntent && !confirmed) {
      ++authorizationEpoch.current;
      setConfirmedIntent(null);
      setDraftIntent(null);
      setApproved(false);
      draft.reset();
      issue.reset();
      setIssueError('丞相理解或目标已变化，请重新确认后拟旨。');
    }
  }, [confirmedIntent, confirmed, draft, issue]);
  const busy = consult.isPending || draft.isPending || issue.isPending;
  const error =
    issueError ??
    consult.error?.message ??
    draft.error?.message ??
    issue.error?.message;
  const canIssue =
    draftIsCurrent &&
    approved &&
    draft.data?.status === 'DRAFT_READY' &&
    Boolean(draft.data.decreeText) &&
    !issue.data;
  const newTask = () => {
    ++contextGeneration.current;
    invalidateApproval();
    setObjective('');
    consult.reset();
    cancel.reset();
    retry.reset();
    setIssueError(undefined);
    setJobId(undefined);
  };
  const visibleJobs = filterTaskHistory(
    jobs.data?.items ?? [],
    '',
    history.state
  );
  const HistoryContainer = scrollPresentation ? 'details' : 'div';
  const ResourceContainer = scrollPresentation ? 'details' : 'div';
  const workspaceCards = (
    <WorkspaceCards
      key={jobId ?? 'new'}
      loading={Boolean(jobId) && workspace.isLoading}
      onRetry={() => void workspace.refetch()}
      result={job.data?.result}
      objective={objective}
      hasSelectedJob={Boolean(jobId)}
      workspace={workspace.data}
      error={workspace.error?.message}
    />
  );
  return (
    <div className="court-task-layout grid min-h-0 flex-1 overflow-auto lg:grid-cols-[minmax(0,1fr)_360px]">
      <main className="court-task-main space-y-base overflow-auto p-double">
        <button className={button} disabled={busy} onClick={newTask}>
          新建任务
        </button>
        {!connected && (
          <p role="alert" className="text-error">
            朝堂连接不可用，请恢复连接后继续；任务读取结果可能已过期。
          </p>
        )}
        {jobId ? (
          <section className="space-y-base border-t pt-base">
            <h2 ref={taskHeading} tabIndex={-1} className="text-xl text-high">
              {job.data
                ? taskTitle(job.data)
                : job.error
                  ? '任务读取失败'
                  : '正在读取任务'}
            </h2>
            <details className="text-low">
              <summary className="cursor-pointer py-half">
                任务编号与技术状态
              </summary>
              <p className="break-all">任务：{jobId}</p>
              {job.data && (
                <p>
                  {job.data.state} · {job.data.stage}
                </p>
              )}
            </details>
            {job.isLoading && <p>读取任务中…</p>}
            {job.error && (
              <p role="alert" className="text-error">
                {job.error.message}
                <button className={button} onClick={() => void job.refetch()}>
                  重新读取任务
                </button>
              </p>
            )}
            {job.data && (
              <>
                {decreeJobStatus(job.data).notice && (
                  <p role="status" className="text-normal">
                    {decreeJobStatus(job.data).label}：
                    {decreeJobStatus(job.data).notice}
                  </p>
                )}
                <TaskInspector job={job.data} workspace={workspace.data} />
                <h3 className="text-lg text-high">已批准目标与范围</h3>
                <p className="whitespace-pre-wrap break-words">
                  {job.data.decreeText ||
                    '此历史任务未提供批准目标，请查阅原始回奏；不会使用当前草稿补写。'}
                </p>
                {job.data.draftFingerprint && (
                  <details>
                    <summary>批准版本凭据</summary>
                    <p className="break-all">{job.data.draftFingerprint}</p>
                  </details>
                )}
                <TaskAcceptanceContract
                  value={job.data.approvedDraft?.draft}
                  historical
                />
                <ResourceContainer>
                  {scrollPresentation && (
                    <summary className="cursor-pointer py-half">
                      技术资源与运行记录
                    </summary>
                  )}
                  <TaskDesktopResources
                    jobId={jobId}
                    connected={connected}
                    businessAttemptId={job.data.runtimeAttemptId}
                  />
                </ResourceContainer>
                {job.data.error && !decreeJobStatus(job.data).notice && (
                  <p role="alert" className="text-error">
                    {taskErrors[job.data.error.code] ??
                      '任务办理失败，请检查任务记录'}
                  </p>
                )}
                <CancelRequestControl
                  job={job.data}
                  receipt={cancel.data}
                  isPending={cancel.isPending}
                  error={cancel.error?.message}
                  connected={connected}
                  onCancel={() => cancel.mutate(jobId)}
                />
                {canRetryTask(job.data) && (
                  <button
                    className={button}
                    disabled={!connected || retry.isPending}
                    onClick={() =>
                      retry.mutate(jobId, {
                        onSuccess: (successor) => {
                          if (mounted.current) setJobId(successor.jobId);
                        },
                      })
                    }
                  >
                    {retry.isPending ? '正在建立重试任务…' : '修复后重试'}
                  </button>
                )}
                {retry.error && (
                  <p role="alert" className="text-error">
                    {retry.error.message}
                  </p>
                )}
                {job.data.result && (
                  <ValidatedDecreeResult value={job.data.result} />
                )}
                <TaskDeliveryReview
                  jobId={job.data.jobId}
                  jobState={job.data.state}
                  jobVersion={job.data.updatedAt}
                />
              </>
            )}
          </section>
        ) : (
          <>
            <label className="block text-high">
              目标与资料
              <textarea
                ref={objectiveInput}
                rows={6}
                maxLength={4000}
                className={input}
                disabled={busy}
                value={objective}
                placeholder="输入目标、已知参数、资料摘要与限制；缺失内容保持待确认。"
                onChange={(event) => {
                  ++contextGeneration.current;
                  setObjective(event.target.value);
                  invalidateApproval();
                  consult.reset();
                }}
              />
            </label>
            <button
              className={button}
              disabled={!connected || busy || !objective.trim()}
              onClick={() => {
                if (
                  !connected ||
                  busy ||
                  !objective.trim() ||
                  Array.from(objective.trim()).length > 4000
                ) {
                  setIssueError('目标需为 1–4000 字，请调整后咨询。');
                  return;
                }
                ++consultationGeneration.current;
                invalidateApproval();
                consult.mutate([{ role: 'user', content: objective.trim() }]);
              }}
            >
              {consult.isPending ? '丞相咨询中…' : '咨询丞相'}
            </button>
            {error && (
              <p role="alert" className="text-error">
                {error}
              </p>
            )}
            {consult.data && (
              <section className="space-y-base rounded border p-base">
                <h2 className="text-lg text-high">丞相理解</h2>
                <p className="whitespace-pre-wrap">{consult.data.reply}</p>
                <label className="flex gap-base">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(event) => {
                      invalidateApproval();
                      if (event.target.checked) {
                        const snapshot = confirmStudyIntent(
                          currentIntent,
                          currentIntent
                        );
                        setConfirmedIntent(snapshot);
                        if (!snapshot)
                          setIssueError('当前理解无法确认，请重新咨询。');
                      }
                    }}
                  />
                  我确认理解无误
                </label>
                <button
                  className={button}
                  disabled={!confirmed || busy || Boolean(draft.data)}
                  onClick={() => {
                    if (
                      !connected ||
                      busy ||
                      renderedEpoch !== authorizationEpoch.current
                    )
                      return;
                    const payload = prepareConfirmedStudyDraft(
                      confirmedIntent,
                      currentIntent,
                      version
                    );
                    if (!payload) {
                      setIssueError(
                        '请确认当前理解；原始目标与确认理解合计（含标记）不得超过 4000 字。'
                      );
                      return;
                    }
                    setIssueError(undefined);
                    setApproved(false);
                    setDraftIntent(confirmedIntent);
                    draft.mutate(payload);
                  }}
                >
                  {draft.isPending ? '拟旨中…' : '形成拟旨'}
                </button>
              </section>
            )}
            {draft.data && draftIsCurrent && (
              <section className="space-y-base rounded border p-base">
                <h2 className="text-lg text-high">
                  拟旨 v{draft.data.version} · {draft.data.status}
                </h2>
                <p>{draft.data.understanding}</p>
                <TaskAcceptanceContract value={draft.data.draft} />
                <pre className="whitespace-pre-wrap font-sans">
                  {draft.data.decreeText ?? draft.data.revisionPrompt}
                </pre>
                <label className="flex gap-base">
                  <input
                    type="checkbox"
                    checked={approved}
                    disabled={busy || Boolean(issue.data)}
                    onChange={(event) => {
                      ++authorizationEpoch.current;
                      setApproved(event.target.checked);
                    }}
                  />
                  我已阅读并批准此版本的范围、部门和权限限制
                </label>
                <button
                  className={button}
                  disabled={!connected || busy || !canIssue}
                  onClick={() => {
                    const current = draft.data;
                    if (
                      !current?.decreeText ||
                      !canIssue ||
                      renderedEpoch !== authorizationEpoch.current
                    )
                      return;
                    const epoch = authorizationEpoch.current;
                    setIssueError(undefined);
                    void decreeIdempotencyKey(owner, current.fingerprint)
                      .then((idempotencyKey) => {
                        if (
                          !mounted.current ||
                          epoch !== authorizationEpoch.current
                        )
                          throw new Error('批准内容已变化，请重新确认。');
                        return issue.mutateAsync({
                          decreeText: current.decreeText!,
                          draftVersion: current.version,
                          draftFingerprint: current.fingerprint,
                          idempotencyKey,
                        });
                      })
                      .then((accepted) => {
                        if (!mounted.current) return;
                        setJobId(accepted.jobId);
                        setVersion(current.version + 1);
                      })
                      .catch((cause) => {
                        if (
                          !mounted.current ||
                          epoch !== authorizationEpoch.current
                        )
                          return;
                        setIssueError(
                          cause instanceof Error ? cause.message : String(cause)
                        );
                      });
                  }}
                >
                  {issue.isPending
                    ? '提交中…'
                    : issue.data
                      ? '已提交'
                      : '确认并正式下旨'}
                </button>
              </section>
            )}
          </>
        )}
        <p className="text-low">
          本页展示朝堂后端真实任务；子智能体显示以当前任务事件为准。模型完成不等于人工验收通过。
        </p>
      </main>
      <aside
        aria-label="任务与成果"
        className="court-task-history space-y-base overflow-auto border-l bg-secondary p-base"
      >
        <HistoryContainer open={scrollPresentation ? !jobId : undefined}>
          {scrollPresentation && (
            <summary className="court-history-summary">任务列表与筛选</summary>
          )}
          {!scrollPresentation && workspaceCards}
          <h2 className="text-lg text-high">任务记录</h2>
          <button
            className={button}
            disabled={jobs.isFetching}
            onClick={() => void jobs.refetch()}
          >
            刷新任务
          </button>
          {jobs.isLoading && <p>加载任务中…</p>}
          {jobs.error && (
            <p role="alert" className="text-error">
              {jobs.error.message}
            </p>
          )}
          {!jobs.isLoading && !jobs.error && jobs.data?.items.length === 0 && (
            <p className="text-low">
              {history.offset > 0
                ? '此页已无记录，请返回上一页或第一页。'
                : history.q || history.archived !== 'active'
                  ? '没有符合条件的历史记录。'
                  : '暂无任务。先咨询并确认拟旨。'}
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateHistory({ q: history.search, offset: 0 });
            }}
            className="space-y-half"
          >
            <label className="block">
              搜索本账户任务
              <input
                className={input}
                value={history.search}
                maxLength={500}
                onChange={(event) =>
                  updateHistory({ search: event.target.value })
                }
                placeholder="标题或任务编号"
              />
            </label>
            <button className={button}>搜索全部历史</button>
          </form>
          <label className="block">
            历史范围
            <select
              className={input}
              value={history.archived}
              onChange={(event) =>
                updateHistory({
                  archived: event.target.value as HistoryView['archived'],
                  offset: 0,
                })
              }
            >
              <option value="active">未归档</option>
              <option value="archived">已归档</option>
              <option value="all">全部记录</option>
            </select>
          </label>
          <label className="block">
            本页状态
            <select
              className={input}
              value={history.state}
              onChange={(event) => updateHistory({ state: event.target.value })}
            >
              <option value="ALL">全部</option>
              <option value="QUEUED">排队中</option>
              <option value="RUNNING">办理中</option>
              <option value="SUCCEEDED">办理完成</option>
              <option value="FAILED">失败</option>
              <option value="CANCELLED">已取消</option>
            </select>
          </label>
          {jobs.data && !jobs.error && (
            <>
              <p className="text-low">
                共 {jobs.data.total} 项；当前{' '}
                {jobs.data.items.length ? jobs.data.offset + 1 : 0}–
                {jobs.data.items.length
                  ? jobs.data.offset + jobs.data.items.length
                  : 0}{' '}
                项。状态筛选仅作用于本页。
              </p>
              <nav aria-label="历史分页" className="flex flex-wrap gap-half">
                <button
                  className={button}
                  disabled={jobs.isFetching || history.offset === 0}
                  onClick={() => updateHistory({ offset: 0 })}
                >
                  第一页
                </button>
                <button
                  className={button}
                  disabled={jobs.isFetching || history.offset === 0}
                  onClick={() =>
                    updateHistory({
                      offset: Math.max(0, history.offset - jobs.data.limit),
                    })
                  }
                >
                  上一页
                </button>
                <button
                  className={button}
                  disabled={
                    jobs.isFetching ||
                    jobs.data.offset + jobs.data.limit >= jobs.data.total
                  }
                  onClick={() =>
                    updateHistory({ offset: history.offset + jobs.data.limit })
                  }
                >
                  下一页
                </button>
              </nav>
            </>
          )}
          <p className="text-low">
            归档仅调整历史列表，不代表史馆正式归档，也不取消办理。只有已结束任务可以归档或恢复。
          </p>
          {archive.isPending && <p role="status">正在更新历史记录…</p>}
          {archive.error && (
            <p role="alert" className="text-error">
              {archive.error.message}
            </p>
          )}
          {archive.isSuccess && (
            <p role="status">
              历史记录已{archive.data.historyArchived ? '归档' : '恢复'}。
            </p>
          )}
          {!jobs.isLoading &&
            !jobs.error &&
            Boolean(jobs.data?.items.length) &&
            visibleJobs.length === 0 && <p>没有匹配的任务。</p>}
          {!jobs.error &&
            visibleJobs.map((item) => (
              <div key={item.jobId} className="space-y-half">
                <button
                  className={`${button} block w-full text-left ${jobId === item.jobId ? 'border-brand' : ''}`}
                  disabled={busy}
                  aria-current={jobId === item.jobId ? 'true' : undefined}
                  onClick={() => {
                    cancel.reset();
                    retry.reset();
                    setJobId(item.jobId);
                  }}
                >
                  <span className="block truncate">{taskTitle(item)}</span>
                  <span>
                    {item.state} · {item.stage}
                  </span>
                </button>
                <button
                  className={button}
                  disabled={
                    !connected ||
                    archive.isPending ||
                    !canArchiveHistory(item.state)
                  }
                  title={
                    !canArchiveHistory(item.state)
                      ? '任务尚未结束，不能归档或恢复历史记录'
                      : undefined
                  }
                  aria-label={`${item.historyArchived ? '恢复' : '归档'}历史记录：${taskTitle(item)}`}
                  onClick={() => {
                    archive.mutate({
                      jobId: item.jobId,
                      archived: !item.historyArchived,
                    });
                  }}
                >
                  {item.historyArchived ? '恢复历史记录' : '归档历史记录'}
                </button>
              </div>
            ))}
        </HistoryContainer>
        {scrollPresentation && jobId && (
          <details>
            <summary className="court-history-summary">
              成果、证据与参与部门
            </summary>
            {workspaceCards}
          </details>
        )}
      </aside>
    </div>
  );
}

export function ValidatedDecreeResult({ value }: { value: unknown }) {
  let report;
  try {
    report = parseDecreeResult(value);
  } catch (cause) {
    return (
      <p role="alert" className="text-error">
        成果校验未通过：{cause instanceof Error ? cause.message : '格式错误'}
      </p>
    );
  }
  return (
    <section className="space-y-base">
      <h3 className="text-lg text-high">办理结论</h3>
      <p className="whitespace-pre-wrap">{report.final_verdict}</p>
      <p>部门：{report.departments.join('、')}</p>
      <details open className="space-y-base rounded border p-base">
        <summary>办理路径与分层意见</summary>
        <p>
          办理方式：
          {report.routeType === 'multi'
            ? '多部门会审'
            : report.routeType === 'single'
              ? '单部门办理'
              : '未提供'}
        </p>
        <h4 className="text-high">路由理由</h4>
        <p className="whitespace-pre-wrap">
          {report.rationale ?? '未提供路由理由。'}
        </p>
        <h4 className="text-high">处理路径</h4>
        <p>
          {report.processingPath === undefined
            ? '未提供处理路径。'
            : report.processingPath.length
              ? report.processingPath.join(' → ')
              : '处理路径为空。'}
        </p>
        <h4 className="text-high">逐司逐部意见</h4>
        {report.ministryOpinions === undefined ? (
          <p className="text-low">未提供逐司逐部意见。</p>
        ) : !report.ministryOpinions.length ? (
          <p className="text-low">未返回部门意见。</p>
        ) : (
          <ol className="space-y-base">
            {report.ministryOpinions.map((ministry, index) => (
              <li
                key={`${index}:${ministry.department}`}
                className="space-y-half border-t pt-base"
              >
                <h5 className="text-high">{ministry.department}</h5>
                {ministry.bureauOpinions === undefined ? (
                  <p className="text-low">未提供司级意见。</p>
                ) : !ministry.bureauOpinions.length ? (
                  <p className="text-low">未返回司级意见。</p>
                ) : (
                  <ol className="space-y-half pl-base">
                    {ministry.bureauOpinions.map((bureau, i) => (
                      <li key={`${i}:${bureau.bureau}`}>
                        <strong>{bureau.bureau}</strong>
                        <p className="whitespace-pre-wrap">
                          {bureau.opinion ?? '未提供该司意见。'}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="whitespace-pre-wrap">
                  部级意见：{ministry.opinion ?? '未提供'}
                </p>
              </li>
            ))}
          </ol>
        )}
        {report.routeType === 'multi' && (
          <section>
            <h4 className="text-high">军机处会审结论</h4>
            <p className="whitespace-pre-wrap">
              {report.councilVerdict ?? '未提供会审结论。'}
            </p>
          </section>
        )}
        {report.routeType === undefined && (
          <p className="text-low">
            未提供办理路由，不能判断是否经过军机处会审。
          </p>
        )}
      </details>
      <ol className="list-decimal space-y-half pl-double">
        {report.recommendations.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ol>
      <h3>成果登记</h3>
      {report.artifacts.length ? (
        report.artifacts.map((item) => (
          <p key={item.artifactId}>
            {item.displayName} · {item.kind}
          </p>
        ))
      ) : (
        <p className="text-low">没有登记文件成果</p>
      )}
      <p className="text-low">
        已发布文件可在右侧输出内容中下载；登记不等于人工验收通过。
      </p>
    </section>
  );
}

const acceptanceFields = [
  ['scope', '范围'],
  ['exclusions', '不包含的事项'],
  ['inputMaterials', '输入资料'],
  ['materialGaps', '材料缺口'],
  ['keyQuestions', '关键问题'],
  ['executionSteps', '执行步骤'],
  ['deliverables', '交付物'],
  ['completionCriteria', '验收标准'],
  ['permissionsAndLimits', '权限与限制'],
] as const;

export function TaskAcceptanceContract({
  value,
  historical = false,
}: {
  value?: unknown;
  historical?: boolean;
}) {
  const contract = projectDraftAcceptance(value);
  if (!contract)
    return (
      <p className="text-low">
        未提供结构化批准与验收合同；以已提供的批准原文为准，不从当前草稿补写历史字段。
      </p>
    );
  return (
    <details open className="space-y-base rounded border p-base">
      <summary>批准范围与验收合同</summary>
      <p className="text-low">
        {historical
          ? '以下为任务创建时冻结的批准与验收合同。'
          : '以下为拟旨接口返回的当前版本；正式下旨批准仍需单独确认。'}
      </p>
      <h3 className="text-high">目标</h3>
      <p className="whitespace-pre-wrap">
        {contract.objective ?? '未提供或格式无效'}
      </p>
      <dl className="grid gap-base md:grid-cols-2">
        {acceptanceFields.map(([key, label]) => (
          <div key={key}>
            <dt className="text-high">{label}</dt>
            <dd>
              {contract[key] === undefined ? (
                <p className="text-low">未提供或格式无效</p>
              ) : contract[key]!.length ? (
                <ol className="list-decimal space-y-half pl-base">
                  {contract[key]!.map((item, i) => (
                    <li className="whitespace-pre-wrap" key={i}>
                      {item}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-low">未列出</p>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <h3 className="text-high">部门与责任</h3>
      {contract.departments === undefined ? (
        <p className="text-low">未提供部门责任或格式无效</p>
      ) : !contract.departments.length ? (
        <p className="text-low">未列出部门责任</p>
      ) : (
        <ol className="space-y-base">
          {contract.departments.map((department, i) => (
            <li key={i} className="border-t pt-base">
              <h4 className="text-high">
                {department.department ?? '未提供部门名称'}
              </h4>
              <p>
                参与司：
                {department.bureaus === undefined
                  ? '未提供'
                  : department.bureaus.join('、') || '未列出'}
              </p>
              <p>角色：{department.role ?? '未提供'}</p>
              <p>理由：{department.reason ?? '未提供'}</p>
              <p>责任：{department.responsibility ?? '未提供'}</p>
              <p>预期产出：{department.expectedOutput ?? '未提供'}</p>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

export function artifactStateText(state: string): string {
  const normalized = state.toLowerCase();
  if (normalized === 'published') return '文件已发布（不等于翰林验收）';
  if (normalized === 'registered') return '已登记，等待文件发布';
  return '暂不可下载，状态待确认';
}

export function WorkspaceCards({
  result,
  objective,
  hasSelectedJob,
  workspace,
  error,
  loading = false,
  onRetry,
}: {
  result: unknown;
  objective: string;
  hasSelectedJob: boolean;
  workspace?: DecreeWorkspace;
  error?: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const client = useChaotangClient();
  const transfer = useRef(createArtifactTransfer());
  const [downloads, setDownloads] = useState<
    Record<
      string,
      { pending?: boolean; result?: ArtifactTransferResult; error?: string }
    >
  >({});
  let report: ReturnType<typeof parseDecreeResult> | undefined;
  let invalid = false;
  if (result) {
    try {
      report = parseDecreeResult(result);
    } catch {
      invalid = true;
    }
  }
  const card = 'overflow-hidden rounded-xl border border-white/10 bg-panel';
  const title =
    'flex items-center gap-base border-b border-white/10 p-base text-lg text-high';
  const artifacts =
    workspace?.artifacts ??
    report?.artifacts.map((item) => ({
      id: item.artifactId,
      displayName: item.displayName,
      kind: item.kind,
      state: 'REGISTERED',
      downloadPath: undefined,
    }));
  const agents = workspace?.agents ?? [];
  const ministers = agents.filter(
    (agent) => agent.role.toLowerCase() === 'minister'
  );
  const subagents = agents.filter(
    (agent) => agent.role.toLowerCase() === 'subagent'
  );
  const download = async (artifact: {
    id: string;
    displayName: string;
    downloadPath?: string | null;
  }) => {
    if (!workspace?.jobId) return;
    setDownloads((current) => ({
      ...current,
      [artifact.id]: { pending: true },
    }));
    try {
      const result = await transfer.current(
        client,
        workspace.jobId,
        artifact,
        (blob, name) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = name;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      );
      if (result)
        setDownloads((current) => ({ ...current, [artifact.id]: { result } }));
    } catch (cause) {
      setDownloads((current) => ({
        ...current,
        [artifact.id]: {
          error: cause instanceof Error ? cause.message : String(cause),
        },
      }));
    }
  };
  const safeUrl = (value?: string | null) => {
    if (!value) return undefined;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  };
  if (hasSelectedJob && loading)
    return <p role="status">正在读取任务成果、智能体与来源…</p>;
  if (hasSelectedJob && error)
    return (
      <section role="alert" className="space-y-base text-error">
        <p>任务面板读取失败：{error}</p>
        {onRetry && (
          <button className={button} onClick={onRetry}>
            重新读取任务面板
          </button>
        )}
      </section>
    );
  if (hasSelectedJob && !workspace)
    return <p role="status">当前客户端未提供任务面板，无法确认成果及来源。</p>;
  return (
    <div className="space-y-base">
      {error && (
        <p role="alert" className="text-error">
          任务面板读取失败：{error}
        </p>
      )}
      <section className={card} aria-label="输出内容">
        <h2 className={title}>
          <FilesIcon size={20} />
          输出内容
        </h2>
        <div className="space-y-base p-base">
          {invalid ? (
            <p role="alert" className="text-error">
              成果格式未通过校验
            </p>
          ) : artifacts?.length ? (
            artifacts.map((item) => {
              const pending = Boolean(downloads[item.id]?.pending);
              const downloadError = downloads[item.id]?.error;
              const disabledReason = pending
                ? '处理中：正在处理上一次下载或保存请求，请稍候。'
                : !workspace?.jobId
                  ? '缺少任务编号，暂不能下载或保存。'
                  : !client.saveWorkspaceArtifact &&
                      (!item.downloadPath || !client.downloadWorkspaceArtifact)
                    ? !item.downloadPath
                      ? '此文件没有可用下载地址，暂不能下载。'
                      : '当前客户端未接入文件下载，暂不能下载。'
                    : item.state.toLowerCase() === 'registered'
                      ? '文件尚未发布，暂不能下载或保存。'
                      : item.state.toLowerCase() === 'published'
                        ? undefined
                        : '状态未确认，暂不能下载或保存。';
              return (
                <div key={item.id} className="rounded border p-base">
                  <p>{item.displayName}</p>
                  <p className="text-low">{artifactStateText(item.state)}</p>
                  <details className="text-low">
                    <summary className="cursor-pointer py-half">
                      文件详情
                    </summary>
                    <p>
                      {item.kind} · {item.state}
                    </p>
                  </details>
                  {disabledReason && (
                    <p className="text-low">{disabledReason}</p>
                  )}
                  <button
                    disabled={
                      Boolean(downloads[item.id]?.pending) ||
                      !workspace?.jobId ||
                      (!client.saveWorkspaceArtifact &&
                        (!item.downloadPath ||
                          !client.downloadWorkspaceArtifact)) ||
                      item.state.toLowerCase() !== 'published'
                    }
                    onClick={() => void download(item)}
                    className={button}
                  >
                    {pending
                      ? '处理中…'
                      : downloadError
                        ? client.saveWorkspaceArtifact
                          ? '重试保存'
                          : '重试下载'
                        : client.saveWorkspaceArtifact
                          ? '保存文件'
                          : item.downloadPath
                            ? '下载文件'
                            : '下载未就绪'}
                  </button>
                  {downloads[item.id]?.error && (
                    <p role="alert" className="text-error">
                      {downloads[item.id].error}
                    </p>
                  )}
                  {downloads[item.id]?.result && (
                    <p role="status" className="break-all text-low">
                      {downloads[item.id].result?.status === 'saved' ? (
                        <>
                          已保存：
                          {
                            (downloads[item.id].result as { path?: string })
                              .path
                          }
                          <br />
                          SHA-256：
                          {
                            (downloads[item.id].result as { sha256?: string })
                              .sha256
                          }
                        </>
                      ) : downloads[item.id].result?.status === 'cancelled' ? (
                        '已取消保存，未确认写入文件。'
                      ) : (
                        '已交给浏览器下载，请在浏览器下载记录中确认文件。'
                      )}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-low">
              {hasSelectedJob
                ? '此任务尚无已登记文件或站点'
                : '选择任务后查看真实文件与站点'}
            </p>
          )}
          <p className="text-low">
            文件生成需在拟旨中明确交付要求；不会自动创建外部站点。
          </p>
        </div>
      </section>
      <section className={card} aria-label="协作智能体">
        <h2 className={title}>
          <UsersThreeIcon size={20} />
          协作智能体
        </h2>
        <div className="space-y-base p-base">
          {workspace?.agentsAvailable ? (
            <>
              <p>
                部门 {ministers.length} · 子智能体运行中{' '}
                {
                  subagents.filter((a) => a.state.toLowerCase() === 'running')
                    .length
                }{' '}
                · 完成{' '}
                {
                  subagents.filter((a) => a.state.toLowerCase() === 'succeeded')
                    .length
                }
              </p>
              <details>
                <summary className="cursor-pointer">查看详情</summary>
                {workspace.agents.map((agent) => (
                  <div className="mt-base border-t pt-base" key={agent.id}>
                    <p>
                      {agent.name} ·{' '}
                      {agentRoles[agent.role.toLowerCase()] ?? '协作智能体'} ·{' '}
                      {agentStates[agent.state.toLowerCase()] ?? '状态待确认'}
                    </p>
                    {agent.parentId && (
                      <p className="text-low">
                        上级：
                        {workspace.agents.find(
                          (parent) => parent.id === agent.parentId
                        )?.name ?? agent.parentId}
                      </p>
                    )}
                    <p>{agent.taskSummary}</p>
                    {agent.stateReason && (
                      <p className="text-low">
                        {stateReasons[agent.stateReason] ?? '状态原因待确认'}
                      </p>
                    )}
                  </div>
                ))}
              </details>
              <details>
                <summary className="cursor-pointer">工具调用记录</summary>
                {workspace.tools?.length ? (
                  [...workspace.tools]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((tool) => (
                      <p className="mt-base border-t pt-base" key={tool.id}>
                        {workspace.agents.find(
                          (agent) => agent.id === tool.agentId
                        )?.name ?? '执行智能体'}
                        {' · '}
                        {tool.name}
                        {' · '}
                        {agentStates[tool.state] ?? '状态待确认'}
                        {tool.stateReason && (
                          <span>
                            {' '}
                            ·{' '}
                            {stateReasons[tool.stateReason] ?? '状态原因待确认'}
                          </span>
                        )}
                      </p>
                    ))
                ) : (
                  <p className="text-low">
                    {workspace.tools
                      ? '暂无已记录的工具调用'
                      : '工具调用明细尚未接入'}
                  </p>
                )}
              </details>
            </>
          ) : (
            <>
              <p className="text-low">运行中 — · 完成 —</p>
              <p>执行事件尚未接入</p>
              <p className="text-low">
                无法据部门名单推断部长及子 Agent 的实际运行数量。
              </p>
              <button disabled className={button}>
                查看详情（待接入）
              </button>
            </>
          )}
        </div>
      </section>
      <section className={card} aria-label="来源">
        <h2 className={title}>
          <BookOpenIcon size={20} />
          来源
        </h2>
        <div className="space-y-base p-base">
          {workspace ? (
            <details open>
              <summary className="cursor-pointer">
                查看全部 · {workspace.sources.length} 项
              </summary>
              {workspace.sources.map((source) => (
                <div key={source.id} className="mt-base border-t pt-base">
                  <p>
                    {source.title} · {source.kind}
                  </p>
                  {source.content && (
                    <details>
                      <summary className="cursor-pointer">查看内容</summary>
                      <p className="whitespace-pre-wrap break-words">
                        {source.content}
                      </p>
                    </details>
                  )}
                  {safeUrl(source.url) && (
                    <a
                      className="text-brand underline"
                      href={safeUrl(source.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      打开来源链接
                    </a>
                  )}
                </div>
              ))}
            </details>
          ) : (
            <>
              <p className="text-low">
                选择任务后读取持久来源；尚未读取时不显示数量。
              </p>
              {objective.trim() && (
                <details>
                  <summary className="cursor-pointer">
                    当前输入 · 非所选任务的持久来源
                  </summary>
                  <p className="mt-base whitespace-pre-wrap break-words">
                    {objective}
                  </p>
                </details>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
