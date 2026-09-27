import { describe, expect, it, vi } from 'vitest';
import {
  consumePendingOutcomeIntent,
  getTaskRecordDestination,
  OUTCOME_CASE_DESTINATION,
  PENDING_OUTCOME_INTENT_KEY,
  storePendingOutcomeIntent,
} from './outcomeCaseHandoff';

describe('outcome case handoff', () => {
  it('routes cases to the live study section, not the CDesktop workspace view', () => {
    expect(OUTCOME_CASE_DESTINATION).toEqual({ to: '/court', hash: 'study' });
  });

  it('preserves the task ID when opening the detailed task record', () => {
    expect(getTaskRecordDestination('job-123')).toEqual({
      to: '/court-workspace',
      search: { job: 'job-123' },
    });
  });

  it('consumes an editable intent once for the same account session', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const scope = { ownerUserId: 'owner-a', authGeneration: 1 };
    expect(
      storePendingOutcomeIntent(storage, 'review an open source project', scope)
    ).toBe(true);

    expect(consumePendingOutcomeIntent(storage, scope)).toBe(
      'review an open source project'
    );
    expect(consumePendingOutcomeIntent(storage, scope)).toBeUndefined();
  });

  it('does not remove unrelated session data when no case is pending', () => {
    const values = new Map([['other-session-value', 'keep']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    expect(
      consumePendingOutcomeIntent(storage, {
        ownerUserId: 'owner-a',
        authGeneration: 1,
      })
    ).toBeUndefined();
    expect(values.get('other-session-value')).toBe('keep');
  });

  it.each([
    { ownerUserId: 'owner-b', authGeneration: 1 },
    { ownerUserId: 'owner-a', authGeneration: 2 },
    { ownerUserId: null, authGeneration: 1 },
  ])('rejects an account or login-session change: %j', (recipient) => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    storePendingOutcomeIntent(storage, 'owner-a confidential objective', {
      ownerUserId: 'owner-a',
      authGeneration: 1,
    });
    expect(consumePendingOutcomeIntent(storage, recipient)).toBeUndefined();
    expect(values.has(PENDING_OUTCOME_INTENT_KEY)).toBe(false);
  });

  it('allows an anonymous case only after the immediately following explicit login', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const anonymous = { ownerUserId: null, authGeneration: 0 };
    storePendingOutcomeIntent(storage, 'first case', anonymous);
    expect(
      consumePendingOutcomeIntent(storage, {
        ownerUserId: 'owner-a',
        authGeneration: 1,
      })
    ).toBe('first case');
    storePendingOutcomeIntent(storage, 'expired login flow', anonymous);
    expect(
      consumePendingOutcomeIntent(storage, {
        ownerUserId: 'owner-b',
        authGeneration: 3,
      })
    ).toBeUndefined();
  });

  it('discards legacy unowned text instead of attributing it to the next user', () => {
    const values = new Map([
      [PENDING_OUTCOME_INTENT_KEY, 'previous unowned objective'],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };
    expect(
      consumePendingOutcomeIntent(
        storage,
        {
          ownerUserId: 'owner-b',
          authGeneration: 0,
        },
        () => {
          values.set('discard-notice', 'shown');
        }
      )
    ).toBeUndefined();
    expect(values.get('discard-notice')).toBe('shown');
  });

  it('fails safely when browser storage is unavailable or the objective is oversized', () => {
    const unavailable = {
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {
        throw new Error('storage disabled');
      },
      removeItem: () => {
        throw new Error('storage disabled');
      },
    };
    const scope = { ownerUserId: 'owner-a', authGeneration: 1 };
    expect(storePendingOutcomeIntent(unavailable, 'objective', scope)).toBe(
      false
    );
    expect(consumePendingOutcomeIntent(unavailable, scope)).toBeUndefined();
    const deniedAccess = () => {
      throw new Error('storage getter denied');
    };
    expect(storePendingOutcomeIntent(deniedAccess, 'objective', scope)).toBe(
      false
    );
    expect(consumePendingOutcomeIntent(deniedAccess, scope)).toBeUndefined();
    expect(
      storePendingOutcomeIntent(unavailable, 'x'.repeat(4001), scope)
    ).toBe(false);
  });

  it('does not restore expired or future-dated handoffs', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const scope = { ownerUserId: 'owner-a', authGeneration: 1 };
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      storePendingOutcomeIntent(storage, 'expired', scope);
      clock.mockReturnValue(2_000_000);
      expect(consumePendingOutcomeIntent(storage, scope)).toBeUndefined();
      storePendingOutcomeIntent(storage, 'future', scope);
      clock.mockReturnValue(1_000_000);
      expect(consumePendingOutcomeIntent(storage, scope)).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });
});
