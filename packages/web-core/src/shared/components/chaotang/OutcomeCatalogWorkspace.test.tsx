import { expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  OutcomeCaseEmptyState,
  OutcomeCaseList,
  OutcomeCatalogWorkspace,
  OutcomeFilterBar,
  OutcomeRecordsPanel,
  outcomeFilterOptions,
} from './OutcomeCatalogWorkspace';
import { ChaotangButton } from './ChaotangPrimitives';

function nodes(value: unknown): ReactElement<any>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as ReactElement<any>;
  return [element, ...nodes(element.props.children)];
}

it('takes the cash case and record entrances to their existing destinations', () => {
  const onOpen = vi.fn();
  const onPrepare = vi.fn();
  const caseButtons = nodes(
    OutcomeCaseList({ filter: 'all', onOpen, onPrepare })
  ).filter((n) => n.type === ChaotangButton);
  caseButtons
    .find((n) => n.props.children === '填写数据，开始现金分析')!
    .props.onClick();
  expect(onOpen).toHaveBeenLastCalledWith('hubu');

  const recordButtons = nodes(OutcomeRecordsPanel({ onOpen })).filter(
    (n) => n.type === ChaotangButton
  );
  for (const [label, destination] of [
    ['军机处：查看任务', 'cases'],
    ['锦衣卫：查看来源', 'jinyiwei'],
    ['史馆：取回成果', 'shiguan'],
  ]) {
    recordButtons.find((n) => n.props.children === label)!.props.onClick();
    expect(onOpen).toHaveBeenLastCalledWith(destination);
  }
  expect(onPrepare).not.toHaveBeenCalled();
});

it('prepares two bounded editable briefs without creating tasks', () => {
  const onOpen = vi.fn();
  const onPrepare = vi.fn();
  const tree = OutcomeCaseList({ filter: 'prepare', onOpen, onPrepare });
  for (const button of nodes(tree).filter(
    (n) =>
      n.type === ChaotangButton && n.props.children === '带入上书房，补充需求'
  ))
    button.props.onClick();
  expect(onPrepare).toHaveBeenCalledTimes(2);
  for (const [brief] of onPrepare.mock.calls) {
    expect(brief).toContain('待填写');
    expect(brief.length).toBeLessThan(4000);
  }
  expect(onOpen).not.toHaveBeenCalled();
});

it('separates examples, rule calculation and unaccepted real agent execution', () => {
  const html = renderToStaticMarkup(
    <OutcomeCatalogWorkspace onOpen={vi.fn()} onPrepare={vi.fn()} />
  );
  expect(html).toContain('规则计算，登录后可提交');
  expect(html).toContain('尚未读取你的数据或生成分析');
  expect(html).toContain('真实执行待验收');
  expect(html).toContain('新账户没有记录时显示空列表');
  expect(html.match(/<details/g)).toHaveLength(3);
});

it('defaults to the full catalog and clearly marks the active filter', () => {
  const html = renderToStaticMarkup(
    <OutcomeCatalogWorkspace onOpen={vi.fn()} onPrepare={vi.fn()} />
  );
  expect(html).toContain('我的现金还能支撑多久？');
  expect(html).toContain('这个开源项目值得接入吗？');
  expect(html).toContain('把一个产品改进落成可验收任务');
  expect(html).toContain('当前显示：全部案例 · 3 个案例');
  for (const option of outcomeFilterOptions)
    expect(html).toContain(option.label);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});

it('keeps only the executable cash case under the ready filter', () => {
  const html = renderToStaticMarkup(
    <OutcomeCatalogWorkspace
      onOpen={vi.fn()}
      onPrepare={vi.fn()}
      initialFilter="ready"
    />
  );
  expect(html).toContain('我的现金还能支撑多久？');
  expect(html).toContain('当前显示：现在可办理 · 1 个案例');
  expect(html).not.toContain('这个开源项目值得接入吗？');
  expect(html).not.toContain('准备需求 · 真实执行待验收');
  expect(html).toContain('军机处：查看任务');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});

it('keeps only the two staged cases under the prepare filter', () => {
  const html = renderToStaticMarkup(
    <OutcomeCatalogWorkspace
      onOpen={vi.fn()}
      onPrepare={vi.fn()}
      initialFilter="prepare"
    />
  );
  expect(html).toContain('这个开源项目值得接入吗？');
  expect(html).toContain('把一个产品改进落成可验收任务');
  expect(html).toContain('当前显示：先准备需求 · 2 个案例');
  expect(html).not.toContain('规则计算，登录后可提交');
  expect(html).not.toContain('填写数据，开始现金分析');
  expect(html).toContain('史馆：取回成果');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});

it('exposes the three filters as keyboard-operable pressed-state buttons', () => {
  const onChange = vi.fn();
  const html = renderToStaticMarkup(
    <OutcomeFilterBar value="ready" onChange={onChange} />
  );
  expect(html.match(/<button/g)).toHaveLength(3);
  expect(html.match(/type="button"/g)).toHaveLength(3);
  const buttons = nodes(OutcomeFilterBar({ value: 'ready', onChange })).filter(
    (n) => n.type === ChaotangButton
  );
  expect(buttons).toHaveLength(3);
  for (const option of outcomeFilterOptions) {
    const button = buttons.find((n) => n.props.children === option.label)!;
    expect(button.props['aria-pressed']).toBe(option.id === 'ready');
    button.props.onClick();
    expect(onChange).toHaveBeenLastCalledWith(option.id);
  }
});

it('keeps original button destinations when the filter changes', () => {
  for (const filter of ['all', 'ready'] as const) {
    const onOpen = vi.fn();
    const onPrepare = vi.fn();
    const buttons = nodes(
      OutcomeCaseList({ filter, onOpen, onPrepare })
    ).filter((n) => n.type === ChaotangButton);
    buttons
      .find((n) => n.props.children === '填写数据，开始现金分析')!
      .props.onClick();
    expect(onOpen).toHaveBeenLastCalledWith('hubu');
    expect(onPrepare).not.toHaveBeenCalled();
  }
  for (const filter of ['all', 'prepare'] as const) {
    const onOpen = vi.fn();
    const onPrepare = vi.fn();
    const buttons = nodes(
      OutcomeCaseList({ filter, onOpen, onPrepare })
    ).filter((n) => n.type === ChaotangButton);
    const prepareButtons = buttons.filter(
      (n) => n.props.children === '带入上书房，补充需求'
    );
    expect(prepareButtons).toHaveLength(2);
    for (const button of prepareButtons) button.props.onClick();
    expect(onPrepare).toHaveBeenCalledTimes(2);
    const cash = buttons.find(
      (n) => n.props.children === '填写数据，开始现金分析'
    );
    expect(Boolean(cash)).toBe(filter === 'all');
    expect(onOpen).not.toHaveBeenCalled();
  }
});

it('explains an empty filtered list instead of claiming success or failure', () => {
  const html = renderToStaticMarkup(<OutcomeCaseEmptyState />);
  expect(html).toContain('当前筛选下暂无可展示案例');
  expect(html).toContain('请切换到“全部案例”查看完整入口');
  expect(html).not.toContain('成功');
  expect(html).not.toContain('已达成');
});
