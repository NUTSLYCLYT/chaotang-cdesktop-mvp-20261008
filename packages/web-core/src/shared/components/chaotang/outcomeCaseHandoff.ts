export const PENDING_OUTCOME_INTENT_KEY = 'chaotang.pending-intent';
export const OUTCOME_CASE_DESTINATION = {
  to: '/court',
  hash: 'study',
} as const;

export function getTaskRecordDestination(jobId: string) {
  return { to: '/court-workspace', search: { job: jobId } } as const;
}

export function consumePendingOutcomeIntent(
  storage: Pick<Storage, 'getItem' | 'removeItem'>
): string | undefined {
  const intent = storage.getItem(PENDING_OUTCOME_INTENT_KEY);
  if (!intent) return undefined;
  storage.removeItem(PENDING_OUTCOME_INTENT_KEY);
  return intent;
}
