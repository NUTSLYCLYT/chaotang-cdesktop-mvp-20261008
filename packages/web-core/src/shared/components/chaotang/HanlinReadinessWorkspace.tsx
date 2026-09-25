import { useEffect, useRef, useState } from 'react';
import {
  useHanlinCandidateHistory,
  useHanlinExperiment,
  useHanlinRuntimeRehearsal,
} from '@/shared/hooks/chaotang/useHanlinOutcome';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';
import { OutcomeOverviewPanel } from './OutcomeReadinessWorkspace';
import {
  advisoryReadError,
  normalizeExperimentId,
  type HanlinExperiment,
} from './hanlinOutcomeContract';
import {
  buildCandidateCommand,
  candidateActions,
  decodeCandidateAppend,
  type CandidateAction,
  type CandidateHistory,
  type CandidateLedgerClient,
} from './hanlinCandidateContract';
import {
  buildRuntimeRehearsalCommand,
  decodeRuntimeRehearsalAppend,
  runtimeRehearsalActions,
  type RuntimeRehearsalAction,
  type RuntimeRehearsalClient,
  type RuntimeRehearsalHistory,
} from './hanlinRuntimeRehearsalContract';

export function HanlinReadinessWorkspace() {
  const { user, health, authGeneration } = useChaotangProvider();
  if (!user || !health)
    return (
      <ChaotangPanel className="p-double" role="status">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '现行事实源未连接'}
        </h2>
        <p className="mt-base text-low">
          翰林院仅查询当前账户的认证 Outcome 与不可变实验记录。
        </p>
      </ChaotangPanel>
    );
  return <HanlinAuthenticatedWorkspace key={`${user.id}:${authGeneration}`} />;
}

function HanlinAuthenticatedWorkspace() {
  const [input, setInput] = useState('');
  const [requestedId, setRequestedId] = useState<string>();
  const [validation, setValidation] = useState('');
  const query = useHanlinExperiment(requestedId);
  return (
    <div className="space-y-double">
      <ChaotangPanel className="space-y-base p-double">
        <h2 className="chaotang-title text-2xl text-high">翰林院评测</h2>
        <p className="text-sm text-low">
          读取认证结果与冻结实验。ADVISORY_ONLY ·
          评测仅提供建议，不自动晋级、修改运行时绑定或发布。
        </p>
      </ChaotangPanel>
      <OutcomeOverviewPanel />
      <ChaotangPanel
        className="space-y-double p-double"
        aria-label="翰林实验查询"
      >
        <h3 className="chaotang-title text-lg text-high">不可变实验记录</h3>
        <p className="text-sm text-low">
          当前接口不提供实验列表或总数，请输入已有实验 ID
          查询。页面不创建或重新运行实验。
        </p>
        <form
          className="space-y-base"
          onSubmit={(event) => {
            event.preventDefault();
            if (!query.supported || query.isFetching) return;
            try {
              const id = normalizeExperimentId(input);
              setValidation('');
              if (id === requestedId) void query.refetch();
              else setRequestedId(id);
            } catch (error) {
              setRequestedId(undefined);
              setValidation(advisoryReadError(error));
            }
          }}
        >
          <label className="block space-y-half text-sm text-normal">
            <span>实验 ID</span>
            <input
              className="w-full border border-brand/30 bg-primary p-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              value={input}
              onChange={(event) => {
                setInput(event.currentTarget.value);
                setRequestedId(undefined);
                setValidation('');
              }}
              aria-invalid={Boolean(validation)}
              aria-describedby="hanlin-experiment-id-hint"
            />
          </label>
          <p id="hanlin-experiment-id-hint" className="text-xs text-low">
            8–128 位字母、数字或 . _ : -。
          </p>
          <ChaotangButton
            type="submit"
            disabled={!query.supported || query.isFetching || !input.trim()}
          >
            {query.isFetching ? '正在查询…' : '查询实验'}
          </ChaotangButton>
        </form>
        {validation && (
          <p role="alert" className="text-error">
            {validation}
          </p>
        )}
        {!query.supported ? (
          <p role="status">当前客户端暂不支持翰林实验查询。</p>
        ) : !requestedId ? (
          <p role="status">
            输入实验 ID 后查询当前账户的记录；尚未查询不代表没有实验。
          </p>
        ) : query.isError ? (
          <div role="alert" className="space-y-base text-error">
            <p>实验查询失败：{advisoryReadError(query.error)}</p>
            <p className="text-sm text-low">
              请核对实验 ID 和当前账户权限。未找到记录不代表其他账户存在该实验。
            </p>
            <ChaotangButton
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              重试查询
            </ChaotangButton>
          </div>
        ) : query.isPending ? (
          <p role="status">正在查询不可变实验…</p>
        ) : query.data ? (
          <>
            <HanlinExperimentContent data={query.data} />
            <HanlinCandidatePanel
              key={`${requestedId}:${query.data.snapshot.snapshot_digest}`}
              experiment={query.data}
            />
          </>
        ) : null}
      </ChaotangPanel>
    </div>
  );
}

const statusLabels = {
  NO_DATA: '暂无样本',
  INSUFFICIENT_SAMPLE: '样本不足',
  FAILED: '评测未通过',
  READY_FOR_REVIEW: '可供人工审阅',
};
const actionLabels = {
  COLLECT_DATA: '收集数据',
  KEEP_BASELINE: '保留基线',
  ROLLBACK_CANDIDATE: '建议回滚候选',
  PROMOTE_CANDIDATE: '建议晋级候选',
};
const score = (value: number | null) => (value === null ? '—' : String(value));

export function HanlinExperimentContent({ data }: { data: HanlinExperiment }) {
  const { snapshot, evaluation, recorded_at } = data;
  return (
    <section className="space-y-base" aria-label="实验只读回执">
      <h4 className="chaotang-title text-lg text-high">
        {snapshot.definition.title}
      </h4>
      <p className="break-all text-sm text-low">
        实验 {snapshot.definition.experiment_id} · 记录时间 {recorded_at}
      </p>
      <p role="status">
        {evaluation.status} · {statusLabels[evaluation.status]}
      </p>
      <p>
        {actionLabels[evaluation.recommended_action]}（
        {evaluation.recommended_action}）
      </p>
      <p className="text-sm text-brand">
        ADVISORY_ONLY · 建议不构成生产授权，禁止自动晋级或发布。
      </p>
      <dl className="grid gap-base sm:grid-cols-2">
        {[
          ['基线样本', evaluation.baseline_samples],
          ['候选样本', evaluation.candidate_samples],
          ['基线质量', score(evaluation.baseline_quality)],
          ['候选质量', score(evaluation.candidate_quality)],
          ['候选证据评分', score(evaluation.candidate_evidence)],
          ['成本变化比例', score(evaluation.cost_increase_ratio)],
          ['延迟变化比例', score(evaluation.latency_increase_ratio)],
          ['每组最小样本', snapshot.definition.minimum_samples_per_arm],
          ['最小质量增益', snapshot.definition.minimum_quality_gain],
          ['最低证据评分', snapshot.definition.minimum_evidence_score],
          ['最大成本增幅', snapshot.definition.maximum_cost_increase_ratio],
          ['最大延迟增幅', snapshot.definition.maximum_latency_increase_ratio],
          [
            '运行制品',
            snapshot.definition.runtime_artifact_id ?? '内置固定探针',
          ],
        ].map(([label, value]) => (
          <div key={label} className="border border-brand/15 p-base text-sm">
            <dt className="text-low">{label}</dt>
            <dd className="text-high">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-low">
        — 表示该指标未提供或当前不可计算，不作为零值。
      </p>
      <p className="break-all text-sm text-low">
        原因代码：
        {evaluation.reason_codes.length
          ? evaluation.reason_codes.join(' · ')
          : '未返回原因代码'}
      </p>
      <details>
        <summary className="cursor-pointer text-sm">
          查看冻结快照与样本来源
        </summary>
        <div className="mt-base space-y-half break-all text-xs text-low">
          <p>定义时间：{snapshot.definition.created_at}</p>
          <p>定义摘要：{snapshot.definition_digest}</p>
          <p>基线摘要：{snapshot.baseline_digest}</p>
          <p>候选摘要：{snapshot.candidate_digest}</p>
          <p>快照摘要：{snapshot.snapshot_digest}</p>
          <p>评测摘要：{evaluation.evaluation_digest}</p>
          <p>以上摘要来自认证回执，页面不重新运行实验或声明独立密码学校验。</p>
        </div>
        {(['baseline', 'candidate'] as const).map((arm) => (
          <section key={arm} className="mt-base space-y-half">
            <h5 className="text-sm">
              {arm === 'baseline' ? '基线' : '候选'}样本 ·{' '}
              {snapshot[arm].length}
            </h5>
            {snapshot[arm].length === 0 ? (
              <p className="text-xs text-low">此组无样本。</p>
            ) : (
              <ul className="space-y-half">
                {snapshot[arm].map((item) => (
                  <li
                    key={item.observation_id}
                    className="space-y-half break-all border border-brand/15 p-base text-xs text-low"
                  >
                    <p>
                      {item.observation_id} · {item.execution_status}
                    </p>
                    <p>Outcome 事件：{item.outcome_event_id}</p>
                    <p>事件摘要：{item.outcome_event_digest}</p>
                    <p>证据包摘要：{item.evidence_bundle_digest}</p>
                    <p>
                      质量 {item.quality_score} · 证据 {item.evidence_score} ·
                      成本（微单位）{item.cost_microunits} · 延迟{' '}
                      {item.latency_ms} ms
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </details>
    </section>
  );
}

function HanlinCandidatePanel({
  experiment,
}: {
  experiment: HanlinExperiment;
}) {
  const query = useHanlinCandidateHistory(experiment);
  const client = useChaotangClient() as Partial<CandidateLedgerClient>;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [receipt, setReceipt] = useState('');
  const lock = useRef(false);
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const submit = async (action: CandidateAction) => {
    if (
      lock.current ||
      query.isFetching ||
      query.isError ||
      !query.data ||
      !client.appendCandidateEvent
    )
      return;
    lock.current = true;
    setBusy(true);
    setProblem('');
    setReceipt('');
    let submitted = false;
    try {
      // One fresh key per explicit operation; neither query retries nor UI state can repeat the POST.
      const command = buildCandidateCommand(
        query.data,
        experiment,
        action,
        reason,
        crypto.randomUUID()
      );
      submitted = true;
      const raw = await client.appendCandidateEvent(
        experiment.snapshot.definition.experiment_id,
        command
      );
      const event = decodeCandidateAppend(raw, query.data, experiment, command);
      if (!live.current) return;
      setReceipt(
        `已收到后端事件 ${event.event_id} · revision ${event.revision} · ${event.action}`
      );
      setReason('');
    } catch (error) {
      if (live.current)
        setProblem(
          `操作未确认完成：${advisoryReadError(error)}。请重新读取历史后核对，不要把请求失败视为已回滚。`
        );
    } finally {
      // Even an ambiguous failed POST may have committed: read authoritative history before another action.
      if (submitted && live.current) await query.refetch();
      if (live.current) setBusy(false);
      lock.current = false;
    }
  };
  return (
    <>
      <HanlinCandidateView
        supported={query.supported}
        writable={query.writable}
        loading={query.isPending && query.supported}
        busy={busy || query.isFetching}
        history={query.data}
        error={query.isError ? advisoryReadError(query.error) : problem}
        receipt={receipt}
        reason={reason}
        onReasonChange={setReason}
        actions={query.data ? candidateActions(query.data, experiment) : []}
        onAction={(action) => void submit(action)}
        onReload={() => {
          if (lock.current) return;
          setProblem('');
          setReceipt('');
          void query.refetch();
        }}
      />
      {query.data && (
        <HanlinRuntimeRehearsalPanel
          experiment={experiment}
          candidate={query.data}
        />
      )}
    </>
  );
}

const candidateActionLabels: Record<CandidateAction, string> = {
  APPROVE: '人工批准候选',
  REJECT: '人工拒绝候选',
  ENABLE: '本地演练选择候选',
  CHECK_HEALTH: '检查账本完整性',
  DEGRADE: '记录本地演练降级',
  ROLLBACK: '本地演练恢复基线',
};
const candidateStateLabels: Record<CandidateHistory['state'], string> = {
  UNREVIEWED: '未审阅',
  APPROVED: '已人工批准',
  REJECTED: '已拒绝',
  ENABLED: '本地演练已选择候选',
  HEALTHY: '账本完整性检查通过',
  DEGRADED: '本地演练已降级',
  ROLLED_BACK: '本地演练已恢复基线',
};

export function HanlinCandidateView({
  supported,
  writable = true,
  loading,
  busy,
  history,
  error,
  receipt,
  reason,
  actions,
  onReasonChange,
  onAction,
  onReload,
}: {
  supported: boolean;
  writable?: boolean;
  loading: boolean;
  busy: boolean;
  history?: CandidateHistory;
  error?: string;
  receipt?: string;
  reason: string;
  actions: CandidateAction[];
  onReasonChange: (reason: string) => void;
  onAction: (action: CandidateAction) => void;
  onReload: () => void;
}) {
  return (
    <section
      className="mt-double space-y-base border-t border-brand/20 pt-double"
      aria-label="候选人工处置与追加历史"
    >
      <div className="flex flex-wrap items-center justify-between gap-base">
        <h4 className="chaotang-title text-lg text-high">
          候选人工处置与追加历史
        </h4>
        <ChaotangButton disabled={!supported || busy} onClick={onReload}>
          重新读取候选历史
        </ChaotangButton>
      </div>
      <p className="break-all text-sm text-brand">
        LOCAL_ISOLATED · LOCAL_REHEARSAL_ONLY · runtime_health=NOT_RUN
      </p>
      <p className="text-sm text-low">
        只选择实验样本摘要，不是可执行版本。不会切换真实运行时绑定或发布；健康检查仅验证账本和
        Outcome 完整性，不探测进程运行健康。
      </p>
      {receipt && (
        <p role="status" className="break-all text-sm">
          {receipt}
        </p>
      )}
      {!supported ? (
        <p role="status">当前客户端暂不支持候选历史。</p>
      ) : error ? (
        <p role="alert" className="text-error">
          {error}
        </p>
      ) : loading ? (
        <p role="status">正在读取候选历史…</p>
      ) : history ? (
        <>
          <p role="status">
            {candidateStateLabels[history.state]} · {history.state} · revision{' '}
            {history.revision}
          </p>
          <p className="break-all text-xs text-low">
            当前选择的实验组摘要：{history.selected_arm_digest}
          </p>
          {!writable ? (
            <p role="status">当前客户端仅支持读取，暂不支持候选人工操作。</p>
          ) : actions.length ? (
            <div className="space-y-base">
              <label className="block space-y-half text-sm">
                <span>操作理由（必填）</span>
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  disabled={busy}
                  className="min-h-24 w-full border border-brand/30 bg-primary p-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                  onChange={(event) =>
                    onReasonChange(event.currentTarget.value)
                  }
                />
              </label>
              <p className="text-xs text-low">
                每次点击追加一个事件，提交当前 revision
                和冻结实验摘要。启用必须由作出批准的同一登录会话操作；权限和冲突均由后端最终判定。
              </p>
              <div className="flex flex-wrap gap-base">
                {actions.map((action) => (
                  <ChaotangButton
                    key={action}
                    disabled={
                      busy || !reason.trim() || reason.trim().length > 2000
                    }
                    onClick={() => onAction(action)}
                  >
                    {candidateActionLabels[action]} · {action}
                  </ChaotangButton>
                ))}
              </div>
            </div>
          ) : (
            <p role="status">
              当前状态没有可提交的动作，或历史已达到安全上限。
            </p>
          )}
          {history.events.length === 0 ? (
            <p role="status">尚无候选操作事件。</p>
          ) : (
            <details open>
              <summary className="cursor-pointer">
                追加式操作历史 · {history.events.length} 条
              </summary>
              <ol className="mt-base space-y-base">
                {history.events.map((event) => (
                  <li
                    key={event.event_id}
                    className="space-y-half break-all border border-brand/15 p-base text-xs text-low"
                  >
                    <p className="text-normal">
                      revision {event.revision} · {event.action} ·{' '}
                      {candidateStateLabels[event.state]}
                    </p>
                    <p>理由：{event.reason}</p>
                    <p>记录时间：{event.recorded_at}</p>
                    <p>事件：{event.event_id}</p>
                    <p>事件摘要：{event.event_digest}</p>
                    <p>
                      前一事件摘要：
                      {event.previous_event_digest ?? '无（首条事件）'}
                    </p>
                    <p>实验快照：{event.snapshot_digest}</p>
                    <p>评测摘要：{event.evaluation_digest}</p>
                    <p>选择的实验组：{event.selected_arm_digest}</p>
                    <p>前一实验组：{event.previous_arm_digest ?? '无'}</p>
                    <p>
                      检查范围：{event.health_check_scope} · 运行健康：
                      {event.runtime_health}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p role="status">等待读取候选历史。</p>
      )}
    </section>
  );
}

const runtimeActionLabels: Record<RuntimeRehearsalAction, string> = {
  START: '启动隔离候选进程',
  PROBE: '探测真实运行健康',
  RUN_DEPARTMENT: '执行零模型司级样本',
  SWITCH_LOCAL_BINDING: '切换本地演练绑定',
  DEGRADE: '标记运行降级',
  ROLLBACK: '停止候选并恢复基线',
};
const runtimeStateLabels: Record<RuntimeRehearsalHistory['state'], string> = {
  NOT_STARTED: '尚未启动',
  STARTED: '候选进程已启动',
  PROBED: '真实健康探测通过',
  SAMPLED: '司级样本执行并锁定回执',
  ACTIVE: '本地演练绑定已切至候选',
  DEGRADED: '候选已降级',
  ROLLED_BACK: '候选已停止并恢复基线',
};

function HanlinRuntimeRehearsalPanel({
  experiment,
  candidate,
}: {
  experiment: HanlinExperiment;
  candidate: CandidateHistory;
}) {
  const query = useHanlinRuntimeRehearsal(experiment, candidate);
  const client = useChaotangClient() as Partial<RuntimeRehearsalClient>;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [receipt, setReceipt] = useState('');
  const lock = useRef(false);

  const submit = async (action: RuntimeRehearsalAction) => {
    if (
      lock.current ||
      query.isFetching ||
      !query.data ||
      !client.appendRuntimeRehearsalEvent
    )
      return;
    lock.current = true;
    setBusy(true);
    setProblem('');
    setReceipt('');
    let submitted = false;
    try {
      const command = buildRuntimeRehearsalCommand(
        query.data,
        candidate,
        action,
        reason,
        crypto.randomUUID()
      );
      submitted = true;
      const raw = await client.appendRuntimeRehearsalEvent(
        experiment.snapshot.definition.experiment_id,
        command
      );
      const event = decodeRuntimeRehearsalAppend(
        raw,
        query.data,
        experiment.snapshot.definition.experiment_id,
        experiment.snapshot.baseline_digest,
        experiment.snapshot.candidate_digest,
        candidate,
        command
      );
      setReceipt(
        `已收到运行事件 ${event.event_id} · revision ${event.revision} · ${event.action}`
      );
      setReason('');
    } catch (error) {
      setProblem(
        `运行操作未确认完成：${advisoryReadError(error)}。请重新读取运行历史；系统会在进程丢失时自动退回基线。`
      );
    } finally {
      if (submitted) await query.refetch();
      setBusy(false);
      lock.current = false;
    }
  };
  const actions = query.data
    ? runtimeRehearsalActions(query.data, candidate)
    : [];
  return (
    <section
      className="mt-double space-y-base border-t border-brand/20 pt-double"
      aria-label="本地隔离候选进程演练"
    >
      <div className="flex flex-wrap items-center justify-between gap-base">
        <h4 className="chaotang-title text-lg text-high">
          本地隔离候选进程演练
        </h4>
        <ChaotangButton
          disabled={!query.supported || busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          重新读取运行历史
        </ChaotangButton>
      </div>
      <p className="break-all text-sm text-brand">
        LOCAL_PROCESS_ISOLATED · {query.data?.artifact_kind ?? '等待制品身份'} ·
        永久禁止生产发布
      </p>
      <p className="text-sm text-low">
        这里只能启动实验冻结的后端受信制品；未绑定实验使用朝堂固定回环探针，绑定实验使用经过提交与关键文件摘要校验的
        DeepSeek Harness scripted
        进程。前端不能提交程序、命令、路径、端口、网址或模型设置，模型调用固定为
        0。DSH 制品健康通过后，可执行固定的工部技术司 scripted
        样本并锁定父子会话、结果与回执摘要；该样本不代表真实业务 Outcome。
      </p>
      {receipt && <p role="status">{receipt}</p>}
      {!query.supported ? (
        <p role="status">当前客户端暂不支持候选进程演练。</p>
      ) : query.isError || problem ? (
        <p role="alert" className="text-error">
          {problem || advisoryReadError(query.error)}
        </p>
      ) : query.isPending ? (
        <p role="status">正在读取运行历史…</p>
      ) : query.data ? (
        <>
          <p role="status">
            {runtimeStateLabels[query.data.state]} · {query.data.state} · 健康{' '}
            {query.data.runtime_health} · revision {query.data.revision}
          </p>
          <p className="break-all text-xs text-low">
            当前有效绑定：{query.data.active_binding_digest} · 进程存活：
            {query.data.process_alive ? '是' : '否'}
          </p>
          <p className="break-all text-xs text-low">
            运行制品：{query.data.artifact_id} · 版本：
            {query.data.runtime_version ?? '待启动核验'} · 描述摘要：
            {query.data.artifact_descriptor_digest ?? '待启动核验'}
          </p>
          {query.data.runtime_health === 'FAILED_CLOSED' && (
            <p role="alert" className="text-error">
              候选进程已丢失，系统已故障关闭并恢复基线；请提交回滚事件完成审计闭环。
            </p>
          )}
          {!query.writable ? (
            <p role="status">当前客户端仅支持读取运行历史。</p>
          ) : actions.length ? (
            <div className="space-y-base">
              <label className="block space-y-half text-sm">
                <span>运行操作理由（必填）</span>
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  disabled={busy}
                  className="min-h-24 w-full border border-brand/30 bg-primary p-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
              </label>
              <div className="flex flex-wrap gap-base">
                {actions.map((action) => (
                  <ChaotangButton
                    key={action}
                    disabled={busy || !reason.trim()}
                    onClick={() => void submit(action)}
                  >
                    {runtimeActionLabels[action]} · {action}
                  </ChaotangButton>
                ))}
              </div>
            </div>
          ) : (
            <p role="status">当前状态没有可提交的运行操作。</p>
          )}
          {query.data.events.length > 0 && (
            <details open>
              <summary className="cursor-pointer">
                真实进程事件历史 · {query.data.events.length} 条
              </summary>
              <ol className="mt-base space-y-base">
                {query.data.events.map((event) => (
                  <li
                    key={event.event_id}
                    className="space-y-half break-all border border-brand/15 p-base text-xs text-low"
                  >
                    <p className="text-normal">
                      revision {event.revision} · {event.action} ·{' '}
                      {runtimeStateLabels[event.state]}
                    </p>
                    <p>运行健康：{event.runtime_health}</p>
                    <p>进程 ID：{event.process_id}</p>
                    <p>固定制品摘要：{event.artifact_digest}</p>
                    {event.department_receipt && (
                      <>
                        <p>
                          司级样本：{event.department_receipt.preset} /{' '}
                          {event.department_receipt.bureau} · scripted 步骤{' '}
                          {event.department_receipt.scripted_model_steps} ·
                          真实模型调用 0
                        </p>
                        <p>
                          样本结果摘要：{event.department_receipt.result_digest}
                        </p>
                        <p>
                          样本回执摘要：
                          {event.department_receipt.receipt_digest}
                        </p>
                      </>
                    )}
                    <p>有效绑定：{event.active_binding_digest}</p>
                    <p>事件摘要：{event.event_digest}</p>
                    <p>理由：{event.reason}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : null}
    </section>
  );
}
