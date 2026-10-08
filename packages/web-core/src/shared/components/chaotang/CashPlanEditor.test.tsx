import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  mutate: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const index = h.cursor++;
    if (!(index in h.values)) h.values[index] = initial;
    return [
      h.values[index],
      (value: unknown) => {
        h.values[index] =
          typeof value === 'function' ? value(h.values[index]) : value;
      },
    ];
  },
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({ user: { id: 'owner-a' }, health: {} }),
}));
vi.mock('@/shared/hooks/chaotang/useHubu', () => ({
  useHubuWorkProducts: () => ({ data: [] }),
  useCashSafetyEvaluation: () => ({ mutate: h.mutate, isPending: false }),
}));
vi.mock('@/shared/hooks/chaotang/useSkills', () => ({
  useChaotangSkills: () => ({ data: { items: [] } }),
}));
import { CashPlanEditor, type CashPlanRow } from './CashPlanEditor';
import { CashSafetyReadinessWorkspace } from './CashSafetyReadinessWorkspace';

function nodes(value: unknown): ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as ReactElement<any>;
  return [element, ...nodes(element.props.children)];
}
const form = () => {
  h.cursor = 0;
  const root = CashSafetyReadinessWorkspace();
  const child = nodes(root).find(
    (n) =>
      typeof n.type === 'function' && n.type.name === 'CashSafetyEvaluationForm'
  )!;
  return (child.type as () => ReactElement)();
};
function fillBaseInput() {
  for (const node of nodes(form()).filter((n) => n.type === 'input')) {
    const { type, placeholder } = node.props;
    const value =
      type === 'month'
        ? '2026-07'
        : type === 'date'
          ? '2026-08-01'
          : placeholder === '金额' ||
              placeholder === '流入' ||
              placeholder === '流出'
            ? '100'
            : placeholder
              ? '测试账单'
              : undefined;
    if (value !== undefined) node.props.onChange({ target: { value } });
  }
}
beforeEach(() => {
  h.values = [];
  h.cursor = 0;
  h.mutate.mockReset();
});
it('turns user-added plan rows into the existing API contract only when submitted', () => {
  fillBaseInput();
  let tree = form();
  let rows: CashPlanRow[] = [];
  const renderEditor = () =>
    CashPlanEditor({
      rows,
      onChange: (value) => {
        rows = value;
      },
    });
  nodes(renderEditor())
    .find((n) => n.props.children === '添加一笔计划')!
    .props.onClick();
  const id = rows[0].id;
  for (const [label, value] of [
    ['日期', '2026-08-05'],
    ['收付方向', 'INFLOW'],
    ['金额', '125.50'],
    ['来源', ' 合同 A '],
  ]) {
    nodes(renderEditor())
      .find((n) => n.props['aria-label'] === `第 1 项${label}`)!
      .props.onChange({ target: { value } });
  }
  expect(rows[0].id).toBe(id);
  expect(rows[0]).not.toHaveProperty('attested');
  nodes(tree)
    .find((n) => n.type === CashPlanEditor)!
    .props.onChange(rows);
  tree = form();
  expect(h.mutate).not.toHaveBeenCalled();
  expect(
    nodes(tree).find((n) => n.props.children === '生成现金分析与 Excel')!.props
      .disabled
  ).toBe(false);
  nodes(tree)
    .find((n) => n.props.children === '生成现金分析与 Excel')!
    .props.onClick();
  expect(h.mutate.mock.calls[0][0].scheduledMovements).toEqual([
    {
      id,
      direction: 'INFLOW',
      amount: '125.50',
      dueDate: '2026-08-05',
      sourceReference: '合同 A',
      attested: false,
    },
  ]);
  nodes(tree)
    .find((n) => n.props.type === 'checkbox')!
    .props.onChange({ target: { checked: true } });
  nodes(form())
    .find((n) => n.props.children === '生成现金分析与 Excel')!
    .props.onClick();
  expect(h.mutate.mock.calls[1][0].scheduledMovements[0].attested).toBe(true);
});
it('rejects an unfinished plan without calling the backend and allows removing only that plan', () => {
  fillBaseInput();
  const unfinished = {
    id: 'new-1',
    direction: 'OUTFLOW',
    amount: '',
    dueDate: '',
    sourceReference: null,
  } as const;
  nodes(form())
    .find((n) => n.type === CashPlanEditor)!
    .props.onChange([unfinished]);
  nodes(form())
    .find((n) => n.props.children === '生成现金分析与 Excel')!
    .props.onClick();
  expect(h.mutate).not.toHaveBeenCalled();
  expect(
    nodes(form()).find((n) => n.props.role === 'alert')?.props.children
  ).toContain('日期和金额');
  const change = vi.fn();
  const other = { ...unfinished, id: 'keep' };
  const editor = CashPlanEditor({
    rows: [unfinished, other],
    onChange: change,
  });
  nodes(editor)
    .find((n) => n.props['aria-label'] === '移除第 1 项')!
    .props.onClick();
  expect(change).toHaveBeenCalledWith([other]);
});
it('does not add a 129th plan or mutate rows while submission is pending', () => {
  const rows = Array.from({ length: 128 }, (_, i) => ({
    id: `plan-${i}`,
    direction: 'OUTFLOW' as const,
    amount: '1',
    dueDate: '2026-08-05',
    sourceReference: null,
  }));
  const change = vi.fn();
  const max = CashPlanEditor({ rows, onChange: change });
  nodes(max)
    .find((n) => n.props.children === '添加一笔计划')!
    .props.onClick();
  const busy = CashPlanEditor({ rows, onChange: change, disabled: true });
  nodes(busy)
    .find((n) => n.props['aria-label'] === '移除第 1 项')!
    .props.onClick();
  nodes(busy)
    .find((n) => n.props['aria-label'] === '第 1 项金额')!
    .props.onChange({ target: { value: '2' } });
  expect(change).not.toHaveBeenCalled();
});
