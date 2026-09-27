import { describe, expect, it } from 'vitest';
import {
  courtBusinessHandoff,
  courtPanelFromRoute,
} from './courtBusinessHandoff';

describe('original court business handoff', () => {
  it('transfers only editable input, bound to the authenticated owner', () => {
    expect(
      courtBusinessHandoff(
        {
          type: 'chaotang:prepare-decree',
          prompt: '  调研仓库  ',
          jobId: 'forged',
          approved: true,
        },
        'owner-A'
      )
    ).toEqual({ panel: 'study', owner: 'owner-A', objective: '调研仓库' });
  });
  it('returns anonymous input for explicit post-login confirmation, without creating a task', () => {
    expect(
      courtBusinessHandoff({
        type: 'chaotang:prepare-decree',
        prompt: '调研仓库',
      })
    ).toEqual({ panel: 'account', pendingObjective: '调研仓库' });
  });
  it('rejects malformed, empty, oversized or unrelated input', () => {
    for (const value of [
      null,
      'execute',
      { type: 'chaotang:prepare-decree', prompt: {} },
      { type: 'chaotang:prepare-decree', prompt: ' ' },
      { type: 'chaotang:prepare-decree', prompt: 'x'.repeat(4001) },
      { type: 'chaotang:issue-decree', prompt: 'execute' },
      { type: 'chaotang:action', action: 'execute' },
    ])
      expect(courtBusinessHandoff(value, 'owner-A')).toBeUndefined();
  });
  it('accepts the input limit and opens study/cases without implying execution', () => {
    expect(
      courtBusinessHandoff(
        { type: 'chaotang:prepare-decree', prompt: 'x'.repeat(4000) },
        'owner-A'
      )?.panel
    ).toBe('study');
    expect(
      courtBusinessHandoff({ type: 'chaotang:action', action: 'study' })
    ).toEqual({ panel: 'study' });
    expect(
      courtBusinessHandoff({ type: 'chaotang:action', action: 'cases' })
    ).toEqual({ panel: 'cases' });
  });
  it('connects existing case destination and council deep links without replacing the visual shell', () => {
    expect(courtPanelFromRoute('/court', '#study')).toBe('study');
    expect(courtPanelFromRoute('/court', 'junjichu')).toBe('cases');
    expect(courtPanelFromRoute('/today', '#study')).toBeUndefined();
    expect(courtPanelFromRoute('/court', 'execute')).toBeUndefined();
  });
});
