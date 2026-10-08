import { useRef, useState } from 'react';
import type { CashPlanRow } from './CashPlanEditor';
import { parseCashPlanTable, type ImportedCashPlan } from './cashPlanTable';
import { ChaotangButton } from './ChaotangPrimitives';

export function CashPlanImport({
  rows,
  asOf,
  onChange,
  disabled = false,
}: {
  rows: CashPlanRow[];
  asOf: string;
  onChange: (rows: CashPlanRow[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{
    asOf: string;
    rows: ImportedCashPlan[];
  } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const applied = useRef(false);
  const current = preview?.asOf === asOf ? preview : null;
  const check = () => {
    if (disabled) return;
    setError('');
    setMessage('');
    setPreview(null);
    try {
      const parsed = parseCashPlanTable(text, asOf);
      if (rows.length + parsed.length > 128)
        throw new Error(
          `已有 ${rows.length} 笔计划，合计不能超过 128 笔。请减少粘贴内容或先移除旧计划。`
        );
      applied.current = false;
      setPreview({ asOf, rows: parsed });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '表格无法识别，请检查后重试。'
      );
    }
  };
  return (
    <details className="border border-brand/20 bg-primary/30 p-base">
      <summary className="cursor-pointer text-sm text-high">
        从 Excel 批量粘贴计划
      </summary>
      <p className="mt-base text-xs text-low">
        户部提醒：复制四列单元格，顺序为日期、方向（收款/付款）、金额（元）、来源。支持同名表头；日期须在分析日期之后的
        31 天内。单元格请保持单行，最多 128 笔。
      </p>
      <p className="mt-half text-xs text-low">
        仅在本页核对；加入后仍可逐笔修改。点击“生成现金分析与
        Excel”才提交到朝堂后端，不会执行付款，也不会自动确认来源真实。
      </p>
      <textarea
        aria-label="粘贴收付款计划表格"
        rows={5}
        maxLength={100000}
        disabled={disabled}
        value={text}
        placeholder={
          '日期\t方向\t金额\t来源\n2026-08-05\t收款\t125.50\t合同 A（示例，请替换）'
        }
        className="mt-base w-full border border-brand/20 bg-primary/60 p-base text-sm text-normal focus:border-brand/45"
        onChange={(event) => {
          if (disabled) return;
          setText(event.target.value);
          setPreview(null);
          setMessage('');
          setError('');
        }}
      />
      <ChaotangButton disabled={disabled || !text.trim()} onClick={check}>
        核对表格
      </ChaotangButton>
      {preview && !current && (
        <p role="status" className="mt-base text-xs text-low">
          分析日期已更改，请重新核对表格。
        </p>
      )}
      {current && (
        <div className="mt-base space-y-base">
          <p className="text-sm text-high">
            待加入 {current.rows.length} 笔，保留原有 {rows.length}{' '}
            笔。请核对金额与收付方向。
          </p>
          {current.rows.some((row) => !row.sourceReference) && (
            <p className="text-xs text-low">
              部分来源为空，可加入后补齐；缺少来源会限制分析结论。
            </p>
          )}
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm text-normal">
              <caption className="sr-only">待加入的收付款计划</caption>
              <thead>
                <tr>
                  {['日期', '方向', '金额（元）', '来源'].map((label) => (
                    <th key={label} scope="col" className="p-half">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {current.rows.map((row, index) => (
                  <tr key={index} className="border-t border-brand/15">
                    <td className="p-half whitespace-nowrap">{row.dueDate}</td>
                    <td className="p-half">
                      {row.direction === 'INFLOW' ? '收款' : '付款'}
                    </td>
                    <td className="p-half">{row.amount}</td>
                    <td className="p-half break-all">
                      {row.sourceReference || '待补充'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ChaotangButton
            disabled={disabled || rows.length + current.rows.length > 128}
            onClick={() => {
              if (
                disabled ||
                applied.current ||
                rows.length + current.rows.length > 128
              )
                return;
              applied.current = true;
              onChange([
                ...rows,
                ...current.rows.map((row) => ({
                  ...row,
                  id: crypto.randomUUID(),
                })),
              ]);
              setMessage(
                `已加入 ${current.rows.length} 笔计划。请在下方核对；尚未生成分析。`
              );
              setPreview(null);
              setText('');
            }}
          >
            确认加入计划
          </ChaotangButton>
          {rows.length + current.rows.length > 128 && (
            <p role="alert" className="text-xs text-error">
              合计超过 128 笔，请减少已有计划后再加入。
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-base text-xs text-error">
          {error} 原有计划未改动。
        </p>
      )}
      {message && (
        <p role="status" className="mt-base text-xs text-success">
          {message}
        </p>
      )}
    </details>
  );
}
