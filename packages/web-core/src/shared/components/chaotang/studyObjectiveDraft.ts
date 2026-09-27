/** Local editable text only. Never persist confirmation or task authority here. */
export interface SavedStudyObjective {
  version: 1;
  ownerUserId: string;
  objective: string;
  savedAt: number;
}

type DraftStorage = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type DraftRead =
  | { status: 'found'; draft: SavedStudyObjective }
  | { status: 'empty' | 'unavailable' | 'invalid' };

function draftKey(ownerUserId: string) {
  if (!ownerUserId.trim()) throw new Error('Owner required');
  return `chaotang.study-objective.v1.${encodeURIComponent(ownerUserId)}`;
}

function validObjective(value: unknown): value is string {
  return (
    typeof value === 'string' && Boolean(value.trim()) && value.length <= 4000
  );
}

export function readStudyObjective(
  storage: DraftStorage,
  ownerUserId: string
): DraftRead {
  let raw: string | null;
  try {
    raw = storage().getItem(draftKey(ownerUserId));
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };
  if (raw.length > 32000) return { status: 'invalid' };
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).sort().join(',') !==
        'objective,ownerUserId,savedAt,version' ||
      value.version !== 1 ||
      value.ownerUserId !== ownerUserId ||
      !validObjective(value.objective) ||
      !Number.isSafeInteger(value.savedAt) ||
      value.savedAt < 0 ||
      value.savedAt > 8640000000000000
    )
      return { status: 'invalid' };
    return { status: 'found', draft: value };
  } catch {
    return { status: 'invalid' };
  }
}

export function saveStudyObjective(
  storage: DraftStorage,
  ownerUserId: string,
  objective: string
): SavedStudyObjective | null {
  if (!validObjective(objective)) return null;
  try {
    const draft: SavedStudyObjective = {
      version: 1,
      ownerUserId,
      objective,
      savedAt: Date.now(),
    };
    storage().setItem(draftKey(ownerUserId), JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function removeStudyObjective(
  storage: DraftStorage,
  ownerUserId: string
): boolean {
  try {
    storage().removeItem(draftKey(ownerUserId));
    return true;
  } catch {
    return false;
  }
}
