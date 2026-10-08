import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const h = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = h.cursor++;
    if (!(index in h.values)) h.values[index] = initial;
    return [
      h.values[index],
      (next: unknown) => {
        h.values[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = h.cursor++;
    return (h.values[index] ??= { current: initial });
  },
}));
import { CashPlanImport } from './CashPlanImport';
import type { CashPlanRow } from './CashPlanEditor';
function nodes(value: unknown): ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const item = value as ReactElement<any>;
  return [item, ...nodes(item.props.children)];
}
const original: CashPlanRow = {
  id: 'original',
  dueDate: '2026-08-04',
  amount: '5',
  direction: 'OUTFLOW',
  sourceReference: '原账单',
};
const text = '2026-08-05\t收款\t125.50\t合同 A\n2026-08-06\t付款\t25\t';
let rows: CashPlanRow[], asOf: string, disabled: boolean;
const change = vi.fn((next: CashPlanRow[]) => {
  rows = next;
});
function render() {
  h.cursor = 0;
  return nodes(CashPlanImport({ rows, asOf, disabled, onChange: change }));
}
function paste(value = text) {
  render()
    .find((n) => n.type === 'textarea')!
    .props.onChange({ target: { value } });
}
function click(label: string) {
  render()
    .find((n) => n.props.children === label)!
    .props.onClick();
}
beforeEach(() => {
  h.values = [];
  h.cursor = 0;
  rows = [original];
  asOf = '2026-08-01';
  disabled = false;
  change.mockClear();
});
it('previews before appending, preserves existing rows and missing sources, and cannot double-apply', () => {
  paste();
  click('核对表格');
  expect(change).not.toHaveBeenCalled();
  expect(render().filter((n) => n.type === 'tr')).toHaveLength(3);
  const apply = render().find((n) => n.props.children === '确认加入计划')!.props
    .onClick;
  apply();
  apply();
  expect(change).toHaveBeenCalledTimes(1);
  expect(rows[0]).toBe(original);
  expect(rows.slice(1).map(({ id, ...row }) => row)).toEqual([
    {
      dueDate: '2026-08-05',
      direction: 'INFLOW',
      amount: '125.50',
      sourceReference: '合同 A',
    },
    {
      dueDate: '2026-08-06',
      direction: 'OUTFLOW',
      amount: '25',
      sourceReference: null,
    },
  ]);
  expect(new Set(rows.map((row) => row.id)).size).toBe(3);
  expect(rows.every((row) => !('attested' in row))).toBe(true);
  expect(render().find((n) => n.type === 'textarea')!.props.value).toBe('');
  expect(
    render().find((n) => n.props.role === 'status')!.props.children
  ).toContain('尚未生成分析');
});
it('keeps all original input on a malformed second row, then allows correction', () => {
  paste(text.replace('25\t', '-25\t'));
  click('核对表格');
  expect(change).not.toHaveBeenCalled();
  expect(rows).toEqual([original]);
  expect(
    render()
      .find((n) => n.props.role === 'alert')!
      .props.children.join('')
  ).toContain('第 2 行');
  paste();
  click('核对表格');
  click('确认加入计划');
  expect(rows).toHaveLength(3);
});
it('invalidates the preview after changing the text or analysis date', () => {
  paste();
  click('核对表格');
  asOf = '2026-09-01';
  expect(render().some((n) => n.props.children === '确认加入计划')).toBe(false);
  expect(
    render().find((n) => n.props.role === 'status')!.props.children
  ).toContain('重新核对');
  asOf = '2026-08-01';
  paste('different');
  expect(render().some((n) => n.props.children === '确认加入计划')).toBe(false);
  expect(change).not.toHaveBeenCalled();
});
it('rechecks the combined limit when existing plans change and respects pending submission', () => {
  paste();
  click('核对表格');
  rows = Array.from({ length: 127 }, (_, index) => ({
    ...original,
    id: `old-${index}`,
  }));
  click('确认加入计划');
  expect(change).not.toHaveBeenCalled();
  rows = [original];
  disabled = true;
  click('确认加入计划');
  expect(change).not.toHaveBeenCalled();
  paste('changed while disabled');
  expect(render().find((n) => n.type === 'textarea')!.props.value).toBe(text);
});
