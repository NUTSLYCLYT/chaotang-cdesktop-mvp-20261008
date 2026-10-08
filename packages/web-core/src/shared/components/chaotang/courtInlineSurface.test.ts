import { describe, expect, it } from 'vitest';
import {
  INLINE_SURFACE_DISMISS,
  INLINE_SURFACE_MESSAGE,
  inlinePageForPanel,
  inlineSurfaceDirective,
  inlineSurfaceStyle,
  readInlineSurfaceRect,
  readInlineSurfaceState,
  type InlineSurfaceViewport,
} from './courtInlineSurface';

const viewport: InlineSurfaceViewport = { width: 1440, height: 1000 };
const validRect = { left: 398, top: 184, width: 696, height: 690 };

describe('inline operation surface page mapping', () => {
  it('maps every real court page, including B02/B06 and the C02/C03 fusion pages', () => {
    expect(inlinePageForPanel('results')).toBe('A01');
    expect(inlinePageForPanel('study')).toBe('A02');
    expect(inlinePageForPanel('cases')).toBe('A03');
    expect(inlinePageForPanel('shiguan')).toBe('A06');
    expect(inlinePageForPanel('jinyiwei')).toBe('C01');
    expect(inlinePageForPanel('hubu')).toBe('B02');
    expect(inlinePageForPanel('gongbu')).toBe('B06');
    expect(inlinePageForPanel('forecast')).toBe('C02');
    expect(inlinePageForPanel('learning')).toBe('C03');
  });
  it.each(['life', 'account', '', null, undefined])(
    'leaves %j on the existing secondary surface',
    (panel) => {
      expect(inlinePageForPanel(panel)).toBeUndefined();
    }
  );
});

describe('strict inbound geometry validation', () => {
  it('accepts result catalog geometry while retaining finite in-viewport validation', () => {
    expect(
      readInlineSurfaceState(
        { type: INLINE_SURFACE_MESSAGE, page: 'A01', rect: validRect },
        viewport
      )?.rect
    ).toEqual(validRect);
    expect(
      readInlineSurfaceState(
        {
          type: INLINE_SURFACE_MESSAGE,
          page: 'A01',
          rect: { ...validRect, left: -1 },
        },
        viewport
      )?.rect
    ).toBeNull();
    expect(inlineSurfaceDirective('results')).toEqual({
      kind: 'connect',
      page: 'A01',
    });
  });
  it('accepts a fully in-viewport finite rectangle', () => {
    expect(readInlineSurfaceRect(validRect, viewport)).toEqual(validRect);
  });
  it.each([
    undefined,
    null,
    'rect',
    42,
    [],
    { left: 0, top: 0, width: 0, height: 0 },
    { left: 0, top: 0, width: 40, height: 40 },
    { left: 0, top: 0, width: 696 },
    { left: NaN, top: 0, width: 696, height: 690 },
    { left: 0, top: Infinity, width: 696, height: 690 },
    { left: -10, top: 0, width: 696, height: 690 },
    { left: 0, top: -10, width: 696, height: 690 },
    { left: 0, top: 0, width: '696', height: 690 },
    // In viewport width but overflows the bottom edge.
    { left: 398, top: 400, width: 696, height: 690 },
    // Starts inside but overflows the right edge.
    { left: 900, top: 184, width: 696, height: 690 },
  ])('rejects missing, malformed or out-of-viewport geometry: %j', (value) => {
    expect(readInlineSurfaceRect(value, viewport)).toBeNull();
  });
  it('rejects a rect when the viewport itself is unknown', () => {
    expect(
      readInlineSurfaceRect(validRect, { width: 0, height: 1000 })
    ).toBeNull();
    expect(
      readInlineSurfaceRect(validRect, {
        width: undefined as unknown as number,
        height: 1000,
      })
    ).toBeNull();
  });
});

describe('bridge measurement messages', () => {
  it('reads a ready measurement for a known page', () => {
    expect(
      readInlineSurfaceState(
        {
          type: INLINE_SURFACE_MESSAGE,
          page: 'A02',
          suspended: false,
          rect: validRect,
        },
        viewport
      )
    ).toEqual({ page: 'A02', suspended: false, rect: validRect });
  });
  it('reads a ready measurement for the B02 treasury page', () => {
    expect(
      readInlineSurfaceState(
        {
          type: INLINE_SURFACE_MESSAGE,
          page: 'B02',
          suspended: false,
          rect: validRect,
        },
        viewport
      )
    ).toEqual({ page: 'B02', suspended: false, rect: validRect });
  });
  it('reads a ready measurement for the B06 engineering page', () => {
    expect(
      readInlineSurfaceState(
        {
          type: INLINE_SURFACE_MESSAGE,
          page: 'B06',
          suspended: false,
          rect: validRect,
        },
        viewport
      )
    ).toEqual({ page: 'B06', suspended: false, rect: validRect });
  });
  it('reads a ready measurement for the C02 Qintian and C03 Hanlin pages', () => {
    for (const page of ['C02', 'C03'] as const) {
      expect(
        readInlineSurfaceState(
          {
            type: INLINE_SURFACE_MESSAGE,
            page,
            suspended: false,
            rect: validRect,
          },
          viewport
        )
      ).toEqual({ page, suspended: false, rect: validRect });
    }
  });
  it('keeps a known page but drops a missing or illegal rect', () => {
    expect(
      readInlineSurfaceState(
        { type: INLINE_SURFACE_MESSAGE, page: 'A03', suspended: false },
        viewport
      )
    ).toEqual({ page: 'A03', suspended: false, rect: null });
    expect(
      readInlineSurfaceState(
        {
          type: INLINE_SURFACE_MESSAGE,
          page: 'A03',
          suspended: false,
          rect: { left: 0, top: 0, width: 4, height: 4 },
        },
        viewport
      )
    ).toEqual({ page: 'A03', suspended: false, rect: null });
  });
  it('ignores the rect while the child reports the surface suspended', () => {
    expect(
      readInlineSurfaceState(
        {
          type: INLINE_SURFACE_MESSAGE,
          page: 'A02',
          suspended: true,
          rect: validRect,
        },
        viewport
      )
    ).toEqual({ page: 'A02', suspended: true, rect: null });
  });
  it.each([
    undefined,
    null,
    { type: 'chaotang:route', page: 'A02' },
    { type: INLINE_SURFACE_MESSAGE, page: 'B01', rect: validRect },
    { type: INLINE_SURFACE_MESSAGE, page: 'B03', rect: validRect },
    { type: INLINE_SURFACE_MESSAGE, page: 'C04', rect: validRect },
    { type: INLINE_SURFACE_MESSAGE, page: 'N01', rect: validRect },
    { type: INLINE_SURFACE_MESSAGE, page: '../../../evil', rect: validRect },
    { type: INLINE_SURFACE_MESSAGE, page: 42, rect: validRect },
  ])('ignores unrelated or forged payloads: %j', (value) => {
    expect(readInlineSurfaceState(value, viewport)).toBeUndefined();
  });
  it('never lets an extra payload smuggle a foreign page id', () => {
    const state = readInlineSurfaceState(
      {
        type: INLINE_SURFACE_MESSAGE,
        page: 'A02',
        rect: validRect,
        extra: true,
      },
      viewport
    );
    expect(state?.page).toBe('A02');
  });
});

describe('inline surface lifecycle directive', () => {
  it('connects the B02 treasury, B06 engineering, C02 Qintian, C03 Hanlin and the four real court pages and disconnects every other panel', () => {
    expect(inlineSurfaceDirective('shiguan')).toEqual({
      kind: 'connect',
      page: 'A06',
    });
    expect(inlineSurfaceDirective('study')).toEqual({
      kind: 'connect',
      page: 'A02',
    });
    expect(inlineSurfaceDirective('cases')).toEqual({
      kind: 'connect',
      page: 'A03',
    });
    expect(inlineSurfaceDirective('jinyiwei')).toEqual({
      kind: 'connect',
      page: 'C01',
    });
    expect(inlineSurfaceDirective('hubu')).toEqual({
      kind: 'connect',
      page: 'B02',
    });
    expect(inlineSurfaceDirective('gongbu')).toEqual({
      kind: 'connect',
      page: 'B06',
    });
    expect(inlineSurfaceDirective('forecast')).toEqual({
      kind: 'connect',
      page: 'C02',
    });
    expect(inlineSurfaceDirective('learning')).toEqual({
      kind: 'connect',
      page: 'C03',
    });
    for (const panel of [
      'life',
      'account',
      'models',
      'skills',
      'mcp',
      '',
      null,
      undefined,
    ]) {
      expect(inlineSurfaceDirective(panel)).toEqual({ kind: 'disconnect' });
    }
  });
  it('names the dismiss message the Host sends when the surface is released', () => {
    expect(INLINE_SURFACE_DISMISS).toBe('chaotang:inline-surface-dismiss');
  });
});

describe('inline placement style', () => {
  it('places the real component inside the reported rectangle', () => {
    expect(inlineSurfaceStyle(validRect)).toEqual({
      position: 'fixed',
      left: '398px',
      top: '184px',
      width: '696px',
      height: '690px',
    });
  });
  it('returns no placement when the rectangle is unavailable', () => {
    expect(inlineSurfaceStyle(null)).toBeUndefined();
  });
});

it('maps the real Jinyiwei investigation surface to C01, never to council', () => {
  expect(inlinePageForPanel('jinyiwei')).toBe('C01');
  expect(inlineSurfaceDirective('jinyiwei')).toEqual({
    kind: 'connect',
    page: 'C01',
  });
  expect(
    readInlineSurfaceState(
      { type: INLINE_SURFACE_MESSAGE, page: 'C01', rect: validRect },
      viewport
    )
  ).toEqual({ page: 'C01', suspended: false, rect: validRect });
});

it('maps the real treasury surface to B02 and places it inside the reported scroll rectangle', () => {
  expect(inlineSurfaceDirective('hubu')).toEqual({
    kind: 'connect',
    page: 'B02',
  });
  expect(
    readInlineSurfaceState(
      { type: INLINE_SURFACE_MESSAGE, page: 'B02', rect: validRect },
      viewport
    )
  ).toEqual({ page: 'B02', suspended: false, rect: validRect });
  expect(inlineSurfaceStyle(validRect)).toEqual({
    position: 'fixed',
    left: '398px',
    top: '184px',
    width: '696px',
    height: '690px',
  });
});

it('maps the real engineering surface to B06 inside the original central display, never to a drawer', () => {
  expect(inlinePageForPanel('gongbu')).toBe('B06');
  expect(inlineSurfaceDirective('gongbu')).toEqual({
    kind: 'connect',
    page: 'B06',
  });
  expect(
    readInlineSurfaceState(
      { type: INLINE_SURFACE_MESSAGE, page: 'B06', rect: validRect },
      viewport
    )
  ).toEqual({ page: 'B06', suspended: false, rect: validRect });
  // A truly unknown page id stays rejected now that B06 is a real page.
  expect(
    readInlineSurfaceState(
      { type: INLINE_SURFACE_MESSAGE, page: 'N01', rect: validRect },
      viewport
    )
  ).toBeUndefined();
});

it('maps the Qintian and Hanlin pages to C02/C03 inside the original display, never a second drawer', () => {
  expect(inlinePageForPanel('forecast')).toBe('C02');
  expect(inlinePageForPanel('learning')).toBe('C03');
  expect(inlineSurfaceDirective('forecast')).toEqual({
    kind: 'connect',
    page: 'C02',
  });
  expect(inlineSurfaceDirective('learning')).toEqual({
    kind: 'connect',
    page: 'C03',
  });
  for (const page of ['C02', 'C03'] as const) {
    expect(
      readInlineSurfaceState(
        { type: INLINE_SURFACE_MESSAGE, page, rect: validRect },
        viewport
      )
    ).toEqual({ page, suspended: false, rect: validRect });
  }
  // A neighbour page id that owns no inline surface stays rejected now that the
  // eight real pages are accepted.
  expect(
    readInlineSurfaceState(
      { type: INLINE_SURFACE_MESSAGE, page: 'C04', rect: validRect },
      viewport
    )
  ).toBeUndefined();
});
