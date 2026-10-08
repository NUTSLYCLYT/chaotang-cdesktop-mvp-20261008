import { describe, expect, it } from 'vitest';
import {
  courtBusinessHandoff,
  courtPanelFromRoute,
  courtPanelSection,
} from './courtBusinessHandoff';

describe('original court business handoff', () => {
  it('opens real department panels without issuing a decree', () => {
    for (const panel of [
      'results',
      'hubu',
      'jinyiwei',
      'shiguan',
      'gongbu',
      'forecast',
      'learning',
      'life',
    ]) {
      expect(
        courtBusinessHandoff({ type: 'chaotang:action', action: panel })
      ).toEqual({ panel });
    }
    for (const panel of [
      'results',
      'hubu',
      'jinyiwei',
      'shiguan',
      'gongbu',
      'forecast',
      'learning',
      'life',
    ])
      expect(courtPanelFromRoute('/court', '#' + panel)).toBe(panel);
  });
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
    expect(courtPanelFromRoute('/court', '#models')).toBe('models');
    expect(courtPanelFromRoute('/court', 'junjichu')).toBe('cases');
    expect(courtPanelFromRoute('/today', '#study')).toBeUndefined();
    expect(courtPanelFromRoute('/court', 'execute')).toBeUndefined();
  });
  it('hands the Qintian and Hanlin routes to the single court shell', () => {
    expect(courtPanelFromRoute('/forecast', '')).toBe('forecast');
    expect(courtPanelFromRoute('/forecast', '#reviews')).toBe('forecast');
    expect(courtPanelFromRoute('/learning', '#hanlin')).toBe('learning');
    for (const path of ['/today', '/more'])
      expect(courtPanelFromRoute(path, '#forecast')).toBeUndefined();
    // The migrated departments own their routes, so a Qintian hash there keeps
    // the department panel and is only rejected at the section level.
    expect(courtPanelFromRoute('/wealth', '#forecast')).toBe('hubu');
    expect(courtPanelFromRoute('/life', '#forecast')).toBe('life');
    expect(courtPanelSection('/wealth', '#forecast')).toBeUndefined();
    expect(courtPanelSection('/life', '#forecast')).toBeUndefined();
  });
  it('keeps hash deep links inside their own department only', () => {
    expect(courtPanelSection('/forecast', '#reviews')).toBe('reviews');
    expect(courtPanelSection('/forecast', '#triggers')).toBe('triggers');
    expect(courtPanelSection('/learning', '#hanlin')).toBe('hanlin');
    expect(courtPanelSection('/learning', '#knowledge-sources')).toBe(
      'knowledge-sources'
    );
    // The other department's sections and the /court entry never cross-open.
    expect(courtPanelSection('/forecast', '#hanlin')).toBeUndefined();
    expect(courtPanelSection('/learning', '#reviews')).toBeUndefined();
    expect(courtPanelSection('/court', '#forecast')).toBeUndefined();
    expect(courtPanelSection('/court', '#learning')).toBeUndefined();
    expect(courtPanelSection('/forecast', '')).toBeUndefined();
    expect(courtPanelSection('/forecast', '#execute')).toBeUndefined();
    expect(courtPanelSection('/learning', '#nope')).toBeUndefined();
  });
  it('does not treat the migrated pages as model or execution triggers', () => {
    for (const value of [
      { type: 'chaotang:action', action: 'forecast.run' },
      { type: 'chaotang:action', action: 'learning.run' },
      { type: 'chaotang:issue-decree', prompt: 'execute' },
    ])
      expect(courtBusinessHandoff(value, 'owner-A')).toBeUndefined();
  });
  it('opens the real wealth and life departments from their own routes and the court shell', () => {
    // /wealth shows the real treasury workspace and #hubu in the court shell
    // stays a treasury entry; /life and #life now open the local life panel.
    expect(courtPanelFromRoute('/wealth', '')).toBe('hubu');
    expect(courtPanelFromRoute('/wealth', '#hubu-overview')).toBe('hubu');
    expect(courtPanelFromRoute('/life', '')).toBe('life');
    expect(courtPanelFromRoute('/life', '#calendar')).toBe('life');
    expect(courtPanelFromRoute('/court', '#hubu')).toBe('hubu');
    expect(courtPanelFromRoute('/court', '#life')).toBe('life');
    // Other routes never leak into the two migrated departments.
    expect(courtPanelFromRoute('/today', '#hubu')).toBeUndefined();
    expect(courtPanelFromRoute('/today', '#life')).toBeUndefined();
    expect(courtPanelFromRoute('/more', '#life')).toBeUndefined();
  });
  it('resolves each wealth and life deep link inside its own department only', () => {
    for (const section of [
      'hubu-overview',
      'cash-safety',
      'accounting-reports',
      'work-products',
      'artifacts',
      'confirmations',
    ])
      expect(courtPanelSection('/wealth', '#' + section)).toBe(section);
    for (const section of [
      'life-today',
      'calendar',
      'reminders',
      'notes',
      'privacy',
    ])
      expect(courtPanelSection('/life', '#' + section)).toBe(section);
    // The two departments never cross-open each other's sections, and the
    // /court shell only opens the migrated Qintian/Hanlin content.
    expect(courtPanelSection('/wealth', '#calendar')).toBeUndefined();
    expect(courtPanelSection('/wealth', '#life-today')).toBeUndefined();
    expect(courtPanelSection('/life', '#hubu-overview')).toBeUndefined();
    expect(courtPanelSection('/life', '#artifacts')).toBeUndefined();
    expect(courtPanelSection('/wealth', '#hanlin')).toBeUndefined();
    expect(courtPanelSection('/life', '#reviews')).toBeUndefined();
    expect(courtPanelSection('/wealth', '#nope')).toBeUndefined();
    expect(courtPanelSection('/wealth', '')).toBeUndefined();
    expect(courtPanelSection('/life', '')).toBeUndefined();
    expect(courtPanelSection('/court', '#hubu')).toBeUndefined();
    expect(courtPanelSection('/court', '#life')).toBeUndefined();
  });
});
