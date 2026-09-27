import { describe, expect, it } from 'vitest';
import {
  readStudyObjective,
  removeStudyObjective,
  saveStudyObjective,
} from './studyObjectiveDraft';

function store() {
  const values = new Map<string, string>();
  return {
    values,
    storage: () => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    }),
  };
}

describe('owner-scoped editable objectives', () => {
  it('preserves exact text and stores no execution authority', () => {
    const { values, storage } = store();
    const saved = saveStudyObjective(
      storage,
      'owner-a',
      '  目标\n材料与限制  '
    );
    expect(saved).not.toBeNull();
    expect(readStudyObjective(storage, 'owner-a')).toEqual({
      status: 'found',
      draft: saved,
    });
    expect(Object.keys(JSON.parse([...values.values()][0])).sort()).toEqual([
      'objective',
      'ownerUserId',
      'savedAt',
      'version',
    ]);
    expect(saved?.objective).toBe('  目标\n材料与限制  ');
  });
  it('isolates reads and removal without touching another account or storage key', () => {
    const { values, storage } = store();
    values.set('unrelated', 'keep');
    saveStudyObjective(storage, 'owner-a', 'private-a');
    saveStudyObjective(storage, 'owner-b', 'private-b');
    expect(readStudyObjective(storage, 'owner-c')).toEqual({ status: 'empty' });
    expect(removeStudyObjective(storage, 'owner-a')).toBe(true);
    expect(readStudyObjective(storage, 'owner-a')).toEqual({ status: 'empty' });
    expect(readStudyObjective(storage, 'owner-b').status).toBe('found');
    expect(values.get('unrelated')).toBe('keep');
  });
  it.each(['', '  ', '字'.repeat(4001)])(
    'rejects invalid input without overwriting an earlier draft (case %#)',
    (value) => {
      const { values, storage } = store();
      saveStudyObjective(storage, 'a', 'preserved');
      const before = [...values];
      expect(saveStudyObjective(storage, 'a', value)).toBeNull();
      expect([...values]).toEqual(before);
    }
  );
  it.each([
    { ownerUserId: 'b' },
    { version: 2 },
    { objective: 42 },
    { savedAt: -1 },
    { confirmed: true },
  ])('rejects altered records without deleting them: %j', (patch) => {
    const { values, storage } = store();
    const saved = saveStudyObjective(storage, 'a', 'goal');
    const key = [...values.keys()][0];
    const raw = JSON.stringify({ ...saved, ...patch });
    values.set(key, raw);
    expect(readStudyObjective(storage, 'a')).toEqual({ status: 'invalid' });
    expect(values.get(key)).toBe(raw);
  });
  it('handles unavailable storage and malformed JSON without crashing or claiming success', () => {
    const unavailable = () => {
      throw new Error('storage disabled');
    };
    expect(readStudyObjective(unavailable, 'a')).toEqual({
      status: 'unavailable',
    });
    expect(saveStudyObjective(unavailable, 'a', 'goal')).toBeNull();
    expect(removeStudyObjective(unavailable, 'a')).toBe(false);
    const { values, storage } = store();
    saveStudyObjective(storage, 'a', 'goal');
    values.set([...values.keys()][0], '{');
    expect(readStudyObjective(storage, 'a')).toEqual({ status: 'invalid' });
  });
});
