import type { CashSafetyScheduledMovement } from '@/shared/providers/ChaotangProvider';
import { ChaotangButton } from './ChaotangPrimitives';
import { CashPlanImport } from './CashPlanImport';

export type CashPlanRow = Omit<CashSafetyScheduledMovement, 'attested'>;
const field =
  'w-full border border-brand/20 bg-primary/60 px-base py-half text-sm text-normal focus:border-brand/45';

export function CashPlanEditor({
  rows,
  onChange,
  disabled = false,
  asOf = '',
}: {
  rows: CashPlanRow[];
  onChange: (rows: CashPlanRow[]) => void;
  disabled?: boolean;
  asOf?: string;
}) {
  const update = (id: string, patch: Partial<CashPlanRow>) => {
    if (!disabled)
      onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  return (
    <fieldset disabled={disabled} className="mt-double space-y-base">
      <legend className="text-sm text-high">
        未来 31 天计划收付款（选填）
      </legend>
      <p className="text-xs text-low">
        没有计划可留空。只用于现金预测，不会实际收款或付款。
      </p>
      <CashPlanImport
        rows={rows}
        asOf={asOf}
        onChange={onChange}
        disabled={disabled}
      />
      {rows.map((row, index) => (
        <div
          key={row.id}
          className="grid gap-half border border-brand/15 bg-primary/30 p-base md:grid-cols-[1fr_100px_1fr_1.5fr_auto]"
        >
          <input
            aria-label={`第 ${index + 1} 项日期`}
            type="date"
            value={row.dueDate}
            onChange={(event) =>
              update(row.id, { dueDate: event.target.value })
            }
            className={field}
          />
          <select
            aria-label={`第 ${index + 1} 项收付方向`}
            value={row.direction}
            onChange={(event) =>
              update(row.id, {
                direction:
                  event.target.value === 'INFLOW' ? 'INFLOW' : 'OUTFLOW',
              })
            }
            className={field}
          >
            <option value="OUTFLOW">付款</option>
            <option value="INFLOW">收款</option>
          </select>
          <input
            aria-label={`第 ${index + 1} 项金额`}
            inputMode="decimal"
            placeholder="金额（元）"
            value={row.amount}
            onChange={(event) => update(row.id, { amount: event.target.value })}
            className={field}
          />
          <input
            aria-label={`第 ${index + 1} 项来源`}
            placeholder="来源，如合同、账单或计划说明"
            value={row.sourceReference ?? ''}
            onChange={(event) =>
              update(row.id, { sourceReference: event.target.value })
            }
            className={field}
          />
          <ChaotangButton
            aria-label={`移除第 ${index + 1} 项`}
            onClick={() => {
              if (!disabled)
                onChange(rows.filter((item) => item.id !== row.id));
            }}
          >
            移除
          </ChaotangButton>
        </div>
      ))}
      <ChaotangButton
        disabled={disabled || rows.length >= 128}
        onClick={() => {
          if (!disabled && rows.length < 128)
            onChange([
              ...rows,
              {
                id: crypto.randomUUID(),
                direction: 'OUTFLOW',
                amount: '',
                dueDate: '',
                sourceReference: null,
              },
            ]);
        }}
      >
        添加一笔计划
      </ChaotangButton>
      {rows.length >= 128 && (
        <p role="status" className="text-xs text-low">
          本次最多填写 128 笔计划。
        </p>
      )}
    </fieldset>
  );
}
