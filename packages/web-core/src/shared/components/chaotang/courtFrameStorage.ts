// Only existing demo UI preferences cross this boundary. Authentication, real
// tasks and account data must never use this bridge.
const DEMO_KEYS = new Set([
  'chaotang-demo-task-continuity-v1',
  'chaotang-demo-growth-events-v1',
  'chaotang-demo-visit-v1',
  'chaotang-demo-onboarding-v2',
  'chaotang-demo-feedback-v1',
]);
const MAX_VALUE_LENGTH = 262_144;
type DemoStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function courtDemoSnapshot(storage: DemoStorage) {
  const values: Record<string, string> = {};
  let available = true;
  for (const key of DEMO_KEYS) {
    try {
      const value = storage.getItem(key);
      if (value !== null && value.length <= MAX_VALUE_LENGTH)
        values[key] = value;
    } catch {
      available = false;
    }
  }
  return { type: 'chaotang:demo-storage', values, available };
}

export function courtDemoWrite(data: unknown, storage: DemoStorage) {
  if (!data || typeof data !== 'object') return null;
  const input = data as Record<string, unknown>;
  if (input.type !== 'chaotang:demo-storage-write') return null;
  if (
    typeof input.requestId !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(input.requestId)
  )
    return null;
  let ok = false;
  if (typeof input.key === 'string' && DEMO_KEYS.has(input.key)) {
    try {
      if (input.value === null) {
        storage.removeItem(input.key);
        ok = true;
      } else if (
        typeof input.value === 'string' &&
        input.value.length <= MAX_VALUE_LENGTH
      ) {
        JSON.parse(input.value);
        storage.setItem(input.key, input.value);
        ok = true;
      }
    } catch {
      /* No exception text or storage contents are sent to the frame. */
    }
  }
  return {
    type: 'chaotang:demo-storage-saved',
    requestId: input.requestId,
    ok,
  };
}
