import { expect, it } from 'vitest';
import { parseCashPlanTable } from './cashPlanTable';

it('reads Excel tabular text without rounding money or claiming source verification', () => {
  expect(
    parseCashPlanTable(
      '\uFEFF日期\t方向\t金额\t来源\r\n2026/8/5\t收款\t1,234.50\t合同 A\r\n2026-08-31\t付款\t9999999999999999999999999999.99\t',
      '2026-08-01'
    )
  ).toEqual([
    {
      dueDate: '2026-08-05',
      direction: 'INFLOW',
      amount: '1234.50',
      sourceReference: '合同 A',
    },
    {
      dueDate: '2026-08-31',
      direction: 'OUTFLOW',
      amount: '9999999999999999999999999999.99',
      sourceReference: null,
    },
  ]);
});

it.each([
  ['2026-08-05\t支出\t20\t账单', '方向'],
  ['2026-08-05\t付款\t-20\t账单', '金额'],
  ['2026-08-05\t付款\t1,23\t账单', '金额'],
  ['2026-08-05\t付款\t=SUM(A1)\t账单', '金额'],
  ['2026-08-05\t付款\t1.234\t账单', '金额'],
  ['2026-08-32\t付款\t20\t账单', '日期'],
  ['2026-08-01\t付款\t20\t账单', '31 天'],
  ['2026-09-02\t付款\t20\t账单', '31 天'],
  ['2026-08-05,付款,20,账单', '4 列'],
  [`2026-08-05\t付款\t20\t${'a'.repeat(257)}`, '来源'],
])(
  'rejects invalid input as a whole with a row-specific error: %s',
  (text, reason) => {
    expect(() =>
      parseCashPlanTable(`2026-08-05\t付款\t10\t账单\n${text}`, '2026-08-01')
    ).toThrow(`第 2 行：${reason}`);
  }
);

it('requires an explicit valid analysis date and never silently truncates plans', () => {
  expect(() => parseCashPlanTable('', '')).toThrow('分析日期');
  expect(() => parseCashPlanTable('', '2026-02-30')).toThrow('分析日期');
  expect(() =>
    parseCashPlanTable('日期\t方向\t金额\t来源', '2026-08-01')
  ).toThrow('至少');
  const row = '2026-08-05\t付款\t10\t账单';
  expect(
    parseCashPlanTable(Array(128).fill(row).join('\n'), '2026-08-01')
  ).toHaveLength(128);
  expect(() =>
    parseCashPlanTable(Array(129).fill(row).join('\n'), '2026-08-01')
  ).toThrow('128');
  expect(() => parseCashPlanTable('a'.repeat(100001), '2026-08-01')).toThrow(
    '过大'
  );
});
