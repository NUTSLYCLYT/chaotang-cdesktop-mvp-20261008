import { describe, expect, it } from 'vitest';
import { courtDemoSnapshot, courtDemoWrite } from './courtFrameStorage';

function fixture() {
  const data = new Map([
    ['fusion.acceptance.session', 'synthetic-secret'],
    ['chaotang-demo-onboarding-v2', '{"skipped":true}'],
    ['private.customer.notes', 'private'],
  ]);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('sandbox demo storage boundary', () => {
  it('returns only known demo keys, never authentication or unrelated data', () => {
    const result = courtDemoSnapshot(fixture());
    expect(result.values).toEqual({
      'chaotang-demo-onboarding-v2': '{"skipped":true}',
    });
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });
  for (const key of [
    'fusion.acceptance.session',
    'private.customer.notes',
    '__proto__',
  ]) {
    it(`rejects writes and removals outside demo scope: ${key}`, () => {
      const storage = fixture();
      const before = [...storage.data];
      for (const value of ['"replace"', null]) {
        expect(
          courtDemoWrite(
            {
              type: 'chaotang:demo-storage-write',
              requestId: 'test-1',
              key,
              value,
            },
            storage
          )?.ok
        ).toBe(false);
      }
      expect([...storage.data]).toEqual(before);
    });
  }
  it('acknowledges only successfully persisted bounded JSON', () => {
    const storage = fixture();
    const message = {
      type: 'chaotang:demo-storage-write',
      requestId: 'test-1',
      key: 'chaotang-demo-onboarding-v2',
      value: '{"skipped":false}',
    };
    expect(courtDemoWrite(message, storage)?.ok).toBe(true);
    expect(storage.data.get(message.key)).toBe(message.value);
    expect(courtDemoWrite({ ...message, value: 'not-json' }, storage)?.ok).toBe(
      false
    );
    expect(
      courtDemoWrite(
        { ...message, value: JSON.stringify('x'.repeat(262144)) },
        storage
      )?.ok
    ).toBe(false);
    expect(courtDemoWrite({ ...message, requestId: {} }, storage)).toBeNull();
    expect(
      courtDemoWrite(message, {
        ...storage,
        setItem() {
          throw new Error('sensitive storage error');
        },
      })?.ok
    ).toBe(false);
    expect(courtDemoWrite({ ...message, value: null }, storage)?.ok).toBe(true);
    expect(storage.data.has(message.key)).toBe(false);
  });
  it('reports unavailable storage without copying exception details', () => {
    const result = courtDemoSnapshot({
      ...fixture(),
      getItem() {
        throw new Error('secret');
      },
    });
    expect(result.available).toBe(false);
    expect(result.values).toEqual({});
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
