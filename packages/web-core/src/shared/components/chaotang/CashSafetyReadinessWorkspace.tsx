import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  CoinsIcon,
  DatabaseIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  useCashSafetyEvaluation,
  useHubuWorkProducts,
} from '@/shared/hooks/chaotang/useHubu';
import { useChaotangSkills } from '@/shared/hooks/chaotang/useSkills';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import type { CashSafetyInput } from '@/shared/providers/ChaotangProvider';
import { CashPlanEditor, type CashPlanRow } from './CashPlanEditor';
import { HubuArtifactDownloadButton } from './HubuArtifactDownloadButton';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

type GateState = 'available' | 'missing' | 'historical' | 'forbidden';

const CASH_INPUT_CLASS =
  'w-full border border-brand/20 bg-primary/60 px-base py-half text-sm text-normal outline-none placeholder:text-low/60 focus:border-brand/45';

const STATE_META: Record<GateState, { label: string; className: string }> = {
  available: { label: 'AVAILABLE', className: 'text-success' },
  missing: { label: 'NOT_IMPLEMENTED', className: 'text-error' },
  historical: {
    label: 'HISTORICAL_REAL · NOT_REVALIDATED',
    className: 'text-low',
  },
  forbidden: { label: 'FORBIDDEN', className: 'text-brand' },
};

export function CashSafetyReadinessWorkspace() {
  const { user, health } = useChaotangProvider();
  const skills = useChaotangSkills();
  const products = useHubuWorkProducts();

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '户部事实源未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          现金安全分析必须绑定当前 owner、正式证据与户部 WorkProduct。
        </p>
      </ChaotangPanel>
    );
  }

  if (skills.isPending || products.isPending) {
    return (
      <div className="h-[560px] animate-pulse border border-brand/15 bg-panel/60" />
    );
  }

  if (skills.isError || products.isError) {
    return (
      <ChaotangPanel className="p-double text-center">
        <WarningIcon className="mx-auto size-7 text-error" weight="duotone" />
        <h2 className="chaotang-title mt-base text-xl text-error">
          现金安全准备度读取失败
        </h2>
        <p className="mt-base text-sm text-low">
          {skills.error?.message ?? products.error?.message}
        </p>
      </ChaotangPanel>
    );
  }

  const skill = skills.data.items.find(
    (item) => item.skillId === 'analyze-cash-safety'
  );
  const cashProducts = products.data.filter(
    (item) => item.capabilityId === 'analyze-cash-safety'
  );

  return (
    <div className="space-y-double">
      <ChaotangPanel className="relative overflow-hidden p-double">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(194,155,76,0.2),transparent_68%)]" />
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div className="relative">
            <p className="text-[9px] tracking-[0.24em] text-brand/55">
              HUBU CASH SAFETY READINESS
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              现金安全研判
            </h2>
            <p className="mt-base max-w-3xl text-sm leading-relaxed text-low">
              以真实余额、近三个月现金流和未来收付款计划，计算资金可支撑月数与
              31 天现金预测；结论必须经人确认。
            </p>
          </div>
          <span className="border border-brand/30 bg-brand/10 px-base py-half text-[9px] tracking-[0.14em] text-brand">
            确定性计算 · 人工确认
          </span>
        </div>

        <div className="mt-double grid gap-base sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="现金安全 Skill"
            value={skill?.enabled ? 'ENABLED' : 'UNAVAILABLE'}
            detail={skill?.version ?? '未登记'}
          />
          <Metric
            label="现行现金分析"
            value={String(cashProducts.length)}
            detail="仅统计正式 WorkProduct"
          />
          <Metric
            label="付款执行"
            value="关闭"
            detail="paymentExecuted=false"
          />
          <Metric label="账簿写入" value="关闭" detail="ledgerPosted=false" />
        </div>
      </ChaotangPanel>

      <CashSafetyEvaluationForm />

      <details>
        <summary className="cursor-pointer text-sm text-low">
          查看能力依据与接入说明
        </summary>
        <div className="mt-base grid gap-double xl:grid-cols-[1.18fr_0.82fr]">
          <ChaotangPanel className="p-double">
            <div className="flex items-center gap-base">
              <CoinsIcon className="size-5 text-brand" weight="duotone" />
              <h3 className="chaotang-title text-lg text-high">专业能力门槛</h3>
            </div>
            <div className="mt-double space-y-half">
              <Gate
                title="analyze-cash-safety RuntimeSkill"
                state={skill?.enabled ? 'available' : 'missing'}
                detail={
                  skill
                    ? `现行目录已登记 ${skill.agentId} · v${skill.version}；登记不等于专业 kernel 已接通。`
                    : '当前 RuntimeSkill 目录没有找到现金安全能力。'
                }
              />
              <Gate
                title="户部 WorkProduct 事实源"
                state="available"
                detail="复用现有 owner-scoped WorkProduct、证据、风险、成果 manifest 与确认记录，不另建数据库。"
              />
              <Gate
                title="确定性现金安全 kernel"
                state="available"
                detail="当前主线已接通 Decimal 确定性计算核，可计算 runway、风险等级与 31 天逐日预测。"
              />
              <Gate
                title="hubu-cash-safety 专业 BFF"
                state="available"
                detail="已接通 owner/session 认证、严格输入校验与无副作用评估接口；暂不归档。"
              />
              <Gate
                title="证据与 attestation gate"
                state="available"
                detail="已接入 source refs、数据期间、所有者确认与缺证失败关闭合同。"
              />
              <Gate
                title="正式回复、WorkProduct 与史馆绑定"
                state="available"
                detail="创建时生成正式 WorkProduct 与证据 manifest；仅在人工确认后生成幂等史馆回奏。"
              />
              <Gate
                title="HV-05 历史 donor"
                state="historical"
                detail="82e234a4b 与 83e2accf 只能按 allowlist 提炼 kernel、合同和测试，不能整包恢复旧 overlay。"
              />
              <Gate
                title="付款、入账与外部动作"
                state="forbidden"
                detail="强制保持 externalEffects=NONE、paymentExecuted=false、ledgerPosted=false。"
              />
            </div>
          </ChaotangPanel>

          <div className="flex flex-col gap-double">
            <ChaotangPanel className="p-double">
              <div className="flex items-center gap-base">
                <DatabaseIcon className="size-5 text-brand" weight="duotone" />
                <h3 className="chaotang-title text-lg text-high">输入合同</h3>
              </div>
              <div className="mt-double flex flex-wrap gap-half">
                {[
                  '现金',
                  '银行',
                  '受限资金',
                  '三个月流入',
                  '三个月流出',
                  '计划动作 ≤ 128',
                  'attestation',
                  'source refs',
                ].map((item) => (
                  <span
                    key={item}
                    className="border border-brand/20 bg-brand/5 px-half py-half text-[9px] text-normal"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <p className="mt-double text-xs leading-relaxed text-low">
                缺少期间、币种、来源或所有者确认时必须返回
                NEEDS_DATA，不能以零值补齐。
              </p>
            </ChaotangPanel>

            <ChaotangPanel className="p-double">
              <div className="flex items-center gap-base">
                <ShieldCheckIcon
                  className="size-5 text-success"
                  weight="duotone"
                />
                <h3 className="chaotang-title text-lg text-high">输出合同</h3>
              </div>
              <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
                <li>风险等级与 runway。</li>
                <li>31 天逐日现金预测。</li>
                <li>evidence / risk / check codes。</li>
                <li>恰好三条互不重复的建议。</li>
                <li>绑定正式回复、WorkProduct 与史馆记录。</li>
              </ul>
            </ChaotangPanel>

            <ChaotangPanel className="p-double">
              <div className="flex items-center gap-base">
                <LockKeyIcon className="size-5 text-error" weight="duotone" />
                <h3 className="chaotang-title text-lg text-high">接入顺序</h3>
              </div>
              <ol className="mt-double space-y-base text-xs leading-relaxed text-low">
                <li>1. 冻结 donor allowlist、blob 与 digest。</li>
                <li>2. 将确定性 kernel 重建进当前 RuntimeSkill。</li>
                <li>3. 接入 owner/session、证据和输入校验。</li>
                <li>4. 已生成 WorkProduct；人工确认后绑定正式回复与史馆。</li>
                <li>
                  5. 完成 no-payment/no-ledger/no-external-effect
                  负测后开放创建分析。
                </li>
              </ol>
              <ChaotangButton
                className="mt-double"
                onClick={() =>
                  void Promise.all([skills.refetch(), products.refetch()])
                }
                disabled={skills.isFetching || products.isFetching}
              >
                <ArrowsClockwiseIcon
                  className={cn(
                    'size-4',
                    (skills.isFetching || products.isFetching) && 'animate-spin'
                  )}
                />
                重新核验准备度
              </ChaotangButton>
            </ChaotangPanel>
          </div>
        </div>
      </details>
    </div>
  );
}

function CashSafetyEvaluationForm() {
  const evaluation = useCashSafetyEvaluation();
  const [lastResult, setLastResult] =
    useState<NonNullable<ReturnType<typeof useCashSafetyEvaluation>['data']>>();
  const [showResult, setShowResult] = useState(false);
  const resultView = useRef<HTMLDivElement>(null);
  const showingResult = showResult && Boolean(lastResult);
  useEffect(() => {
    if (showingResult) {
      resultView.current?.focus({ preventScroll: true });
      resultView.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [showingResult]);
  const [period, setPeriod] = useState('');
  const [asOf, setAsOf] = useState('');
  const [attested, setAttested] = useState(false);
  const [balances, setBalances] = useState({
    cash: { amount: '', source: '' },
    bank: { amount: '', source: '' },
    reserved: { amount: '', source: '' },
  });
  const [flows, setFlows] = useState([
    { inflow: '', outflow: '', source: '' },
    { inflow: '', outflow: '', source: '' },
    { inflow: '', outflow: '', source: '' },
  ]);
  const [scheduledRows, setScheduledRows] = useState<CashPlanRow[]>([]);
  const [localError, setLocalError] = useState<string>();
  const flowPeriods = useMemo(
    () => [2, 1, 0].map((offset) => previousMonth(period, offset)),
    [period]
  );
  const ready =
    period.length === 7 &&
    asOf.length === 10 &&
    Object.values(balances).every((item) => item.amount.trim()) &&
    flows.every((item) => item.inflow.trim() && item.outflow.trim());

  const submit = () => {
    setLocalError(undefined);
    if (scheduledRows.some((row) => !row.dueDate || !row.amount.trim())) {
      setLocalError('请补齐每笔计划的日期和金额，或移除暂不需要的计划。');
      return;
    }
    const scheduledMovements = scheduledRows.map((row) => ({
      ...row,
      amount: row.amount.trim(),
      sourceReference: row.sourceReference?.trim() || null,
      attested,
    }));
    const evidence = (item: { amount: string; source: string }) => ({
      amount: item.amount,
      sourceReference: item.source.trim() || null,
      attested,
    });
    const input: CashSafetyInput = {
      kind: 'hubu.cash-safety-review.v1',
      period,
      asOf,
      currency: 'CNY',
      balances: {
        cash: evidence(balances.cash),
        bank: evidence(balances.bank),
        reserved: evidence(balances.reserved),
      },
      monthlyFlows: flows.map((item, index) => ({
        period: flowPeriods[index],
        inflow: item.inflow,
        outflow: item.outflow,
        sourceReference: item.source.trim() || null,
        attested,
      })),
      scheduledMovements,
    };
    evaluation.mutate(input, {
      onSuccess: (result) => {
        setLastResult(result);
        setShowResult(true);
      },
    });
  };

  return (
    <ChaotangPanel className="p-double">
      <div hidden={showingResult}>
        {lastResult && (
          <div className="mb-double space-y-base">
            <p className="text-sm text-low">
              正在修改输入。上一版成果仍保留；重新生成成功后才会呈送新版。
            </p>
            <ChaotangButton
              onClick={() => setShowResult(true)}
              disabled={evaluation.isPending}
            >
              查看上一版成果
            </ChaotangButton>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.2em] text-brand/55">
              DETERMINISTIC WORK PRODUCT · HUMAN CONFIRMATION
            </p>
            <h3 className="chaotang-title mt-half text-xl text-high">
              创建现金安全分析
            </h3>
            <p className="mt-half text-xs leading-relaxed text-low">
              金额仅接受非负 CNY；计算后生成正式成果，但仍不付款、不入账。
            </p>
          </div>
          <span className="border border-brand/25 px-base py-half text-[9px] text-brand">
            hubu-cash-safety-v1
          </span>
        </div>

        <div className="mt-double grid gap-base md:grid-cols-2">
          <Field label="最后完整月份">
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className={CASH_INPUT_CLASS}
            />
          </Field>
          <Field label="评估基准日">
            <input
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
              className={CASH_INPUT_CLASS}
            />
          </Field>
        </div>

        <h4 className="mt-double text-xs text-brand">资金余额</h4>
        <div className="mt-base grid gap-base lg:grid-cols-3">
          {(
            [
              ['cash', '现金'],
              ['bank', '银行存款'],
              ['reserved', '受限资金'],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className="border border-brand/15 bg-primary/30 p-base"
            >
              <p className="text-xs text-normal">{label}</p>
              <input
                inputMode="decimal"
                placeholder="金额"
                value={balances[key].amount}
                onChange={(event) =>
                  setBalances((current) => ({
                    ...current,
                    [key]: { ...current[key], amount: event.target.value },
                  }))
                }
                className={cn(CASH_INPUT_CLASS, 'mt-base')}
              />
              <input
                placeholder="数据来源（缺少时无法计算支撑月数）"
                value={balances[key].source}
                onChange={(event) =>
                  setBalances((current) => ({
                    ...current,
                    [key]: { ...current[key], source: event.target.value },
                  }))
                }
                className={cn(CASH_INPUT_CLASS, 'mt-half')}
              />
            </div>
          ))}
        </div>

        <h4 className="mt-double text-xs text-brand">最近三个月现金流</h4>
        <div className="mt-base space-y-half">
          {flows.map((item, index) => (
            <div
              key={index}
              className="grid gap-half border border-brand/15 bg-primary/30 p-base md:grid-cols-[100px_1fr_1fr_1.4fr]"
            >
              <span className="self-center text-xs text-normal">
                {flowPeriods[index] || '选择月份'}
              </span>
              {(['inflow', 'outflow', 'source'] as const).map((key) => (
                <input
                  key={key}
                  inputMode={key === 'source' ? undefined : 'decimal'}
                  placeholder={
                    key === 'inflow'
                      ? '流入'
                      : key === 'outflow'
                        ? '流出'
                        : '来源引用'
                  }
                  value={item[key]}
                  onChange={(event) =>
                    setFlows((current) =>
                      current.map((flow, flowIndex) =>
                        flowIndex === index
                          ? { ...flow, [key]: event.target.value }
                          : flow
                      )
                    )
                  }
                  className={CASH_INPUT_CLASS}
                />
              ))}
            </div>
          ))}
        </div>

        <CashPlanEditor
          asOf={asOf}
          rows={scheduledRows}
          onChange={setScheduledRows}
          disabled={evaluation.isPending}
        />

        <label className="mt-base flex items-start gap-half text-xs leading-relaxed text-low">
          <input
            type="checkbox"
            checked={attested}
            onChange={(event) => setAttested(event.target.checked)}
            className="mt-px"
          />
          我确认上述来源与金额是本次提交所依据的数据。未勾选仍可计算可用资金，但不会计算
          资金可支撑月数。
        </label>

        {(localError || evaluation.isError) && (
          <p
            role="alert"
            className="mt-base border border-error/25 bg-error/5 p-base text-xs text-error"
          >
            {localError ?? evaluation.error?.message}
          </p>
        )}
        <ChaotangButton
          className="mt-double"
          disabled={!ready || evaluation.isPending}
          onClick={submit}
        >
          {evaluation.isPending ? '正在生成分析…' : '生成现金分析与 Excel'}
        </ChaotangButton>
      </div>
      {showingResult && lastResult && (
        <div ref={resultView} tabIndex={-1} aria-label="本次现金分析成果">
          <ChaotangButton onClick={() => setShowResult(false)}>
            修改数据，重新分析
          </ChaotangButton>
          <CashSafetyResult result={lastResult} />
        </div>
      )}
    </ChaotangPanel>
  );
}

function CashSafetyResult({
  result,
}: {
  result: NonNullable<ReturnType<typeof useCashSafetyEvaluation>['data']>;
}) {
  return (
    <div className="mt-double border border-brand/30 bg-[#e8dfc8]/[0.94] p-double text-[#282116] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-base border-b border-[#8c7440]/25 pb-base">
        <div>
          <p className="text-[9px] tracking-[0.22em] text-[#806a38]">
            TREASURY VERDICT
          </p>
          <h4 className="chaotang-title mt-half text-xl text-[#282116]">
            现金安全研判书
          </h4>
        </div>
        <span className="border border-[#8c7440]/35 px-base py-half text-[9px] text-[#6e592d]">
          {result.persistenceStatus}
        </span>
      </div>
      {result.artifactId && (
        <div className="mt-base space-y-base border border-brand/25 bg-white/25 p-base text-xs leading-relaxed text-[#514735]">
          <p>
            {result.persistenceStatus !== 'PERSISTED'
              ? '分析结果尚未保存'
              : result.confirmationStatus === 'CONFIRMED'
                ? '分析文件已生成 · 已确认'
                : result.missingEvidenceCodes.length > 0
                  ? '分析文件已生成 · 资料待补齐'
                  : '分析文件已生成 · 待确认'}
          </p>
          <HubuArtifactDownloadButton
            artifactId={result.artifactId}
            published={result.persistenceStatus === 'PERSISTED'}
          />
          <p>可先下载核对数据；文件生成不代表结论已经通过验收。</p>
        </div>
      )}
      <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="风险等级" value={result.riskLevel} detail="确定性规则" />
        <Metric label="可用资金" value={result.availableCash} detail="CNY" />
        <Metric
          label="资金可支撑月数"
          value={result.runwayMonths ?? '未计算'}
          detail={result.runwayState}
        />
        <Metric
          label="第 31 天余额"
          value={result.forecastEndingCash}
          detail="CNY"
        />
      </div>
      {result.missingEvidenceCodes.length > 0 && (
        <p className="mt-base border border-error/25 bg-error/5 p-base text-xs text-error">
          缺证：{result.missingEvidenceCodes.join(' · ')}
        </p>
      )}
      <div className="mt-double grid gap-base lg:grid-cols-3">
        {result.recommendations.map((item) => (
          <div
            key={item.code}
            className="border border-[#8c7440]/25 bg-white/25 p-base"
          >
            <p className="text-xs text-[#6e592d]">{item.title}</p>
            <p className="mt-base text-xs leading-relaxed text-[#514735]">
              {item.action}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-double border-t border-[#8c7440]/20 pt-base text-[10px] text-[#655a46]">
        {result.dailyForecast.length} 天预测 · {result.persistenceStatus} ·
        externalEffects={result.externalEffects} · paymentExecuted=
        {String(result.paymentExecuted)} · ledgerPosted=
        {String(result.ledgerPosted)}
      </p>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-xs text-low">{label}</span>
      <div className="mt-half">{children}</div>
    </label>
  );
}

function previousMonth(period: string, offset: number): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return '';
  const [year, month] = period.split('-').map(Number);
  const value = year * 12 + month - 1 - offset;
  const resultYear = Math.floor(value / 12);
  const resultMonth = (value % 12) + 1;
  return `${resultYear.toString().padStart(4, '0')}-${resultMonth.toString().padStart(2, '0')}`;
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border border-brand/15 bg-primary/40 p-base">
      <p className="text-xs text-low">{label}</p>
      <p className="chaotang-title mt-base text-2xl text-high">{value}</p>
      <p className="mt-half text-[9px] text-low">{detail}</p>
    </div>
  );
}

function Gate({
  title,
  state,
  detail,
}: {
  title: string;
  state: GateState;
  detail: string;
}) {
  const meta = STATE_META[state];
  const Icon =
    state === 'available'
      ? CheckCircleIcon
      : state === 'historical'
        ? ClockCounterClockwiseIcon
        : state === 'forbidden'
          ? LockKeyIcon
          : DatabaseIcon;
  return (
    <div className="border border-brand/15 bg-primary/30 p-base">
      <div className="flex flex-wrap items-center justify-between gap-half">
        <div className="flex items-center gap-half">
          <Icon className={cn('size-4', meta.className)} weight="duotone" />
          <p className="text-sm text-normal">{title}</p>
        </div>
        <span className={cn('text-[9px] tracking-[0.12em]', meta.className)}>
          {meta.label}
        </span>
      </div>
      <p className="mt-half text-xs leading-relaxed text-low">{detail}</p>
    </div>
  );
}
