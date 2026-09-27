export const PENDING_OUTCOME_INTENT_KEY = 'chaotang.pending-intent';
export const OUTCOME_CASE_DESTINATION = {
  to: '/court',
  hash: 'study',
} as const;

export function getTaskRecordDestination(jobId: string) {
  return { to: '/court-workspace', search: { job: jobId } } as const;
}

interface OutcomeIntentScope {
  ownerUserId: string | null;
  authGeneration: number;
}

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function storePendingOutcomeIntent(
  storage:
    | Pick<IntentStorage, 'setItem' | 'removeItem'>
    | (() => IntentStorage),
  intent: string,
  scope: OutcomeIntentScope
): boolean {
  try {
    const target = typeof storage === 'function' ? storage() : storage;
    target.removeItem(PENDING_OUTCOME_INTENT_KEY);
    const objective = intent.trim();
    if (!objective || objective.length > 4000) return false;
    target.setItem(
      PENDING_OUTCOME_INTENT_KEY,
      JSON.stringify({
        version: 1,
        objective,
        ...scope,
        createdAt: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function consumePendingOutcomeIntent(
  storage:
    | Pick<IntentStorage, 'getItem' | 'removeItem'>
    | (() => IntentStorage),
  scope: OutcomeIntentScope,
  onDiscard?: () => void
): string | undefined {
  try {
    const target = typeof storage === 'function' ? storage() : storage;
    const raw = target.getItem(PENDING_OUTCOME_INTENT_KEY);
    if (!raw) return undefined;
    target.removeItem(PENDING_OUTCOME_INTENT_KEY);
    const intent = JSON.parse(raw);
    if (
      !intent ||
      intent.version !== 1 ||
      !scope.ownerUserId ||
      typeof intent.objective !== 'string' ||
      !intent.objective.trim() ||
      intent.objective.length > 4000 ||
      !Number.isSafeInteger(intent.authGeneration) ||
      intent.authGeneration < 0 ||
      typeof intent.createdAt !== 'number' ||
      !Number.isFinite(intent.createdAt) ||
      intent.createdAt > Date.now() ||
      Date.now() - intent.createdAt > 15 * 60 * 1000
    ) {
      onDiscard?.();
      return undefined;
    }
    const sameSession =
      intent.ownerUserId === scope.ownerUserId &&
      intent.authGeneration === scope.authGeneration;
    const firstLogin =
      intent.ownerUserId === null &&
      intent.authGeneration + 1 === scope.authGeneration;
    if (sameSession || firstLogin) return intent.objective;
    onDiscard?.();
    return undefined;
  } catch {
    onDiscard?.();
    return undefined;
  }
}
