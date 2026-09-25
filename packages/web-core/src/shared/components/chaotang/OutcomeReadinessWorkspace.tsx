import { useOutcomeOverview } from '@/shared/hooks/chaotang/useHanlinOutcome';
import { useShiguanArchives } from '@/shared/hooks/chaotang/useShiguan';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';
import { useState } from 'react';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';
import {
  advisoryReadError,
  buildOutcomeCreateCommand,
  decodeOutcomeProjection,
  eligibleOutcomeArchives,
  normalizeOutcomeArchiveId,
  type AdvisoryReadClient,
  type OutcomeOverview,
  type OutcomeProjection,
  type OutcomeValue,
} from './hanlinOutcomeContract';

export function OutcomeReadinessWorkspace() {
  const { user, health } = useChaotangProvider();
  if (!user || !health)
    return (
      <ChaotangPanel className="p-double" role="status">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '史馆服务未连接'}
        </h2>
        <p className="mt-base text-low">
          连接恢复后读取当前账户的认证 Outcome 总览。
        </p>
      </ChaotangPanel>
    );
  return (
    <div className="space-y-double">
      <ChaotangPanel className="p-double">
        <h2 className="chaotang-title text-2xl text-high">Outcome 结果账</h2>
        <p className="mt-base text-sm text-low">
          查看当前账户已认证的最新结果，并由当前 Owner 针对已采纳档案追加真实
          Outcome。执行完成、归档和一般确认均不自动等于 Outcome 达成。
        </p>
      </ChaotangPanel>
      <OutcomeCreatePanel />
      <OutcomeOverviewPanel />
      <ChaotangPanel className="p-double text-sm text-low">
        <p>
          统计按每个档案的当前结果计算，已被后续事件替代的历史结果不重复计数。
        </p>
        <p className="mt-base">
          结果只能由当前认证 Owner
          针对已采纳且证据完整的史馆档案追加；页面不从任务状态推断结果，不启用
          follow_up，不修改运行时绑定或发布权限。
        </p>
      </ChaotangPanel>
    </div>
  );
}

const outcomeOptions: Array<{ value: OutcomeValue; label: string }> = [
  { value: 'OBSERVING', label: '观察中' },
  { value: 'ACHIEVED', label: '已达成' },
  { value: 'PARTIAL', label: '部分达成' },
  { value: 'NOT_ACHIEVED', label: '未达成' },
];

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function OutcomeCreatePanel() {
  const client = useChaotangClient() as Partial<AdvisoryReadClient>;
  const overview = useOutcomeOverview();
  const archives = useShiguanArchives('REPLY');
  const eligibleArchives = eligibleOutcomeArchives(archives.data ?? []);
  const [archiveId, setArchiveId] = useState('');
  const [outcome, setOutcome] = useState<OutcomeValue>('OBSERVING');
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [receipt, setReceipt] = useState<OutcomeProjection>();
  const submit = async () => {
    if (busy || !attested || !client.shiguanCreateOutcome) return;
    setBusy(true);
    setProblem('');
    setReceipt(undefined);
    try {
      const id = normalizeOutcomeArchiveId(archiveId);
      const command = buildOutcomeCreateCommand(
        outcome,
        new Date(occurredAt).toISOString(),
        crypto.randomUUID()
      );
      const result = decodeOutcomeProjection(
        await client.shiguanCreateOutcome(id, command),
        id
      );
      setReceipt(result);
      setAttested(false);
      await overview.refetch();
    } catch (error) {
      setProblem(advisoryReadError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ChaotangPanel
      className="space-y-base p-double"
      aria-label="Owner 记录 Outcome"
    >
      <h3 className="chaotang-title text-lg text-high">Owner 记录 Outcome</h3>
      <p className="text-sm text-low">
        只接受已经由同一 Owner
        采纳且证据完整的史馆档案。提交会追加不可变事件；不会自动发布或切换运行时。
      </p>
      {!client.shiguanCreateOutcome ? (
        <p role="status">当前客户端暂不支持 Outcome 写入。</p>
      ) : (
        <>
          <label className="block space-y-half text-sm">
            <span>选择已采纳回奏</span>
            <select
              value={
                eligibleArchives.some((item) => item.id === archiveId)
                  ? archiveId
                  : ''
              }
              disabled={busy || archives.isPending}
              className="w-full border border-brand/30 bg-primary p-base"
              onChange={(event) => setArchiveId(event.currentTarget.value)}
            >
              <option value="">
                {archives.isPending
                  ? '正在读取史馆档案…'
                  : eligibleArchives.length
                    ? '请选择一条已采纳回奏'
                    : '最近档案中暂无已采纳回奏'}
              </option>
              {eligibleArchives.map((archive) => (
                <option key={archive.id} value={archive.id}>
                  {archive.title} · {archive.department} ·{' '}
                  {new Date(archive.createdAt).toLocaleDateString()} ·{' '}
                  {archive.id}
                </option>
              ))}
            </select>
          </label>
          {archives.isError && (
            <p role="alert" className="text-error">
              已采纳回奏读取失败：{advisoryReadError(archives.error)}
            </p>
          )}
          <label className="block space-y-half text-sm">
            <span>史馆档案 ID（可手工输入历史档案）</span>
            <input
              value={archiveId}
              maxLength={128}
              disabled={busy}
              className="w-full border border-brand/30 bg-primary p-base"
              onChange={(event) => setArchiveId(event.currentTarget.value)}
            />
          </label>
          <label className="block space-y-half text-sm">
            <span>实际结果</span>
            <select
              value={outcome}
              disabled={busy}
              className="w-full border border-brand/30 bg-primary p-base"
              onChange={(event) =>
                setOutcome(event.currentTarget.value as OutcomeValue)
              }
            >
              {outcomeOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-half text-sm">
            <span>结果发生时间</span>
            <input
              type="datetime-local"
              value={occurredAt}
              disabled={busy}
              className="w-full border border-brand/30 bg-primary p-base"
              onChange={(event) => setOccurredAt(event.currentTarget.value)}
            />
          </label>
          <label className="flex items-start gap-base text-sm">
            <input
              type="checkbox"
              checked={attested}
              disabled={busy}
              onChange={(event) => setAttested(event.currentTarget.checked)}
            />
            <span>
              我已核对该档案的采纳决定、真实结果和证据，确认由当前 Owner 登记。
            </span>
          </label>
          <ChaotangButton
            disabled={busy || !archiveId.trim() || !occurredAt || !attested}
            onClick={() => void submit()}
          >
            {busy ? '正在写入…' : '追加认证 Outcome'}
          </ChaotangButton>
        </>
      )}
      {problem && (
        <p role="alert" className="text-error">
          Outcome 写入失败：{problem}
        </p>
      )}
      {receipt && (
        <p role="status" className="break-all text-sm text-normal">
          已记录 {outcomeLabels[receipt.outcome]} · 事件 {receipt.event_id} ·
          证据 {receipt.evidence_count} 条
        </p>
      )}
    </ChaotangPanel>
  );
}

export function OutcomeOverviewPanel() {
  const query = useOutcomeOverview();
  return (
    <ChaotangPanel
      className="space-y-double p-double"
      aria-label="认证 Outcome 总览"
    >
      <div className="flex flex-wrap items-center justify-between gap-base">
        <h3 className="chaotang-title text-lg text-high">认证 Outcome 总览</h3>
        <ChaotangButton
          disabled={!query.supported || query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? '正在读取…' : '重新读取'}
        </ChaotangButton>
      </div>
      {!query.supported ? (
        <p role="status">
          当前客户端暂不支持 Outcome 总览，请使用已接入该接口的客户端。
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-error">
          Outcome 总览读取失败：{advisoryReadError(query.error)}
        </p>
      ) : query.isPending ? (
        <p role="status">正在读取认证 Outcome…</p>
      ) : query.data ? (
        <OutcomeOverviewContent data={query.data} />
      ) : (
        <p role="status">等待读取认证结果。</p>
      )}
    </ChaotangPanel>
  );
}

const outcomeLabels = {
  ACHIEVED: '已达成',
  PARTIAL: '部分达成',
  NOT_ACHIEVED: '未达成',
  OBSERVING: '观察中',
};

export function OutcomeOverviewContent({ data }: { data: OutcomeOverview }) {
  return (
    <>
      {data.total === 0 && (
        <p role="status">
          NO_DATA · 暂无已认证 Outcome。没有结果不代表成功或失败。
        </p>
      )}
      <dl className="grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['当前结果', data.total],
          ['已达成', data.achieved],
          ['部分达成', data.partial],
          ['未达成', data.not_achieved],
          ['观察中', data.observing],
          ['已定结果', data.conclusive],
          ['证据数量', data.evidence_count],
          [
            '达成率',
            data.success_rate === null
              ? '—'
              : `${Number((data.success_rate * 100).toFixed(2))}%`,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border border-brand/15 bg-primary/40 p-base"
          >
            <dt className="text-xs text-low">{label}</dt>
            <dd className="mt-half text-xl text-high">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-low">
        {data.success_rate === null
          ? '尚无可计算的已定结果。'
          : '达成率 = 已达成 / 已定结果；观察中的结果不进入分母。'}
      </p>
      <p className="break-all text-xs text-low">
        统计依据摘要：{data.basis_digest}
      </p>
      {data.sources.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-normal">
            查看统计来源 · {data.sources.length} 项
          </summary>
          <ul className="mt-base space-y-base">
            {data.sources.map((source) => (
              <li
                key={source.event_id}
                className="space-y-half break-all border border-brand/15 p-base text-xs text-low"
              >
                <p className="text-normal">
                  {outcomeLabels[source.outcome]} · 档案 {source.archive_id}
                </p>
                <p>
                  事件 {source.event_id} · 记录时间 {source.recorded_at}
                </p>
                <p>事件摘要：{source.event_digest}</p>
                <p>证据包摘要：{source.evidence_bundle_digest}</p>
                <p>证据数量：{source.evidence_count}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
