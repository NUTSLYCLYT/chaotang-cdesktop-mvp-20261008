import { describe, expect, it } from 'vitest';
import {
  consumePendingOutcomeIntent,
  getTaskRecordDestination,
  OUTCOME_CASE_DESTINATION,
  PENDING_OUTCOME_INTENT_KEY,
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

  it('consumes an editable intent once without issuing a task', () => {
    const values = new Map([
      [PENDING_OUTCOME_INTENT_KEY, 'review an open source project'],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    expect(consumePendingOutcomeIntent(storage)).toBe(
      'review an open source project'
    );
    expect(consumePendingOutcomeIntent(storage)).toBeUndefined();
  });

  it('does not remove unrelated session data when no case is pending', () => {
    const values = new Map([['other-session-value', 'keep']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    expect(consumePendingOutcomeIntent(storage)).toBeUndefined();
    expect(values.get('other-session-value')).toBe('keep');
  });
});
