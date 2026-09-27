import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/hooks/chaotang/useJunjichuCases', () => ({
  useCaseReply: () => ({ data: undefined }),
  useJunjichuCase: () => ({ data: undefined }),
  useJunjichuCases: () => ({
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({
    user: { id: 'owner' },
    health: { service: 'test' },
  }),
}));

import { JunjichuCasesWorkspace } from './JunjichuCasesWorkspace';

describe('JunjichuCasesWorkspace accessibility', () => {
  it('gives the icon-only refresh control a Chinese accessible name', () => {
    const markup = renderToStaticMarkup(createElement(JunjichuCasesWorkspace));

    expect(markup).toMatch(
      /<button[^>]*aria-label="刷新军机处案卷"[^>]*title="刷新案卷列表"/
    );
  });
});
