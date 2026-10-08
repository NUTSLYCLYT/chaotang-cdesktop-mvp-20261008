import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  user: null as null | { id: string; username: string; email: string },
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const index = h.cursor++;
    if (!(index in h.values))
      h.values[index] =
        typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [
      h.values[index],
      (value: unknown) => {
        h.values[index] =
          typeof value === 'function'
            ? (value as (previous: unknown) => unknown)(h.values[index])
            : value;
      },
    ];
  },
}));

vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({ user: h.user }),
}));

import { LifeWorkspace } from './LifeWorkspace';
import {
  LEGACY_LIFE_STORAGE_KEY,
  ownerLifeStorageKey,
  type LifeItem,
} from './lifeLocalStore';

type Mode = 'today' | 'calendar' | 'reminders' | 'notes' | 'privacy';

const store = new Map<string, string>();
let writeFails = false;

const localStorageMock = {
  getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
  setItem: vi.fn((key: string, value: string) => {
    if (writeFails) throw new Error('quota');
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => store.clear()),
};

const confirmMock = vi.fn((_message?: string) => true);

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', { confirm: confirmMock });
vi.stubGlobal('crypto', { randomUUID: () => 'generated-id' });

function sample(over: Partial<LifeItem> = {}): LifeItem {
  return {
    id: 'seed-1',
    kind: 'schedule',
    title: '原有记录',
    detail: '',
    date: '2026-09-29',
    time: '',
    completed: false,
    createdAt: '2026-09-29T00:00:00.000Z',
    ...over,
  };
}

function nodes(value: unknown): ReactElement<any>[] {
  const collected: ReactElement<any>[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object' || !('props' in node)) return;
    const element = node as ReactElement<any>;
    collected.push(element);
    if (typeof element.type === 'function') {
      visit((element.type as (props: unknown) => unknown)(element.props));
      return;
    }
    visit(element.props.children);
  };
  visit(value);
  return collected;
}

/** Simulates the key={user.id} remount when the account changes. */
function remount() {
  h.values = [];
  h.cursor = 0;
}

function login(id: string) {
  h.user = { id, username: id, email: `${id}@example.test` };
}

function element(mode: Mode = 'calendar') {
  h.cursor = 0;
  return LifeWorkspace({ mode });
}

function view(mode: Mode = 'calendar') {
  const el = element(mode);
  return (el.type as (props: unknown) => ReactElement)(el.props);
}

function input(tree: ReactElement, label: string): ReactElement<any> {
  return nodes(tree).find((n) => n.props['aria-label'] === label)!;
}

function submit(tree: ReactElement) {
  nodes(tree)
    .find((n) => n.type === 'form')!
    .props.onSubmit({ preventDefault: () => undefined });
}

beforeEach(() => {
  h.values = [];
  h.cursor = 0;
  h.user = null;
  store.clear();
  writeFails = false;
  confirmMock.mockReset();
  confirmMock.mockReturnValue(true);
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
});

describe('life workspace account boundary', () => {
  it('does not touch local storage at all while anonymous and asks for login', () => {
    const anonymous = nodes(element('calendar'));
    expect(anonymous.some((n) => n.props.children === '请先登录')).toBe(true);
    expect(localStorageMock.getItem).not.toHaveBeenCalled();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('binds each render to the current owner v2 key and rebinds on switch', () => {
    login('owner-a');
    expect(element('calendar').key).toBe('owner-a');
    view('calendar');
    expect(localStorageMock.getItem).toHaveBeenCalledWith(
      ownerLifeStorageKey('owner-a')
    );

    localStorageMock.getItem.mockClear();
    remount();
    login('owner-b');
    expect(element('calendar').key).toBe('owner-b');
    view('calendar');
    expect(localStorageMock.getItem).toHaveBeenCalledWith(
      ownerLifeStorageKey('owner-b')
    );
    expect(localStorageMock.getItem).not.toHaveBeenCalledWith(
      ownerLifeStorageKey('owner-a')
    );
  });

  it('does not persist the previous account draft when the account switches', () => {
    login('owner-a');
    input(view('calendar'), '事项名称').props.onChange({
      target: { value: '旧草稿' },
    });
    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    remount();
    login('owner-b');
    localStorageMock.getItem.mockClear();
    const switched = view('calendar');
    expect(localStorageMock.getItem).toHaveBeenCalledWith(
      ownerLifeStorageKey('owner-b')
    );
    expect(localStorageMock.getItem).not.toHaveBeenCalledWith(
      ownerLifeStorageKey('owner-a')
    );
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(input(switched, '事项名称').props.value).toBe('');
  });

  it('persists before updating the list and clears the draft only on success', () => {
    login('owner-a');
    input(view('calendar'), '事项名称').props.onChange({
      target: { value: '晨跑' },
    });
    submit(view('calendar'));

    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    const [key, raw] = localStorageMock.setItem.mock.calls[0];
    expect(key).toBe(ownerLifeStorageKey('owner-a'));
    expect(JSON.parse(raw as string)[0].title).toBe('晨跑');
    expect(input(view('calendar'), '事项名称').props.value).toBe('');
  });

  it('keeps the draft and existing records when the write fails', () => {
    login('owner-a');
    store.set(ownerLifeStorageKey('owner-a'), JSON.stringify([sample()]));
    input(view('calendar'), '事项名称').props.onChange({
      target: { value: '未保存草稿' },
    });
    writeFails = true;
    submit(view('calendar'));

    const after = view('calendar');
    expect(input(after, '事项名称').props.value).toBe('未保存草稿');
    expect(nodes(after).some((n) => n.props.children === '原有记录')).toBe(
      true
    );
    expect(
      nodes(after).some((n) => String(n.props.children).startsWith('保存失败'))
    ).toBe(true);
  });

  it('does not change data when the delete confirmation is cancelled', () => {
    login('owner-a');
    store.set(ownerLifeStorageKey('owner-a'), JSON.stringify([sample()]));
    confirmMock.mockReturnValue(false);
    nodes(view('calendar'))
      .find((n) => n.props['aria-label'] === '删除')!
      .props.onClick();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(
      nodes(view('calendar')).some((n) => n.props.children === '原有记录')
    ).toBe(true);
  });

  it('deletes only from the current owner key after explicit confirmation', () => {
    login('owner-a');
    store.set(ownerLifeStorageKey('owner-a'), JSON.stringify([sample()]));
    confirmMock.mockReturnValue(true);
    nodes(view('calendar'))
      .find((n) => n.props['aria-label'] === '删除')!
      .props.onClick();
    expect(localStorageMock.setItem.mock.calls[0][0]).toBe(
      ownerLifeStorageKey('owner-a')
    );
    expect(
      JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string)
    ).toEqual([]);
  });

  it('surfaces a broken record, blocks writes, and re-reads on retry', () => {
    login('owner-a');
    store.set(ownerLifeStorageKey('owner-a'), '{broken');
    const broken = view('calendar');
    expect(nodes(broken).some((n) => n.props.role === 'alert')).toBe(true);

    input(view('calendar'), '事项名称').props.onChange({
      target: { value: 'x' },
    });
    submit(view('calendar'));
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(store.get(ownerLifeStorageKey('owner-a'))).toBe('{broken');

    localStorageMock.getItem.mockClear();
    nodes(view('calendar'))
      .find((n) => n.props['aria-label'] === '重试读取')!
      .props.onClick();
    view('calendar');
    expect(localStorageMock.getItem).toHaveBeenCalledWith(
      ownerLifeStorageKey('owner-a')
    );
  });

  it('shows the legacy notice without exposing legacy content to the account', () => {
    login('owner-a');
    store.set(LEGACY_LIFE_STORAGE_KEY, '{"title":"旧秘密"}');
    const rendered = JSON.stringify(nodes(view('calendar')));
    expect(rendered).toContain('旧版本机记录已保留，尚未关联账户');
    expect(rendered).not.toContain('旧秘密');
  });

  it('always states the local storage boundary', () => {
    login('owner-a');
    expect(JSON.stringify(nodes(view('calendar')))).toContain(
      '仅当前设备和账户，不云同步，不自动给Agent，当前设备存储不是加密保险箱'
    );
  });

  it('clears only the current owner records after confirmation', () => {
    login('owner-a');
    store.set(ownerLifeStorageKey('owner-a'), JSON.stringify([sample()]));
    confirmMock.mockReturnValue(true);
    nodes(view('privacy'))
      .find((n) => n.props['aria-label'] === '清除全部本地生活数据')!
      .props.onClick();
    expect(localStorageMock.setItem.mock.calls[0][0]).toBe(
      ownerLifeStorageKey('owner-a')
    );
    expect(
      JSON.parse(localStorageMock.setItem.mock.calls[0][1] as string)
    ).toEqual([]);
  });
});
