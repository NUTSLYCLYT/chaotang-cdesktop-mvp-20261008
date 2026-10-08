import { HubuArtifactDownloadButton } from './HubuArtifactDownloadButton';
import { useHubuWorkProduct } from '@/shared/hooks/chaotang/useHubu';
import { ChaotangButton } from './ChaotangPrimitives';

function ArchivedWorkbook({ artifactId }: { artifactId: string }) {
  const product = useHubuWorkProduct(artifactId);
  if (product.isPending) return <p role="status">正在核对成果文件…</p>;
  if (product.isError)
    return (
      <div>
        <p role="alert">暂时无法取得成果文件，请检查连接或账户权限。</p>
        <ChaotangButton onClick={() => product.refetch()}>
          重试读取成果文件
        </ChaotangButton>
      </div>
    );
  return (
    <HubuArtifactDownloadButton
      artifactId={artifactId}
      published={product.data?.artifactState === 'PUBLISHED'}
    />
  );
}

// Presentation only: retain the archived bytes, never recalculate or upgrade
// their evidence/acceptance status when opening a historical document.
export function readArchiveContent(content: string) {
  try {
    const value: unknown = JSON.parse(content);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const fieldLabels: Record<string, string> = {
  as_of: '数据截至',
  period: '统计期间',
  available_cash: '可用资金',
  forecast_ending_cash: '期末现金预测',
  monthly_net_burn: '月净支出',
  runway_months: '资金支撑月数',
  risk_level: '现金风险',
  runway_state: '计算状态',
  rule_version: '计算规则',
};
const valueLabels: Record<string, string> = {
  HEALTHY: '处于设定安全范围',
  WARNING: '需要关注',
  CRITICAL: '需优先处理',
  CALCULATED: '已计算',
  INSUFFICIENT_DATA: '资料不足',
};
const text = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;

export function ShiguanArchiveContent({
  content,
  department,
}: {
  content: string;
  department: string;
}) {
  const record = readArchiveContent(content);
  if (!record)
    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-7">
        {content}
      </p>
    );
  const facts = Array.isArray(record.facts) ? record.facts : [];
  const recommendations = Array.isArray(record.recommendations)
    ? record.recommendations.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];
  const artifactId =
    department === '户部' &&
    typeof record.artifact_id === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(record.artifact_id)
      ? record.artifact_id
      : undefined;
  return (
    <div className="shiguan-readable-result">
      {text(record.decision) && (
        <section>
          <h3>生成时结论</h3>
          <p className="whitespace-pre-wrap leading-7">
            {text(record.decision)}
          </p>
          <p className="shiguan-caption">
            保留生成当时的判断；后续确认情况见本卷回奏结论。
          </p>
        </section>
      )}
      {facts.map((fact, index) => {
        if (!fact || typeof fact !== 'object' || Array.isArray(fact))
          return null;
        const values = fact as Record<string, unknown>;
        const rows = Object.entries(fieldLabels).filter(
          ([key]) => text(values[key]) !== undefined
        );
        if (!rows.length) return null;
        const currency = text(values.currency);
        return (
          <section key={index} aria-label="归档关键数据">
            <h3>关键数据{facts.length > 1 ? ` · ${index + 1}` : ''}</h3>
            <dl className="shiguan-facts">
              {rows.map(([key, label]) => {
                const raw = text(values[key])!;
                const unit = [
                  'available_cash',
                  'forecast_ending_cash',
                  'monthly_net_burn',
                ].includes(key)
                  ? currency === 'CNY'
                    ? ' 元'
                    : currency
                      ? ` ${currency}`
                      : '（原文未注明币种）'
                  : key === 'runway_months'
                    ? ' 个月'
                    : '';
                return (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      {valueLabels[raw] ?? raw}
                      {unit}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
      {recommendations.length > 0 && (
        <section>
          <h3>建议与下一步</h3>
          <ul>
            {recommendations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {artifactId && (
        <section>
          <h3>成果文件</h3>
          <ArchivedWorkbook key={artifactId} artifactId={artifactId} />
          <p className="shiguan-caption">
            按当前账户权限取回原成果，文件不存在或无权访问时会提示重试。
          </p>
        </section>
      )}
      {(
        [
          ['assumptions', '适用假设'],
          ['evidence_used', '引用证据'],
          ['missing_evidence', '待补证据'],
          ['conflicts', '尚存分歧'],
          ['risk_register', '风险记录'],
        ] as const
      ).map(([key, title]) => {
        const items = Array.isArray(record[key])
          ? record[key].filter(
              (value): value is string => typeof value === 'string'
            )
          : [];
        if (!items.length) return null;
        return (
          <section key={key}>
            <h3>{title}</h3>
            <ul>
              {items.map((item, index) => (
                <li key={index}>
                  {item === 'CASH_POSITION_WITHIN_THRESHOLDS'
                    ? '现金状况处于本次设定阈值内；不代表后续风险已排除。'
                    : item}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <details className="shiguan-technical">
        <summary>原始记录与技术详情</summary>
        <p className="shiguan-caption">
          原始归档完整保留。技术字段和规则状态不等于独立验收通过。
        </p>
        <pre>{JSON.stringify(record, null, 2)}</pre>
      </details>
    </div>
  );
}
