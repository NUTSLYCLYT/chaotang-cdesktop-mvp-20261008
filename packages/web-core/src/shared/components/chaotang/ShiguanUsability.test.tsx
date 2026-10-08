import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const h = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  pending: false,
  error: false,
  success: false,
  recalled: false,
  mutate: vi.fn(),
  reset: vi.fn(),
  source: '  原始需求  ',
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = h.cursor++;
    if (!(index in h.values)) h.values[index] = initial;
    return [
      h.values[index],
      (value: unknown) => {
        h.values[index] = value;
      },
    ];
  },
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({ user: { id: 'owner-a' }, health: {} }),
}));
vi.mock('@/shared/hooks/chaotang/useShiguan', () => ({
  useShiguanDecision: () => ({ reset: h.reset, isPending: false }),
  useShiguanArchives: () => ({
    data: [{ id: 'archive-a', title: '测试旧案' }],
  }),
  useShiguanStatistics: () => ({ data: {} }),
  useShiguanArchive: () => ({
    data: {
      id: 'archive-a',
      sourceText: h.source,
      content: '旧结论',
      createdAt: '2026-09-28T00:00:00Z',
    },
  }),
  useShiguanRecall: () => ({
    mutate: h.mutate,
    isPending: h.pending,
    data: h.recalled
      ? [
          {
            archiveId: 'archive-a',
            matchReason: '部门匹配',
            historicalConclusion: '合成旧结论',
            reviewStatus: { status: 'PARTIAL', note: '还需补证据' },
          },
        ]
      : undefined,
  }),
  useShiguanReview: () => ({
    mutate: h.mutate,
    reset: h.reset,
    isPending: h.pending,
    isError: h.error,
    isSuccess: h.success,
  }),
}));
import { ShiguanReviewForm } from './ShiguanReviewForm';
import { ReviewDispositionWorkspace } from './ReviewDispositionWorkspace';
import { ShiguanWorkspace } from './ShiguanWorkspace';
import { ShiguanOperationsWorkspace } from './ShiguanOperationsWorkspace';
function nodes(value: unknown): ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as ReactElement<any>;
  return [element, ...nodes(element.props.children)];
}
const render = (fn: () => ReactElement) => {
  h.cursor = 0;
  return nodes(fn());
};
const event = () => ({ preventDefault: vi.fn() });
beforeEach(() => {
  h.values = [];
  h.cursor = 0;
  h.pending = h.error = h.success = false;
  h.recalled = false;
  h.source = '  原始需求  ';
  h.mutate.mockReset();
  h.reset.mockReset();
});
it('the existing disposition screen also submits its review button without changing a decision', () => {
  const tree = () => ReviewDispositionWorkspace();
  render(tree)
    .find(
      (n) => n.type === 'button' && n.props.className?.includes('text-left')
    )!
    .props.onClick();
  const button = render(tree).find((n) => n.props.children === '更新复盘')!;
  expect(button.props.type).toBe('submit');
  render(tree)
    .find((n) => n.type === 'form')!
    .props.onSubmit(event());
  expect(h.mutate).toHaveBeenCalledExactlyOnceWith({
    archiveId: 'archive-a',
    status: 'OBSERVING',
    note: '',
  });
});
it('shows saved owner feedback with the recalled conclusion without calling it independent acceptance', () => {
  h.recalled = true;
  const tree = render(() => ShiguanWorkspace({ mode: 'recall' }));
  expect(tree.some((n) => n.props.children === '还需补证据')).toBe(true);
  expect(
    tree.some((n) => n.props.children === '用户反馈不等于独立验收结论。')
  ).toBe(true);
});
it('makes both archive and recall reachable through the same original-shell panel', () => {
  const onReuse = vi.fn();
  const tree = () => ShiguanOperationsWorkspace({ onReuse });
  expect(
    render(tree).find((n) => n.type === ShiguanWorkspace)?.props.mode
  ).toBe('archives');
  render(tree)
    .find((n) => n.props.children === '查找相似旧案')!
    .props.onClick();
  expect(
    render(tree).find((n) => n.type === ShiguanWorkspace)?.props.mode
  ).toBe('recall');
  expect(onReuse).not.toHaveBeenCalled();
});
it('recall is a real submit action, trims criteria and refuses empty/pending submits', () => {
  const tree = () => ShiguanWorkspace({ mode: 'recall' });
  expect(
    render(tree).find((n) => n.props.type === 'submit')?.props.disabled
  ).toBe(true);
  render(tree)
    .find((n) => n.type === 'form')!
    .props.onSubmit(event());
  expect(h.mutate).not.toHaveBeenCalled();
  render(tree)
    .find((n) => n.props['aria-label'] === '部门')!
    .props.onChange({ target: { value: ' 户部 ' } });
  render(tree)
    .find((n) => n.type === 'form')!
    .props.onSubmit(event());
  expect(h.mutate).toHaveBeenCalledExactlyOnceWith({
    matterType: '',
    department: '户部',
    limit: 10,
  });
  h.pending = true;
  render(tree)
    .find((n) => n.type === 'form')!
    .props.onSubmit(event());
  expect(h.mutate).toHaveBeenCalledTimes(1);
});
it.each(['OBSERVING', 'ACHIEVED', 'PARTIAL', 'NOT_ACHIEVED'])(
  'saves a grounded owner review as %s, not an acceptance decision',
  (status) => {
    const tree = () =>
      ShiguanReviewForm({ archive: { id: 'archive-a' } as any });
    render(tree)
      .find((n) => n.type === 'form')!
      .props.onSubmit(event());
    expect(h.mutate).not.toHaveBeenCalled();
    render(tree)
      .find((n) => n.type === 'select')!
      .props.onChange({ target: { value: status } });
    render(tree)
      .find((n) => n.type === 'textarea')!
      .props.onChange({ target: { value: ' 已核对合成测试计算 ' } });
    expect(h.reset).toHaveBeenCalledTimes(2);
    render(tree)
      .find((n) => n.type === 'form')!
      .props.onSubmit(event());
    expect(h.mutate).toHaveBeenCalledExactlyOnceWith({
      archiveId: 'archive-a',
      status,
      note: '已核对合成测试计算',
    });
    h.pending = true;
    expect(
      render(tree).find((n) => n.props.type === 'submit')?.props.disabled
    ).toBe(true);
    render(tree)
      .find((n) => n.type === 'form')!
      .props.onSubmit(event());
    expect(h.mutate).toHaveBeenCalledTimes(1);
  }
);
it('retains the review text on failure, shows truthful save status, and restores a prior review', () => {
  const tree = () =>
    ShiguanReviewForm({
      archive: {
        id: 'archive-a',
        reviewStatus: { status: 'PARTIAL', note: '待补证据' },
      } as any,
    });
  expect(render(tree).find((n) => n.type === 'textarea')?.props.value).toBe(
    '待补证据'
  );
  h.error = true;
  expect(render(tree).find((n) => n.props.role === 'alert')).toBeDefined();
  expect(render(tree).find((n) => n.type === 'textarea')?.props.value).toBe(
    '待补证据'
  );
  h.error = false;
  h.success = true;
  expect(render(tree).find((n) => n.props.role === 'status')).toBeDefined();
});
it.each(['  原始需求  ', '', 'x'.repeat(4001)])(
  'only reuses a complete bounded original request (case %#)',
  (source) => {
    h.source = source;
    const onReuse = vi.fn();
    const tree = () => ShiguanWorkspace({ mode: 'archives', onReuse });
    render(tree)
      .find(
        (n) => n.type === 'button' && n.props.className?.includes('text-left')
      )!
      .props.onClick();
    const button = render(tree).find(
      (n) => n.props.children === '作为新需求带入上书房'
    )!;
    const allowed = Boolean(source.trim()) && source.trim().length <= 4000;
    expect(button.props.disabled).toBe(!allowed);
    button.props.onClick();
    if (allowed) expect(onReuse).toHaveBeenCalledExactlyOnceWith(source.trim());
    else expect(onReuse).not.toHaveBeenCalled();
  }
);
