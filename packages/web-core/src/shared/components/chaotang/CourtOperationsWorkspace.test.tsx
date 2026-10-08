import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  view: 'tasks',
  owner: 'owner-A',
  generation: 1,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [
    h.view,
    (value: string) => {
      h.view = value;
    },
  ],
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({
    user: { id: h.owner },
    authGeneration: h.generation,
  }),
}));
vi.mock('./CourtWorkspace', () => ({ CourtWorkspace: () => null }));
vi.mock('./JunjichuCasesWorkspace', () => ({
  JunjichuCasesWorkspace: () => null,
}));
import {
  JunjichuOperationsWorkspace,
  GongbuTaskWorkspace,
} from './CourtOperationsWorkspace';
import { JunjichuCasesWorkspace } from './JunjichuCasesWorkspace';

beforeEach(() => {
  h.view = 'tasks';
  h.owner = 'owner-A';
  h.generation = 1;
});
describe('council and engineering share the existing task ledger', () => {
  it('shows tasks first and allows returning from real council records', () => {
    const tasks = JunjichuOperationsWorkspace();
    const buttons = tasks.props.children[0].props.children;
    expect(buttons[0].props['aria-pressed']).toBe(true);
    expect(tasks.props.children[2].type).not.toBe(JunjichuCasesWorkspace);
    buttons[1].props.onClick();
    const council = JunjichuOperationsWorkspace();
    expect(council.props.children[2].type).toBe(JunjichuCasesWorkspace);
    expect(
      council.props.children[0].props.children[1].props['aria-pressed']
    ).toBe(true);
    council.props.children[0].props.children[0].props.onClick();
    expect(JunjichuOperationsWorkspace().props.children[2].type).toBe(
      tasks.props.children[2].type
    );
  });
  it('engineering and council use the same task component with session-scoped selection', () => {
    const engineering = GongbuTaskWorkspace().props.children[1];
    const council = JunjichuOperationsWorkspace().props.children[2];
    expect(engineering.type).toBe(council.type);
    expect(engineering.key).toBe('owner-A:1');
    h.owner = 'owner-B';
    expect(GongbuTaskWorkspace().props.children[1].key).toBe('owner-B:1');
    h.generation++;
    expect(JunjichuOperationsWorkspace().props.children[2].key).toBe(
      'owner-B:2'
    );
  });
  it('engineering folds its task history and resources into the paper scroll like the council', () => {
    const engineering = GongbuTaskWorkspace().props.children[1];
    const council = JunjichuOperationsWorkspace().props.children[2];
    expect(engineering.props.scrollPresentation).toBe(true);
    // The council keeps the scroll presentation it already had: no regression.
    expect(council.props.scrollPresentation).toBe(true);
  });
});
