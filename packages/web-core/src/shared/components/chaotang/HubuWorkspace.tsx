import { useState } from 'react';
import {
  CheckCircleIcon,
  CoinsIcon,
  DownloadSimpleIcon,
  FileXlsIcon,
  ShieldCheckIcon,
  SealCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  useHubuArtifactDownload,
  useHubuConfirmation,
  useHubuWorkProduct,
  useHubuWorkProducts,
} from '@/shared/hooks/chaotang/useHubu';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import type {
  HubuWorkProduct,
  HubuWorkProductSummary,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

type HubuMode =
  | 'overview'
  | 'reports'
  | 'products'
  | 'artifacts'
  | 'confirmations';

const confirmationLabel = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  REVISION_REQUIRED: '要求退修',
  ESCALATED: '已升级',
} as const;

export function HubuWorkspace({ mode }: { mode: HubuMode }) {
  const { user, health } = useChaotangProvider();
  const products = useHubuWorkProducts();
  const [selectedId, setSelectedId] = useState<string>();
  const detail = useHubuWorkProduct(selectedId);
  const download = useHubuArtifactDownload();
  const confirmation = useHubuConfirmation();
  const [confirmArtifactId, setConfirmArtifactId] = useState<string>();
  const [confirmationReason, setConfirmationReason] = useState('');

  const downloadArtifact = async (artifactId: string) => {
    const file = await download.mutateAsync(artifactId);
    const blob = new Blob([new Uint8Array(file.bytes)], {
      type: file.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '户部成果服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          会计成果与 WorkProduct 严格按当前账户隔离。
        </p>
      </ChaotangPanel>
    );
  }
  if (products.isPending) {
    return (
      <div className="h-96 animate-pulse border border-brand/15 bg-panel/60" />
    );
  }
  if (products.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {products.error.message}
      </ChaotangPanel>
    );
  }

  if (mode === 'overview') {
    const pending = products.data.filter(
      (item) => item.confirmationStatus === 'PENDING'
    ).length;
    const revision = products.data.filter(
      (item) => item.confirmationStatus === 'REVISION_REQUIRED'
    ).length;
    const published = products.data.filter(
      (item) => item.artifactState === 'PUBLISHED'
    ).length;
    return (
      <div className="space-y-double">
        <TreasuryBanner
          productCount={products.data.length}
          pendingCount={pending}
          publishedCount={published}
        />
        <div className="grid gap-base sm:grid-cols-4">
          {[
            { label: '成果总数', value: products.data.length },
            { label: '已发布', value: published },
            { label: '待确认', value: pending },
            { label: '要求退修', value: revision },
          ].map((item) => (
            <ChaotangPanel key={item.label} className="p-base">
              <p className="text-xs text-low">{item.label}</p>
              <p className="chaotang-title mt-half text-2xl text-brand">
                {item.value}
              </p>
            </ChaotangPanel>
          ))}
        </div>
        <ChaotangPanel className="p-double">
          <div className="flex flex-wrap items-end justify-between gap-base border-b border-brand/15 pb-base">
            <div>
              <p className="text-[9px] tracking-[0.22em] text-brand/55">
                TREASURY LEDGER
              </p>
              <h2 className="chaotang-title mt-half text-xl text-high">
                近期会计成果
              </h2>
            </div>
            <p className="text-xs text-low">只读判断 · 待人工确认后归档</p>
          </div>
          {products.data.length === 0 ? (
            <EmptyState>当前账户尚无正式会计成果</EmptyState>
          ) : (
            <div className="mt-double grid gap-base md:grid-cols-2">
              {products.data.slice(0, 6).map((item) => (
                <ProductCard key={item.artifactId} item={item} />
              ))}
            </div>
          )}
        </ChaotangPanel>
      </div>
    );
  }

  if (mode === 'artifacts') {
    return (
      <div className="space-y-double">
        <TreasuryBanner
          productCount={products.data.length}
          pendingCount={
            products.data.filter(
              (item) => item.confirmationStatus === 'PENDING'
            ).length
          }
          publishedCount={
            products.data.filter((item) => item.artifactState === 'PUBLISHED')
              .length
          }
          compact
        />
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-xl text-high">成果文件</h2>
          <p className="mt-base text-xs text-low">
            仅 PUBLISHED 成果可下载；服务端会重新核验 owner、登记记录与内容
            digest。
          </p>
          {download.isError && (
            <p className="mt-base border border-error/25 bg-error/5 p-base text-xs text-error">
              {download.error.message}
            </p>
          )}
          {products.data.length === 0 ? (
            <EmptyState>当前没有成果文件</EmptyState>
          ) : (
            <div className="mt-double space-y-base">
              {products.data.map((item) => (
                <article
                  key={item.artifactId}
                  className="flex flex-wrap items-center gap-base border border-brand/15 bg-primary/45 p-base"
                >
                  <FileXlsIcon className="size-6 text-brand" weight="duotone" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-high">
                      {item.artifactId}.xlsx
                    </p>
                    <p className="mt-half font-mono text-[9px] text-low">
                      SHA256 {item.contentDigest.slice(0, 16)}…
                    </p>
                  </div>
                  <span className="text-xs text-brand">
                    {item.artifactState}
                  </span>
                  <button
                    type="button"
                    onClick={() => void downloadArtifact(item.artifactId)}
                    disabled={
                      item.artifactState !== 'PUBLISHED' || download.isPending
                    }
                    className="inline-flex items-center gap-half border border-brand/25 px-base py-half text-xs text-brand transition-colors hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <DownloadSimpleIcon className="size-4" />
                    {download.isPending &&
                    download.variables === item.artifactId
                      ? '校验中…'
                      : '下载 XLSX'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </ChaotangPanel>
      </div>
    );
  }

  if (mode === 'confirmations') {
    return (
      <div className="space-y-double">
        <TreasuryBanner
          productCount={products.data.length}
          pendingCount={
            products.data.filter(
              (item) => item.confirmationStatus === 'PENDING'
            ).length
          }
          publishedCount={
            products.data.filter((item) => item.artifactState === 'PUBLISHED')
              .length
          }
          compact
        />
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-xl text-high">成果确认记录</h2>
          <p className="mt-base text-xs text-low">
            确认决定将生成不可变 receipt；提交后不能覆盖、删除或再次确认。
          </p>
          {confirmation.isError && (
            <p className="mt-base border border-error/25 bg-error/5 p-base text-xs text-error">
              {confirmation.error.message}
            </p>
          )}
          {products.data.length === 0 ? (
            <EmptyState>当前没有成果确认记录</EmptyState>
          ) : (
            <div className="mt-double space-y-base">
              {products.data.map((item) => {
                const eligible =
                  item.workStatus === 'READY_FOR_HUMAN_CONFIRMATION' &&
                  item.confirmationStatus === 'PENDING';
                const active = confirmArtifactId === item.artifactId;
                return (
                  <article
                    key={item.artifactId}
                    className="border border-brand/15 bg-primary/45 p-base"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-base">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-brand">
                          {item.capabilityId}
                        </p>
                        <p className="mt-base text-sm leading-relaxed text-normal">
                          {item.decision}
                        </p>
                        <p className="mt-base text-[10px] text-low">
                          {confirmationLabel[item.confirmationStatus]} · receipt{' '}
                          {item.confirmationReceiptCount} · v{item.version}
                        </p>
                      </div>
                      {eligible && !active && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmArtifactId(item.artifactId);
                            setConfirmationReason('');
                            confirmation.reset();
                          }}
                          className="border border-brand/25 px-base py-half text-xs text-brand hover:bg-brand/10"
                        >
                          人工处置
                        </button>
                      )}
                    </div>
                    {active && (
                      <div className="mt-double border-t border-brand/15 pt-double">
                        <label
                          className="text-xs text-low"
                          htmlFor={`reason-${item.artifactId}`}
                        >
                          结构化理由（必填）
                        </label>
                        <textarea
                          id={`reason-${item.artifactId}`}
                          value={confirmationReason}
                          onChange={(event) =>
                            setConfirmationReason(
                              event.target.value.slice(0, 2000)
                            )
                          }
                          rows={3}
                          placeholder="写明确认依据、退修要求或升级原因…"
                          className="mt-half w-full resize-y border border-brand/20 bg-primary/60 p-base text-sm text-normal outline-none focus:border-brand/45"
                        />
                        <div className="mt-base flex flex-wrap gap-half">
                          {(
                            [
                              ['CONFIRMED', '确认成果'],
                              ['REVISION_REQUIRED', '要求退修'],
                              ['ESCALATED', '升级处理'],
                            ] as const
                          ).map(([decision, label]) => (
                            <button
                              key={decision}
                              type="button"
                              disabled={
                                !confirmationReason.trim() ||
                                confirmation.isPending
                              }
                              onClick={() =>
                                confirmation.mutate(
                                  {
                                    artifactId: item.artifactId,
                                    decision,
                                    structuredReason: confirmationReason,
                                  },
                                  {
                                    onSuccess: () => {
                                      setConfirmArtifactId(undefined);
                                      setConfirmationReason('');
                                    },
                                  }
                                )
                              }
                              className="border border-brand/25 px-base py-half text-xs text-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              {confirmation.isPending &&
                              confirmation.variables?.decision === decision
                                ? '提交中…'
                                : label}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={confirmation.isPending}
                            onClick={() => setConfirmArtifactId(undefined)}
                            className="px-base py-half text-xs text-low hover:text-normal"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </ChaotangPanel>
      </div>
    );
  }

  return (
    <div className="space-y-double">
      <TreasuryBanner
        productCount={products.data.length}
        pendingCount={
          products.data.filter((item) => item.confirmationStatus === 'PENDING')
            .length
        }
        publishedCount={
          products.data.filter((item) => item.artifactState === 'PUBLISHED')
            .length
        }
        compact
      />
      <div className="grid gap-double xl:grid-cols-[0.8fr_1.35fr]">
        <ChaotangPanel className="p-double xl:bg-[#e8dfc8]/[0.94] xl:text-[#282116]">
          <h2 className="chaotang-title text-lg text-high">
            {mode === 'reports' ? '会计管理报告' : 'WorkProduct'}
          </h2>
          {products.data.length === 0 ? (
            <EmptyState>当前账户尚无会计管理报告</EmptyState>
          ) : (
            <div className="mt-double max-h-[620px] space-y-half overflow-y-auto">
              {products.data.map((item) => (
                <button
                  key={item.artifactId}
                  type="button"
                  onClick={() => setSelectedId(item.artifactId)}
                  className={cn(
                    'w-full border p-base text-left',
                    selectedId === item.artifactId
                      ? 'border-brand/45 bg-brand/10'
                      : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                  )}
                >
                  <p className="truncate text-sm text-high">{item.decision}</p>
                  <div className="mt-half flex justify-between gap-base text-[10px] text-low">
                    <span>{item.capabilityId}</span>
                    <span>{confirmationLabel[item.confirmationStatus]}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ChaotangPanel>
        <ChaotangPanel className="p-double">
          {!selectedId ? (
            <EmptyState>选择一项成果查看事实、建议、证据和风险</EmptyState>
          ) : detail.isPending ? (
            <div className="h-80 animate-pulse bg-brand/5" />
          ) : detail.isError ? (
            <p className="text-sm text-error">{detail.error.message}</p>
          ) : detail.data.capabilityId === 'analyze-cash-safety' ? (
            <CashSafetyWorkProductDetail detail={detail.data} />
          ) : mode === 'reports' ? (
            <AccountingReportDetail detail={detail.data} />
          ) : (
            <article>
              <div className="flex flex-wrap justify-between gap-base border-b border-brand/15 pb-double">
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-brand/55">
                    {detail.data.capabilityId} · v{detail.data.version}
                  </p>
                  <h2 className="chaotang-title mt-half text-2xl text-high">
                    WorkProduct
                  </h2>
                </div>
                <span className="text-xs text-brand">
                  {confirmationLabel[detail.data.confirmationStatus]}
                </span>
              </div>
              <p className="mt-double text-sm leading-7 text-normal">
                {detail.data.decision}
              </p>
              <DetailList title="建议" items={detail.data.recommendations} />
              <DetailList title="已用证据" items={detail.data.evidenceUsed} />
              <DetailList title="风险登记" items={detail.data.riskRegister} />
              {detail.data.missingEvidence.length > 0 && (
                <DetailList
                  title="缺失证据"
                  items={detail.data.missingEvidence}
                  danger
                />
              )}
              <div className="mt-double grid gap-base border-t border-brand/15 pt-double text-xs sm:grid-cols-2">
                <p className="text-low">
                  成果状态：
                  <span className="text-normal">
                    {detail.data.artifactState}
                  </span>
                </p>
                <p className="text-low">
                  确认记录：
                  <span className="text-normal">
                    {detail.data.confirmationReceipts.length}
                  </span>
                </p>
              </div>
            </article>
          )}
        </ChaotangPanel>
      </div>
    </div>
  );
}

function TreasuryBanner({
  productCount,
  pendingCount,
  publishedCount,
  compact = false,
}: {
  productCount: number;
  pendingCount: number;
  publishedCount: number;
  compact?: boolean;
}) {
  return (
    <ChaotangPanel className="relative overflow-hidden p-double">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,rgba(194,155,76,0.18),transparent_68%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-double">
        <div className="flex items-start gap-base">
          <div className="border border-brand/35 bg-brand/10 p-base text-brand">
            <CoinsIcon className="size-7" weight="duotone" />
          </div>
          <div>
            <p className="text-[9px] tracking-[0.28em] text-brand/60">
              HUBU · TREASURY JUDGMENT
            </p>
            <h1 className="chaotang-title mt-half text-2xl text-high">
              户部 · 财务判断台
            </h1>
            {!compact && (
              <p className="mt-base max-w-2xl text-sm leading-relaxed text-low">
                汇集真实账务成果、现金安全判断与人工确认。系统只计算、提示和留痕，不代替负责人付款或入账。
              </p>
            )}
          </div>
        </div>
        <div className="grid min-w-[280px] grid-cols-3 border border-brand/20 bg-primary/35">
          {[
            ['正式成果', productCount],
            ['已发布', publishedCount],
            ['待确认', pendingCount],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-r border-brand/15 p-base text-center last:border-r-0"
            >
              <p className="chaotang-title text-xl text-brand">{value}</p>
              <p className="mt-half text-[9px] text-low">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-base flex flex-wrap gap-half text-[9px] tracking-[0.08em]">
        <span className="inline-flex items-center gap-half text-success">
          <ShieldCheckIcon className="size-4" /> 证据与所有者隔离已启用
        </span>
        <span className="text-low">
          · externalEffects=NONE · 不付款 · 不入账
        </span>
      </div>
    </ChaotangPanel>
  );
}

function CashSafetyWorkProductDetail({ detail }: { detail: HubuWorkProduct }) {
  const fact = detail.facts.find(isRecord);
  const fields = [
    ['期间', fact?.period],
    ['基准日', fact?.as_of],
    ['风险等级', fact?.risk_level],
    ['可用资金', fact?.available_cash],
    ['月净消耗', fact?.monthly_net_burn],
    ['runway 月数', fact?.runway_months],
    ['第 31 天余额', fact?.forecast_ending_cash],
    ['规则版本', fact?.rule_version],
  ] as const;
  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
        <div>
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            HUBU CASH SAFETY WORK PRODUCT · v{detail.version}
          </p>
          <h2 className="chaotang-title mt-half text-2xl text-high">
            现金安全评估成果
          </h2>
          <p className="mt-half text-xs text-low">
            artifact {detail.artifactId} · reply {detail.replyId ?? '尚未绑定'}
          </p>
        </div>
        <span className="border border-brand/25 px-base py-half text-xs text-brand">
          {confirmationLabel[detail.confirmationStatus]}
        </span>
      </div>
      <div className="mt-double grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        {fields.map(([label, value]) => (
          <ReportMetric
            key={label}
            label={label}
            value={value == null ? '—' : String(value)}
          />
        ))}
      </div>
      <DetailList title="建议" items={detail.recommendations} />
      <DetailList title="已用证据" items={detail.evidenceUsed} />
      <DetailList title="风险登记" items={detail.riskRegister} />
      {detail.missingEvidence.length > 0 && (
        <DetailList title="缺失证据" items={detail.missingEvidence} danger />
      )}
      <div className="mt-double border-t border-brand/15 pt-double text-xs leading-relaxed text-low">
        {detail.shiguanArchiveId ? (
          <span className="text-success">
            已形成史馆回奏：{detail.shiguanArchiveId}
          </span>
        ) : detail.confirmationStatus === 'PENDING' ? (
          '人工确认后才会形成史馆回奏；当前仍不代表已审批或已执行。'
        ) : (
          '该成果未形成史馆确认回奏。'
        )}
      </div>
    </article>
  );
}

const ACCOUNTING_SHEETS = [
  '管理摘要',
  '核心财务报表',
  '科目趋势',
  '异常分析',
  '科目明细',
  '校验结果',
  '数据来源',
] as const;

function AccountingReportDetail({ detail }: { detail: HubuWorkProduct }) {
  const gatePassed = detail.artifactGate.status === 'PASSED';
  const projection = detail.accountingProjection;
  const projectionAvailable = projection?.status === 'AVAILABLE';
  const sheetNames = projection?.sheetNames ?? ACCOUNTING_SHEETS;
  const controlTotals = projection?.controlTotals ?? [];
  const manifests = detail.artifactManifest.filter(isRecord);
  const facts = detail.facts.filter(isRecord);

  return (
    <article>
      <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
        <div>
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            ACCOUNTING MANAGEMENT REPORT · v{detail.version}
          </p>
          <h2 className="chaotang-title mt-half text-2xl text-high">
            会计管理报告
          </h2>
          <p className="mt-half text-xs text-low">
            run {detail.runId} · reply {detail.replyId ?? '尚未绑定'}
          </p>
        </div>
        <span
          className={cn(
            'border px-base py-half text-[9px] tracking-[0.12em]',
            gatePassed
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-error/30 bg-error/5 text-error'
          )}
        >
          ARTIFACT GATE · {detail.artifactGate.status}
        </span>
      </div>

      <div className="mt-double grid gap-base sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetric label="确定性事实" value={String(facts.length)} />
        <ReportMetric
          label="来源 digest"
          value={String(detail.evidenceUsed.length)}
        />
        <ReportMetric
          label="异常 / 冲突"
          value={String(detail.conflicts.length)}
        />
        <ReportMetric
          label="确认状态"
          value={confirmationLabel[detail.confirmationStatus]}
        />
      </div>

      <section className="mt-double">
        <h3 className="chaotang-title text-lg text-high">固定七个工作表</h3>
        <p className="mt-half text-xs leading-relaxed text-low">
          {gatePassed
            ? '发布门已验证工作簿的工作表集合、文件哈希、事实 lineage 与质量检查。'
            : '发布门未通过，不能宣称七表完整或勾稽正确。'}
        </p>
        <div className="mt-base grid gap-half sm:grid-cols-2">
          {sheetNames.map((sheet, index) => (
            <div
              key={sheet}
              className="flex items-center justify-between border border-brand/15 bg-primary/35 p-base"
            >
              <span className="text-sm text-normal">
                {index + 1}. {sheet}
              </span>
              <span
                className={
                  gatePassed ? 'text-[9px] text-success' : 'text-[9px] text-low'
                }
              >
                {gatePassed ? '已由发布门校验' : '未验证'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-double grid gap-base sm:grid-cols-3">
        <ProjectionField
          label="报告期间"
          value={projection?.reportPeriod ?? '当前公共投影未提供'}
        />
        <ProjectionField
          label="总体校验"
          value={projection?.overallStatus ?? '当前公共投影未提供'}
        />
        <ProjectionField
          label="六项勾稽"
          value={
            projectionAvailable
              ? `${controlTotals.filter((item) => item.status === 'PASS').length}/${controlTotals.length} 通过`
              : (projection?.code ?? '当前公共投影未提供')
          }
        />
      </section>

      {controlTotals.length > 0 && (
        <section className="mt-double">
          <h3 className="chaotang-title text-lg text-high">
            控制总额与勾稽结果
          </h3>
          <div className="mt-base overflow-x-auto border border-brand/15">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead className="bg-brand/10 text-brand">
                <tr>
                  {['校验项', '状态', '实际值', '期望值', '差异', '说明'].map(
                    (heading) => (
                      <th key={heading} className="p-base font-normal">
                        {heading}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {controlTotals.map((item) => (
                  <tr key={item.name} className="border-t border-brand/10">
                    <td className="p-base text-normal">{item.name}</td>
                    <td
                      className={cn(
                        'p-base',
                        item.status === 'PASS' ? 'text-success' : 'text-error'
                      )}
                    >
                      {item.status}
                    </td>
                    <td className="p-base text-low">
                      {displayProjectionValue(item.actual)}
                    </td>
                    <td className="p-base text-low">
                      {displayProjectionValue(item.expected)}
                    </td>
                    <td className="p-base text-low">
                      {displayProjectionValue(item.difference)}
                    </td>
                    <td className="p-base text-low">{item.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail.artifactGate.reasonCodes.length > 0 && (
        <DetailList
          title="发布门原因代码"
          items={detail.artifactGate.reasonCodes}
          danger
        />
      )}
      {detail.artifactGate.missingKinds.length > 0 && (
        <DetailList
          title="缺失成果类型"
          items={detail.artifactGate.missingKinds}
          danger
        />
      )}
      {detail.missingEvidence.length > 0 && (
        <DetailList title="缺失证据" items={detail.missingEvidence} danger />
      )}
      {detail.conflicts.length > 0 && (
        <DetailList title="异常与冲突" items={detail.conflicts} danger />
      )}

      <section className="mt-double">
        <h3 className="text-xs text-brand">成果 manifest</h3>
        <div className="mt-base space-y-half">
          {manifests.map((manifest, index) => (
            <div
              key={`${String(manifest.kind ?? 'artifact')}-${index}`}
              className="grid gap-half border border-brand/15 bg-primary/35 p-base text-[10px] sm:grid-cols-[180px_1fr]"
            >
              <span className="text-normal">
                {String(manifest.kind ?? '未知类型')}
              </span>
              <span className="break-all font-mono text-low">
                {String(
                  manifest.content_digest ?? manifest.ref ?? '无公开 digest'
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-double border-l border-brand/35 pl-base text-xs leading-relaxed text-low">
        金额、比例、同比、异常和校验均由确定性代码计算；模型只消费有界摘要。下载成功也不能替代人工确认。
      </p>
    </article>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-brand/15 bg-primary/35 p-base">
      <p className="text-[10px] text-low">{label}</p>
      <p className="chaotang-title mt-half text-xl text-high">{value}</p>
    </div>
  );
}

function ProjectionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-brand/15 bg-primary/35 p-base">
      <p className="text-xs text-brand">{label}</p>
      <p className="mt-base text-xs leading-relaxed text-low">{value}</p>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayProjectionValue(
  value: string | number | boolean | null
): string {
  if (value === null || value === '') return '—';
  return String(value);
}

function ProductCard({ item }: { item: HubuWorkProductSummary }) {
  const Icon =
    item.confirmationStatus === 'CONFIRMED'
      ? CheckCircleIcon
      : item.confirmationStatus === 'PENDING'
        ? SealCheckIcon
        : WarningIcon;
  return (
    <article className="border border-brand/15 bg-primary/45 p-base">
      <div className="flex items-start gap-base">
        <Icon className="mt-half size-5 shrink-0 text-brand" weight="duotone" />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-base">
            <span className="text-xs text-brand">{item.capabilityId}</span>
            <span className="text-[10px] text-low">
              {confirmationLabel[item.confirmationStatus]}
            </span>
          </div>
          <p className="mt-base line-clamp-2 text-sm leading-relaxed text-normal">
            {item.decision}
          </p>
          <p className="mt-base text-[10px] text-low">
            {new Date(item.createdAt).toLocaleString('zh-CN')}
          </p>
        </div>
      </div>
    </article>
  );
}

function DetailList({
  title,
  items,
  danger = false,
}: {
  title: string;
  items: string[];
  danger?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-double">
      <h3 className={danger ? 'text-xs text-error' : 'text-xs text-brand'}>
        {title}
      </h3>
      <ul className="mt-base space-y-half text-xs leading-relaxed text-low">
        {items.map((item) => (
          <li key={item} className="border-l border-brand/25 pl-base">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
      {children}
    </p>
  );
}
