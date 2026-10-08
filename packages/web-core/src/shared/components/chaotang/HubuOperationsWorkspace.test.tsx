import { beforeEach, expect, it, vi } from 'vitest';

// Mount harness: capture the real useState initializer once per mount so the
// deep-link mapping is exercised, but keep the section switchable by the
// component's own button handlers.
const h = vi.hoisted(() => ({ mounted: false, view: '' }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    if (!h.mounted) {
      h.mounted = true;
      h.view =
        typeof initial === 'function'
          ? (initial as () => string)()
          : (initial as string);
    }
    return [
      h.view,
      (value: string) => {
        h.view = value;
      },
    ];
  },
}));
vi.mock('./CashSafetyReadinessWorkspace', () => ({
  CashSafetyReadinessWorkspace: () => null,
}));
vi.mock('./HubuWorkspace', () => ({ HubuWorkspace: () => null }));
import {
  HubuOperationsWorkspace,
  hubuViewFromSection,
} from './HubuOperationsWorkspace';
import { HubuWorkspace } from './HubuWorkspace';
import { CashSafetyReadinessWorkspace } from './CashSafetyReadinessWorkspace';

beforeEach(() => {
  h.mounted = false;
  h.view = '';
});

it('maps each wealth deep-link section to its real business view, defaulting to create', () => {
  for (const [section, view] of [
    ['hubu-overview', 'overview'],
    ['cash-safety', 'create'],
    ['accounting-reports', 'reports'],
    ['work-products', 'products'],
    ['artifacts', 'artifacts'],
    ['confirmations', 'confirmations'],
    [undefined, 'create'],
    ['', 'create'],
    ['not-a-section', 'create'],
    ['calendar', 'create'],
  ] as const)
    expect(hubuViewFromSection(section)).toBe(view);
});

it('keeps the original four step buttons with their labels and default create view', () => {
  const initial = HubuOperationsWorkspace({});
  const buttons = initial.props.children[0].props.children;
  expect(
    buttons.slice(0, 4).map((button: { props: { children: string } }) => {
      return button.props.children;
    })
  ).toEqual(['创建分析', '查看成果', '下载文件', '确认归档']);
  expect(buttons[0].props['aria-pressed']).toBe(true);
  expect(initial.props.children[2].props.hidden).toBe(false);
  expect(initial.props.children[2].props.children.type).toBe(
    CashSafetyReadinessWorkspace
  );
});

it('opens each deep-linked wealth section through its HubuWorkspace mode', () => {
  for (const [index, mode] of [
    [4, 'overview'],
    [5, 'reports'],
  ] as const) {
    h.mounted = false;
    const tree = HubuOperationsWorkspace({});
    tree.props.children[0].props.children[index].props.onClick();
    const next = HubuOperationsWorkspace({});
    expect(next.props.children[3].type).toBe(HubuWorkspace);
    expect(next.props.children[3].props.mode).toBe(mode);
    expect(
      next.props.children[0].props.children[index].props['aria-pressed']
    ).toBe(true);
  }
});

it('starts on the section named by initialSection and keeps the create input mounted', () => {
  for (const [section, mode, index] of [
    ['hubu-overview', 'overview', 4],
    ['accounting-reports', 'reports', 5],
    ['artifacts', 'artifacts', 2],
  ] as const) {
    h.mounted = false;
    const tree = HubuOperationsWorkspace({ initialSection: section });
    expect(tree.props.children[3].type).toBe(HubuWorkspace);
    expect(tree.props.children[3].props.mode).toBe(mode);
    expect(
      tree.props.children[0].props.children[index].props['aria-pressed']
    ).toBe(true);
    // An unsent analysis draft stays mounted (hidden) behind any other section.
    expect(tree.props.children[2].props.hidden).toBe(true);
    expect(tree.props.children[2].props.children.type).toBe(
      CashSafetyReadinessWorkspace
    );
  }
});

it('falls back to create for a missing or cross-department initialSection', () => {
  for (const section of [undefined, '', 'calendar', 'not-a-section']) {
    h.mounted = false;
    const tree = HubuOperationsWorkspace({ initialSection: section });
    expect(tree.props.children[0].props.children[0].props['aria-pressed']).toBe(
      true
    );
    expect(tree.props.children[2].props.hidden).toBe(false);
    // No HubuWorkspace is rendered while the create form owns the panel.
    expect(
      tree.props.children.some(
        (child: { type?: unknown } | undefined) => child?.type === HubuWorkspace
      )
    ).toBe(false);
  }
});

it('returns to the create container with its fields still mounted after a section switch', () => {
  const first = HubuOperationsWorkspace({});
  first.props.children[0].props.children[1].props.onClick();
  const other = HubuOperationsWorkspace({});
  expect(other.props.children[2].props.hidden).toBe(true);
  expect(other.props.children[2].props.children.type).toBe(
    CashSafetyReadinessWorkspace
  );
  other.props.children[0].props.children[0].props.onClick();
  expect(HubuOperationsWorkspace({}).props.children[2].props.hidden).toBe(
    false
  );
});
