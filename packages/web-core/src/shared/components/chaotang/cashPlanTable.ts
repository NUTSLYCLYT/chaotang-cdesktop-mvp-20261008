import type { CashPlanRow } from './CashPlanEditor';

export type ImportedCashPlan = Omit<CashPlanRow, 'id'>;

function dateValue(value: string): string | null {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (!match || match[1] === '0000') return null;
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(date)
    ? date
    : null;
}

// Plain four-column TSV copied from a spreadsheet. Never evaluate formulas,
// infer direction from signs, coerce monetary values to Number, or attest data.
export function parseCashPlanTable(
  text: string,
  asOf: string
): ImportedCashPlan[] {
  const start = dateValue(asOf);
  if (!start) throw new Error('请先填写有效的分析日期，再核对表格。');
  if (text.length > 100000)
    throw new Error('表格内容过大，请分批处理（最多 128 笔）。');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const rows: ImportedCashPlan[] = [];
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const cells = line.split('\t').map((cell) => cell.trim());
    if (index === 0 && cells.join('|') === '日期|方向|金额|来源') continue;
    const fail = (reason: string): never => {
      throw new Error(`第 ${index + 1} 行：${reason}`);
    };
    if (cells.length !== 4)
      fail(
        '4 列应依次为日期、方向、金额、来源；请直接复制表格单元格，不使用逗号分隔。'
      );
    const [rawDate, direction, rawAmount, source] = cells;
    const dueDate = dateValue(rawDate);
    if (!dueDate) fail('日期无效，请用 2026-08-05 或 2026/8/5 这样的格式。');
    const days =
      (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000;
    if (!(days > 0 && days <= 31))
      fail('31 天范围之外：日期须晚于分析日期，且不超过其后 31 天。');
    if (!['收款', '付款'].includes(direction))
      fail('方向须明确填写“收款”或“付款”。');
    if (
      !/^(?:0|[1-9]\d{0,27}|[1-9]\d{0,2}(?:,\d{3}){1,9})(?:\.\d{1,2})?$/.test(
        rawAmount
      )
    )
      fail('金额须为非负数，最多两位小数，不接受公式、货币符号或科学计数法。');
    const amount = rawAmount.replace(/,/g, '');
    if (!/^(?:0|[1-9]\d{0,27})(?:\.\d{1,2})?$/.test(amount))
      fail('金额超出支持范围。');
    if (
      source.length > 256 ||
      [...source].some((char) => char.charCodeAt(0) < 32)
    )
      fail('来源须为不超过 256 字的单行说明。');
    rows.push({
      dueDate: dueDate!,
      direction: direction === '收款' ? 'INFLOW' : 'OUTFLOW',
      amount,
      sourceReference: source || null,
    });
    if (rows.length > 128)
      throw new Error('一次最多加入 128 笔计划，未导入任何一笔。');
  }
  if (!rows.length) throw new Error('请粘贴至少一笔计划。');
  return rows;
}
