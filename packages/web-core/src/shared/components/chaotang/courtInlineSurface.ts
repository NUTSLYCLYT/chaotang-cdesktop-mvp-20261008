/**
 * Contract for the single operation surface shared by the embedded court shell
 * (A02 上书房 / A03 军机处 / A06 史馆 / B02 户部 / C01 锦衣卫 / B06 工部 /
 * C02 钦天监 / C03 翰林院) and the desktop Host.
 *
 * The sandboxed iframe measures its own stage and reports a strictly limited
 * rectangle. The Host never reads the iframe DOM (no allow-same-origin, no
 * contentDocument): it only accepts a finite, in-viewport rectangle for a known
 * court page. Missing, unknown or out-of-bounds geometry is ignored so the Host
 * never fabricates a working surface.
 */

export type InlineSurfacePage =
  | 'A01'
  | 'A02'
  | 'A03'
  | 'A06'
  | 'B02'
  | 'C01'
  | 'B06'
  | 'C02'
  | 'C03';

/** The only page ids allowed to own the single inline operation surface. */
export const INLINE_SURFACE_PAGES: readonly InlineSurfacePage[] = [
  'A01',
  'A02',
  'A03',
  'A06',
  'B02',
  'C01',
  'B06',
  'C02',
  'C03',
];

export function isInlineSurfacePage(
  value: unknown
): value is InlineSurfacePage {
  return (
    typeof value === 'string' &&
    (INLINE_SURFACE_PAGES as readonly string[]).includes(value)
  );
}

export interface InlineSurfaceViewport {
  width: number;
  height: number;
}

export interface InlineSurfaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InlineSurfaceState {
  page: InlineSurfacePage;
  suspended: boolean;
  rect: InlineSurfaceRect | null;
}

export const INLINE_SURFACE_MESSAGE = 'chaotang:inline-surface';
export const INLINE_SURFACE_REQUEST = 'chaotang:inline-surface-request';
// Host → child: release the single operation surface. The child restores its own
// composer/demo controls and must not re-measure or re-activate on ordinary
// clicks until the Host explicitly requests the surface again.
export const INLINE_SURFACE_DISMISS = 'chaotang:inline-surface-dismiss';

/** Degenerate geometry is rejected instead of presenting a fake surface. */
export const INLINE_SURFACE_MIN_WIDTH = 120;
export const INLINE_SURFACE_MIN_HEIGHT = 80;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Only the pages that own a real in-page operation surface. */
export function inlinePageForPanel(
  panel: string | null | undefined
): InlineSurfacePage | undefined {
  if (panel === 'results') return 'A01';
  if (panel === 'study') return 'A02';
  if (panel === 'cases') return 'A03';
  if (panel === 'shiguan') return 'A06';
  if (panel === 'jinyiwei') return 'C01';
  if (panel === 'hubu') return 'B02';
  if (panel === 'gongbu') return 'B06';
  if (panel === 'forecast') return 'C02';
  if (panel === 'learning') return 'C03';
  return undefined;
}

/**
 * What the Host should tell the child when the owning panel changes. Entering a
 * real page connects (and re-grants) the surface; every other panel — including
 * `null` from the close button, a switch to another department or the account
 * drawer — explicitly disconnects so the child can never keep the page in a
 * half-owned, dead state.
 */
export type InlineSurfaceDirective =
  | { kind: 'connect'; page: InlineSurfacePage }
  | { kind: 'disconnect' };

export function inlineSurfaceDirective(
  panel: string | null | undefined
): InlineSurfaceDirective {
  const page = inlinePageForPanel(panel);
  return page ? { kind: 'connect', page } : { kind: 'disconnect' };
}

/**
 * The rect must be plain finite numbers, non-negative, at least the minimum
 * useful size and fully inside the reported viewport. Anything else is dropped:
 * a stale or forged rectangle can never place real processing controls.
 */
export function readInlineSurfaceRect(
  value: unknown,
  viewport: InlineSurfaceViewport
): InlineSurfaceRect | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!isFiniteNumber(viewport?.width) || !isFiniteNumber(viewport?.height))
    return null;
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  const rect = value as Record<string, unknown>;
  const { left, top, width, height } = rect;
  if (
    !isFiniteNumber(left) ||
    !isFiniteNumber(top) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height)
  )
    return null;
  if (width < INLINE_SURFACE_MIN_WIDTH || height < INLINE_SURFACE_MIN_HEIGHT)
    return null;
  if (left < 0 || top < 0) return null;
  if (left + width > viewport.width || top + height > viewport.height)
    return null;
  return { left, top, width, height };
}

/**
 * Read an inbound bridge measurement. Unknown message types and pages return
 * `undefined` (ignore entirely); a known page always returns a state so the Host
 * can show an honest "connecting" notice instead of a fake success.
 */
export function readInlineSurfaceState(
  value: unknown,
  viewport: InlineSurfaceViewport
): InlineSurfaceState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const message = value as Record<string, unknown>;
  if (message.type !== INLINE_SURFACE_MESSAGE) return undefined;
  if (!isInlineSurfacePage(message.page)) return undefined;
  const suspended = message.suspended === true;
  return {
    page: message.page,
    suspended,
    rect: suspended ? null : readInlineSurfaceRect(message.rect, viewport),
  };
}

/** Absolute viewport placement for the embedded real component. */
export function inlineSurfaceStyle(
  rect: InlineSurfaceRect | null
): Record<string, string> | undefined {
  if (!rect) return undefined;
  return {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}
