import { afterEach, describe, expect, it, vi } from 'vitest';
import { decreeIdempotencyKey } from '@/shared/lib/chaotangFusion';
import type { AcceptedDecree } from '@/shared/providers/ChaotangProvider';
import { submitStudyDecree } from './studySubmission';

vi.mock('@/shared/lib/chaotangFusion', () => ({
  decreeIdempotencyKey: vi.fn().mockResolvedValue('same-owner-draft-key'),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(decreeIdempotencyKey).mockResolvedValue('same-owner-draft-key');
});

function setup() {
  return {
    ownerUserId: 'owner-a',
    draft: {
      decreeText: 'approved objective',
      draftVersion: 1,
      draftFingerprint: 'f',
    },
    issue: vi.fn().mockResolvedValue({ jobId: 'job-a' } as AcceptedDecree),
    isCurrent: vi.fn().mockReturnValue(true),
    remember: vi.fn(),
  };
}

describe('study submission recovery', () => {
  it('keeps server acceptance visible when local recovery storage throws', async () => {
    const input = setup();
    input.remember.mockImplementation(() => {
      throw new Error('quota');
    });
    expect(await submitStudyDecree(input)).toEqual({
      status: 'accepted',
      jobId: 'job-a',
      remembered: false,
    });
    expect(input.issue).toHaveBeenCalledTimes(1);
  });

  it('records the accepted task without changing the confirmed draft', async () => {
    const input = setup();
    expect(await submitStudyDecree(input)).toEqual({
      status: 'accepted',
      jobId: 'job-a',
      remembered: true,
    });
    expect(input.issue).toHaveBeenCalledWith({
      ...input.draft,
      idempotencyKey: 'same-owner-draft-key',
    });
    expect(input.remember).toHaveBeenCalledWith('job-a');
  });

  it('does not submit after leaving the session during key preparation', async () => {
    const input = setup();
    input.isCurrent.mockReturnValue(false);
    expect(await submitStudyDecree(input)).toEqual({ status: 'left-session' });
    expect(input.issue).not.toHaveBeenCalled();
    expect(input.remember).not.toHaveBeenCalled();
  });

  it('does not write a late receipt into a departed session', async () => {
    const input = setup();
    input.isCurrent.mockReturnValueOnce(true).mockReturnValue(false);
    expect(await submitStudyDecree(input)).toEqual({ status: 'left-session' });
    expect(input.issue).toHaveBeenCalledTimes(1);
    expect(input.remember).not.toHaveBeenCalled();
  });

  it('does not call the backend when local key preparation fails', async () => {
    const input = setup();
    vi.mocked(decreeIdempotencyKey).mockRejectedValue(
      new Error('crypto unavailable')
    );
    expect(await submitStudyDecree(input)).toEqual({ status: 'unconfirmed' });
    expect(input.issue).not.toHaveBeenCalled();
  });

  it('does not claim a lost server response proves rejection or retry automatically', async () => {
    const input = setup();
    input.issue.mockRejectedValue(new Error('connection lost'));
    expect(await submitStudyDecree(input)).toEqual({ status: 'unconfirmed' });
    expect(input.issue).toHaveBeenCalledTimes(1);
    expect(input.remember).not.toHaveBeenCalled();
  });
});
