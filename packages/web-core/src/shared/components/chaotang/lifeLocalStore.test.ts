import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_LIFE_STORAGE_KEY,
  hasLegacyLifeItems,
  ownerLifeStorageKey,
  readOwnerLifeItems,
  writeOwnerLifeItems,
  type LifeItem,
} from './lifeLocalStore';

const store = new Map<string, string>();
let failOnWrite = false;

const localStorageMock = {
  getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
  setItem: vi.fn((key: string, value: string) => {
    if (failOnWrite) throw new Error('QuotaExceededError');
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => store.clear()),
};

vi.stubGlobal('localStorage', localStorageMock);

function item(over: Partial<LifeItem> = {}): LifeItem {
  return {
    id: 'id-1',
    kind: 'schedule',
    title: '标题',
    detail: '',
    date: '2026-09-29',
    time: '',
    completed: false,
    createdAt: '2026-09-29T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  store.clear();
  failOnWrite = false;
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
});

describe('owner scoped life storage', () => {
  it('isolates each owner under its own encoded v2 key', () => {
    expect(ownerLifeStorageKey('owner A/1')).toBe(
      'chaotang.life.local.v2:owner%20A%2F1'
    );
    writeOwnerLifeItems('owner A/1', [item()]);
    expect(store.has(ownerLifeStorageKey('owner A/1'))).toBe(true);
    expect(readOwnerLifeItems('owner A/1')).toEqual({
      status: 'ready',
      items: [item()],
    });
    expect(readOwnerLifeItems('owner B')).toEqual({ status: 'empty' });
  });

  it('keeps the legacy v1 bytes untouched and never exposes them to an account', () => {
    store.set(LEGACY_LIFE_STORAGE_KEY, '{"kind":"legacy-secret"}');
    expect(hasLegacyLifeItems()).toBe(true);
    expect(readOwnerLifeItems('owner-a')).toEqual({ status: 'empty' });
    writeOwnerLifeItems('owner-a', [item()]);
    expect(store.get(LEGACY_LIFE_STORAGE_KEY)).toBe('{"kind":"legacy-secret"}');
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
    expect(ownerLifeStorageKey('owner-a')).not.toBe(LEGACY_LIFE_STORAGE_KEY);
  });

  it('reports broken JSON instead of silently overwriting it with an empty list', () => {
    store.set(ownerLifeStorageKey('a'), '{not-json');
    const result = readOwnerLifeItems('a');
    expect(result.status).toBe('error');
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(store.get(ownerLifeStorageKey('a'))).toBe('{not-json');
  });

  it('reports an invalid structure instead of filtering entries away', () => {
    store.set(ownerLifeStorageKey('a'), JSON.stringify({ items: [] }));
    expect(readOwnerLifeItems('a').status).toBe('error');
    localStorageMock.getItem.mockClear();
    store.set(ownerLifeStorageKey('a'), JSON.stringify([{ id: 'only-id' }]));
    expect(readOwnerLifeItems('a').status).toBe('error');
  });

  it('keeps entries that only differ in field types out of the ready list', () => {
    store.set(
      ownerLifeStorageKey('a'),
      JSON.stringify([item(), { ...item(), completed: 'yes' }])
    );
    expect(readOwnerLifeItems('a').status).toBe('error');
  });

  it('surfaces a write failure to the caller', () => {
    failOnWrite = true;
    expect(() => writeOwnerLifeItems('a', [item()])).toThrow();
    expect(store.has(ownerLifeStorageKey('a'))).toBe(false);
  });

  it('reports unavailable storage as an error rather than empty', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(readOwnerLifeItems('a').status).toBe('error');
  });
});
