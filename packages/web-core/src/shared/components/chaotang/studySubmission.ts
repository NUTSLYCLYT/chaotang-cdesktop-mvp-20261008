import { decreeIdempotencyKey } from '@/shared/lib/chaotangFusion';
import type {
  AcceptedDecree,
  IssueChancellorDecreeInput,
} from '@/shared/providers/ChaotangProvider';

type SubmissionOutcome =
  | { status: 'accepted'; jobId: string; remembered: boolean }
  | { status: 'unconfirmed' }
  | { status: 'left-session' };

export async function submitStudyDecree({
  ownerUserId,
  draft,
  issue,
  isCurrent,
  remember,
}: {
  ownerUserId: string;
  draft: Omit<IssueChancellorDecreeInput, 'idempotencyKey'>;
  issue: (input: IssueChancellorDecreeInput) => Promise<AcceptedDecree>;
  isCurrent: () => boolean;
  remember: (jobId: string) => void;
}): Promise<SubmissionOutcome> {
  try {
    const idempotencyKey = await decreeIdempotencyKey(
      ownerUserId,
      draft.draftFingerprint
    );
    if (!isCurrent()) return { status: 'left-session' };
    const accepted = await issue({ ...draft, idempotencyKey });
    if (!isCurrent()) return { status: 'left-session' };
    let remembered = true;
    try {
      remember(accepted.jobId);
    } catch {
      // Local storage failure does not undo acceptance by the server.
      remembered = false;
    }
    return { status: 'accepted', jobId: accepted.jobId, remembered };
  } catch {
    // A lost response may follow a committed task: never report definite rejection.
    return { status: isCurrent() ? 'unconfirmed' : 'left-session' };
  }
}
