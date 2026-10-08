import { createElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CHAOTANG_MODULE_SHELLS } from '@/shared/lib/chaotangShell';
import { ChaotangButton } from './ChaotangPrimitives';

// The migrated page keeps its own section state; this harness mounts it with a
// controlled hook so a single call exercises the real section mapping.
const h = vi.hoisted(() => ({ mounted: false, section: '' }));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState(initial: unknown) {
    if (!h.mounted) {
      h.mounted = true;
      h.section =
        typeof initial === 'function'
          ? (initial as () => string)()
          : (initial as string);
    }
    return [
      h.section,
      (next: unknown) => {
        h.section =
          typeof next === 'function'
            ? (next as (previous: string) => string)(h.section)
            : (next as string);
      },
    ];
  },
}));

vi.mock('./QintianWorkspace', () => ({
  QintianWorkspace: ({ mode }: { mode?: string }) =>
    createElement('div', { 'data-qintian': mode ?? 'none' }),
}));
vi.mock('./QintianConsultWorkspace', () => ({
  QintianConsultWorkspace: () =>
    createElement('div', { 'data-consult': 'true' }),
}));
vi.mock('./CalibrationWorkspace', () => ({
  CalibrationWorkspace: () =>
    createElement('div', { 'data-calibration': 'true' }),
}));
vi.mock('./LearningOverviewWorkspace', () => ({
  LearningOverviewWorkspace: ({
    onNavigate,
    scrollPresentation,
  }: {
    onNavigate: (section: string) => void;
    scrollPresentation?: boolean;
  }) =>
    createElement('div', {
      'data-learning-overview': 'true',
      'data-scroll-presentation': String(Boolean(scrollPresentation)),
      onNavigate,
    }),
}));
vi.mock('./ShiguanWorkspace', () => ({
  ShiguanWorkspace: ({ mode }: { mode?: string }) =>
    createElement('div', { 'data-shiguan': mode ?? 'none' }),
}));
vi.mock('./ReviewDispositionWorkspace', () => ({
  ReviewDispositionWorkspace: () =>
    createElement('div', { 'data-review': 'true' }),
}));
vi.mock('./OutcomeReadinessWorkspace', () => ({
  OutcomeReadinessWorkspace: () =>
    createElement('div', { 'data-outcome': 'true' }),
}));
vi.mock('./HanlinReadinessWorkspace', () => ({
  HanlinReadinessWorkspace: () =>
    createElement('div', { 'data-hanlin': 'true' }),
}));
vi.mock('./KnowledgeSourcesReadinessWorkspace', () => ({
  KnowledgeSourcesReadinessWorkspace: () =>
    createElement('div', { 'data-knowledge': 'true' }),
}));
vi.mock('./LifeWorkspace', () => ({
  LifeWorkspace: ({ mode }: { mode?: string }) =>
    createElement('div', { 'data-life': mode ?? 'none' }),
}));

import { DepartmentContentWorkspace } from './DepartmentContentWorkspace';
import { QintianWorkspace } from './QintianWorkspace';
import { QintianConsultWorkspace } from './QintianConsultWorkspace';
import { CalibrationWorkspace } from './CalibrationWorkspace';
import { LearningOverviewWorkspace } from './LearningOverviewWorkspace';
import { ShiguanWorkspace } from './ShiguanWorkspace';
import { ReviewDispositionWorkspace } from './ReviewDispositionWorkspace';
import { OutcomeReadinessWorkspace } from './OutcomeReadinessWorkspace';
import { HanlinReadinessWorkspace } from './HanlinReadinessWorkspace';
import { KnowledgeSourcesReadinessWorkspace } from './KnowledgeSourcesReadinessWorkspace';
import { LifeWorkspace } from './LifeWorkspace';

type AnyElement = ReactElement<Record<string, any>>;

function nodes(value: unknown): AnyElement[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as AnyElement;
  return [element, ...nodes(element.props.children)];
}

function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  return texts((value as AnyElement).props.children);
}

function mount(props: {
  moduleId: 'forecast' | 'learning' | 'life';
  initialSection?: string;
  scrollPresentation?: boolean;
}) {
  h.mounted = false;
  return DepartmentContentWorkspace(props);
}

function findByType(tree: unknown, type: unknown) {
  return nodes(tree).find((node) => node.type === type);
}

beforeEach(() => {
  h.mounted = false;
  h.section = '';
});

it('keeps every Qintian section wired to its original business component and mode', () => {
  for (const [section, component, mode] of [
    ['forecast-overview', QintianWorkspace, 'overview'],
    ['consult', QintianConsultWorkspace, undefined],
    ['forecasts', QintianWorkspace, 'forecasts'],
    ['triggers', QintianWorkspace, 'triggers'],
    ['reviews', QintianWorkspace, 'reviews'],
    ['calibration', CalibrationWorkspace, undefined],
  ] as const) {
    const tree = mount({ moduleId: 'forecast', initialSection: section });
    const body = findByType(tree, component);
    expect(body, `${section} renders ${component.name}`).toBeDefined();
    if (mode) expect(body!.props.mode).toBe(mode);
  }
});

it('keeps every Hanlin section wired to its original business component and mode', () => {
  for (const [section, component, mode] of [
    ['learning-overview', LearningOverviewWorkspace, undefined],
    ['archives', ShiguanWorkspace, 'archives'],
    ['recall', ShiguanWorkspace, 'recall'],
    ['archive-review', ReviewDispositionWorkspace, undefined],
    ['outcomes', OutcomeReadinessWorkspace, undefined],
    ['hanlin', HanlinReadinessWorkspace, undefined],
    ['knowledge-sources', KnowledgeSourcesReadinessWorkspace, undefined],
  ] as const) {
    const tree = mount({ moduleId: 'learning', initialSection: section });
    const body = findByType(tree, component);
    expect(body, `${section} renders ${component.name}`).toBeDefined();
    if (mode) expect(body!.props.mode).toBe(mode);
  }
});

it('renders all six Qintian and seven Hanlin section choices from the shell', () => {
  for (const moduleId of ['forecast', 'learning'] as const) {
    const shell = CHAOTANG_MODULE_SHELLS[moduleId];
    const tree = mount({ moduleId });
    const labels = nodes(tree)
      .filter((node) => node.type === ChaotangButton)
      .map((node) => node.props.children);
    expect(labels).toEqual(shell.sections.map((section) => section.label));
    expect(labels).toHaveLength(moduleId === 'forecast' ? 6 : 7);
  }
});

it('falls back to the overview for a missing or cross-department section', () => {
  expect(
    findByType(
      mount({ moduleId: 'forecast', initialSection: 'hanlin' }),
      QintianWorkspace
    )!.props.mode
  ).toBe('overview');
  expect(
    findByType(
      mount({ moduleId: 'forecast', initialSection: 'not-a-section' }),
      QintianWorkspace
    )!.props.mode
  ).toBe('overview');
  expect(
    findByType(
      mount({ moduleId: 'learning', initialSection: 'reviews' }),
      LearningOverviewWorkspace
    )
  ).toBeDefined();
  expect(
    findByType(mount({ moduleId: 'learning' }), LearningOverviewWorkspace)
  ).toBeDefined();
});

it('lets the learning overview navigate to a real target section', () => {
  const overview = findByType(
    DepartmentContentWorkspace({
      moduleId: 'learning',
      initialSection: 'learning-overview',
    }),
    LearningOverviewWorkspace
  )!;
  overview.props.onNavigate('hanlin');
  const next = DepartmentContentWorkspace({
    moduleId: 'learning',
    initialSection: 'learning-overview',
  });
  expect(findByType(next, HanlinReadinessWorkspace)).toBeDefined();
  expect(findByType(next, LearningOverviewWorkspace)).toBeUndefined();
});

it('passes the court scroll presentation to the learning overview and defaults it outside the scroll', () => {
  const scroll = mount({
    moduleId: 'learning',
    initialSection: 'learning-overview',
    scrollPresentation: true,
  });
  const scrolled = findByType(scroll, LearningOverviewWorkspace)!;
  expect(scrolled.props.scrollPresentation).toBe(true);
  expect(scrolled.props.onNavigate).toBeTypeOf('function');

  const standard = mount({ moduleId: 'learning' });
  const plain = findByType(standard, LearningOverviewWorkspace)!;
  expect(Boolean(plain.props.scrollPresentation)).toBe(false);
});

it('keeps all thirteen Qintian and Hanlin section choices compact and reachable in the court scroll', () => {
  for (const moduleId of ['forecast', 'learning'] as const) {
    const shell = CHAOTANG_MODULE_SHELLS[moduleId];
    const tree = mount({ moduleId, scrollPresentation: true });
    const labels = nodes(tree)
      .filter((node) => node.type === ChaotangButton)
      .map((node) => node.props.children);
    expect(labels).toEqual(shell.sections.map((section) => section.label));
    expect(labels).toHaveLength(moduleId === 'forecast' ? 6 : 7);
  }
});

it('keeps the initial section and the real component in the compact court scroll', () => {
  expect(
    findByType(
      mount({
        moduleId: 'forecast',
        initialSection: 'calibration',
        scrollPresentation: true,
      }),
      CalibrationWorkspace
    )
  ).toBeDefined();
  expect(
    findByType(
      mount({
        moduleId: 'learning',
        initialSection: 'knowledge-sources',
        scrollPresentation: true,
      }),
      KnowledgeSourcesReadinessWorkspace
    )
  ).toBeDefined();
});

it('does not repeat the shell hero description as a second workbench inside the court scroll', () => {
  const tree = mount({ moduleId: 'forecast', scrollPresentation: true });
  const all = texts(tree).join(' ');
  expect(all).not.toContain(CHAOTANG_MODULE_SHELLS.forecast.description);
  expect(all).not.toContain(CHAOTANG_MODULE_SHELLS.forecast.eyebrow);
  // The active section still names itself and keeps its honest status.
  expect(all).toContain('钦天监总览');
  expect(all).toContain('功能已接入');
});

it('keeps the planned sections marked with their real limit instead of live', () => {
  const calibration = mount({
    moduleId: 'forecast',
    initialSection: 'calibration',
  });
  const calibrationBadge = nodes(calibration).find(
    (node) => node.props['data-status-badge'] === 'planned'
  );
  expect(calibrationBadge?.props.children).toBe('待接入');

  const knowledge = mount({
    moduleId: 'learning',
    initialSection: 'knowledge-sources',
  });
  const knowledgeBadge = nodes(knowledge).find(
    (node) => node.props['data-status-badge'] === 'planned'
  );
  expect(knowledgeBadge?.props.children).toBe('待接入');
});

it('never claims runtime or model readiness from the static section config', () => {
  for (const [moduleId, section] of [
    ['forecast', 'forecast-overview'],
    ['learning', 'outcomes'],
    ['learning', 'hanlin'],
  ] as const) {
    const all = texts(mount({ moduleId, initialSection: section })).join(' ');
    expect(all).toContain('功能已接入');
    expect(all).not.toContain('已接真实数据');
    expect(all).not.toContain('模型已');
    expect(all).not.toContain('已连接');
  }
});

it('maps every life section to its real local mode', () => {
  for (const [section, mode] of [
    ['life-today', 'today'],
    ['calendar', 'calendar'],
    ['reminders', 'reminders'],
    ['notes', 'notes'],
    ['privacy', 'privacy'],
  ] as const) {
    const tree = mount({ moduleId: 'life', initialSection: section });
    const body = findByType(tree, LifeWorkspace);
    expect(body, `${section} renders LifeWorkspace`).toBeDefined();
    expect(body!.props.mode).toBe(mode);
  }
});

it('opens the life panel on today by default and never cross-opens a wealth section', () => {
  expect(
    findByType(mount({ moduleId: 'life' }), LifeWorkspace)!.props.mode
  ).toBe('today');
  expect(
    findByType(
      mount({ moduleId: 'life', initialSection: 'hubu-overview' }),
      LifeWorkspace
    )!.props.mode
  ).toBe('today');
  expect(
    findByType(
      mount({ moduleId: 'life', initialSection: 'not-a-section' }),
      LifeWorkspace
    )!.props.mode
  ).toBe('today');
});

it('shows the plain local-life intro and local-only status instead of the long shell title', () => {
  const tree = mount({ moduleId: 'life' });
  const all = texts(tree).join(' ');
  expect(all).toContain('在本机管理日程、提醒和笔记；不自动发送给模型');
  expect(all).toContain('仅本机');
  expect(all).not.toContain('客户端扩展领域');
  expect(all).not.toContain('三份技术文档未定义');
  expect(all).not.toContain('实时AI');
  expect(all).not.toContain('功能已接入');
});
