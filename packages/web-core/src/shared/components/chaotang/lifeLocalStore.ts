export type LifeItemKind = 'schedule' | 'reminder' | 'note';

export interface LifeItem {
  id: string;
  kind: LifeItemKind;
  title: string;
  detail: string;
  date: string;
  time: string;
  completed: boolean;
  createdAt: string;
}

export type LifeStorageRead =
  | { status: 'empty' }
  | { status: 'ready'; items: LifeItem[] }
  | { status: 'error'; message: string };

/**
 * Legacy v1 records were stored under a single shared key for every account.
 * Ownership is unknown, so these bytes are kept as-is and never exposed to any
 * account or migrated automatically.
 */
export const LEGACY_LIFE_STORAGE_KEY = 'chaotang.life.local.v1';

const OWNER_KEY_PREFIX = 'chaotang.life.local.v2';

export function ownerLifeStorageKey(ownerId: string): string {
  return `${OWNER_KEY_PREFIX}:${encodeURIComponent(ownerId)}`;
}

export function hasLegacyLifeItems(): boolean {
  try {
    return localStorage.getItem(LEGACY_LIFE_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

const LIFE_ITEM_KINDS: LifeItemKind[] = ['schedule', 'reminder', 'note'];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLifeItem(value: unknown): value is LifeItem {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.kind === 'string' &&
    LIFE_ITEM_KINDS.includes(value.kind as LifeItemKind) &&
    typeof value.title === 'string' &&
    typeof value.detail === 'string' &&
    typeof value.date === 'string' &&
    typeof value.time === 'string' &&
    typeof value.completed === 'boolean' &&
    typeof value.createdAt === 'string'
  );
}

/**
 * Reads only the given owner's key. A missing key is a normal empty account; a
 * broken or unexpected payload is reported as an error so the caller can stop
 * writing and offer a retry instead of overwriting data with an empty list.
 */
export function readOwnerLifeItems(ownerId: string): LifeStorageRead {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ownerLifeStorageKey(ownerId));
  } catch {
    return {
      status: 'error',
      message: '本机存储不可用，无法读取当前账户的生活记录。',
    };
  }
  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'error',
      message:
        '本机生活记录已损坏（JSON 解析失败），为避免覆盖已停止写入，请重试读取。',
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      status: 'error',
      message: '本机生活记录结构无效，为避免覆盖已停止写入，请重试读取。',
    };
  }
  if (!parsed.every(isLifeItem)) {
    return {
      status: 'error',
      message: '本机生活记录包含无效条目，为避免丢失已停止写入，请重试读取。',
    };
  }
  return { status: 'ready', items: parsed };
}

/**
 * Persists the current owner's records. Throws when the browser refuses the
 * write (quota, privacy mode) so the caller can keep the draft and surface a
 * retryable error.
 */
export function writeOwnerLifeItems(ownerId: string, items: LifeItem[]): void {
  localStorage.setItem(ownerLifeStorageKey(ownerId), JSON.stringify(items));
}
