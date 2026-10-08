import { beforeEach, expect, it, vi } from 'vitest';
import type { DecreeDesktopResources } from '@/shared/providers/ChaotangProvider';

const h = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as Array<() => void>,
  user: { id: 'owner-a' } as { id: string } | null,
  generation: 1,
  list: vi.fn(),
  read: vi.fn(),
  importFile: vi.fn(),
  client: {} as any,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useRef(value: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: value };
    return h.slots[i];
  },
  useState(value: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = value;
    return [
      h.slots[i],
      (next: any) => {
        h.slots[i] = typeof next === 'function' ? next(h.slots[i]) : next;
      },
    ];
  },
  useMemo(value: () => unknown) {
    h.cursor++;
    return value();
  },
  useCallback(value: unknown) {
    h.cursor++;
    return value;
  },
  useEffect(effect: () => (() => void) | void, deps: unknown[]) {
    const i = h.cursor++,
      old = h.slots[i];
    // Callback identity is ignored by this harness; the client remains stable.
    if (
      old &&
      deps.every((v, n) => typeof v === 'function' || Object.is(v, old.deps[n]))
    )
      return;
    h.effects.push(() => {
      old?.cleanup?.();
      h.slots[i] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangClient: () => h.client,
  useChaotangProvider: () => ({ user: h.user, authGeneration: h.generation }),
}));
vi.mock('@/shared/hooks/chaotang/useChancellor', () => ({
  useDecreeWorkspace: () => ({ data: { artifacts: [] }, dataUpdatedAt: 1 }),
}));
import { TaskFilesPanel } from './TaskFilesPanel';

const resources = {
  jobId: 'job-a',
  workspace: { id: 'workspace-a' },
  binding: { bindingId: 'binding-a' },
  previewAvailable: true,
} as DecreeDesktopResources;
const entry = (relativePath: string, kind = 'file') => ({
  relativePath,
  name: relativePath.split('/').at(-1)!,
  kind,
  bytes: kind === 'file' ? 9 : null,
  modifiedAt: null,
});
const receipt = (relativePath = 'report.html') => ({
  jobId: 'job-a',
  workspaceId: 'workspace-a',
  entry: entry(relativePath),
  kind: 'text',
  sha256: 'a'.repeat(64),
  text: 'PRIVATE_A',
  encoding: 'utf-8',
  truncated: false,
});
function render(connected = true, value = resources, effects = true) {
  h.cursor = 0;
  const tree = TaskFilesPanel({ connected, resources: value });
  if (effects) h.effects.splice(0).forEach((effect) => effect());
  return tree.props;
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.user = { id: 'owner-a' };
  h.generation = 1;
  h.list.mockReset().mockImplementation(async (input) => ({
    jobId: input.jobId,
    workspaceId: 'workspace-a',
    relativePath: input.relativePath,
    entries: [],
    truncated: false,
  }));
  h.read.mockReset().mockResolvedValue(receipt());
  h.importFile.mockReset();
  h.client = {
    listTaskFiles: h.list,
    readTaskFile: h.read,
    importTaskArtifact: h.importFile,
  };
});

it('does not automatically list files while disconnected', async () => {
  render(false);
  await flush();
  expect(h.list).not.toHaveBeenCalled();
});
it('directory navigation discards a late preview from the previous directory', async () => {
  const pending = deferred();
  h.read.mockReturnValueOnce(pending.promise);
  render();
  await flush();
  render().onOpenFile(entry('report.html'));
  render().onOpenDirectory(entry('next', 'directory'));
  await flush();
  pending.resolve(receipt());
  await flush();
  expect(render().path).toBe('next');
  expect(render().preview).toBeUndefined();
});
it.each(['account', 'session', 'job', 'binding', 'disconnect'])(
  'hides loaded data immediately on %s change, before effect cleanup',
  async (change) => {
    render();
    await flush();
    render().onOpenFile(entry('report.html'));
    await flush();
    expect(render().preview?.text).toBe('PRIVATE_A');
    let next = resources;
    if (change === 'account') h.user = { id: 'owner-b' };
    if (change === 'session') h.generation++;
    if (change === 'job') next = { ...resources, jobId: 'job-b' };
    if (change === 'binding')
      next = {
        ...resources,
        binding: { ...resources.binding, bindingId: 'binding-b' },
      };
    const view = render(change !== 'disconnect', next, false);
    expect(view.preview).toBeUndefined();
    expect(view.entries).toEqual([]);
    const calls = h.read.mock.calls.length;
    view.onOpenFile(entry('report.html'));
    await flush();
    expect(h.read).toHaveBeenCalledTimes(calls);
  }
);
it('a late response cannot restore a preview after unmount', async () => {
  const pending = deferred();
  h.read.mockReturnValueOnce(pending.promise);
  render();
  await flush();
  render().onOpenFile(entry('report.html'));
  h.slots.forEach((slot) => slot?.cleanup?.());
  pending.resolve(receipt());
  await flush();
  expect(render(true, resources, false).preview).toBeUndefined();
});

it('retry stays in the directory whose read failed', async () => {
  render();
  await flush();
  h.list.mockRejectedValueOnce(new Error('synthetic transient failure'));
  render().onOpenDirectory(entry('reports', 'directory'));
  await flush();
  expect(render().problem).toBeDefined();
  render().onReload();
  await flush();
  expect(h.list).toHaveBeenLastCalledWith({
    jobId: 'job-a',
    relativePath: 'reports',
  });
});

it('an import finishing after navigation refreshes the current directory', async () => {
  const pending = deferred();
  h.importFile.mockReturnValueOnce(pending.promise);
  render();
  await flush();
  render().onTargetChange('artifact-a', 'report.html');
  render().onImport({
    id: 'artifact-a',
    state: 'PUBLISHED',
    displayName: 'report.html',
  });
  render().onOpenDirectory(entry('next', 'directory'));
  await flush();
  pending.resolve({
    status: 'imported',
    jobId: 'job-a',
    workspaceId: 'workspace-a',
    entry: entry('report.html'),
    sha256: 'a'.repeat(64),
    source: { artifactId: 'artifact-a', sha256: 'a'.repeat(64), version: 1 },
  });
  await flush();
  expect(render().imports['artifact-a'].result.status).toBe('imported');
  expect(h.list).toHaveBeenLastCalledWith({
    jobId: 'job-a',
    relativePath: 'next',
  });
});

it('reconnection preserves a same-session import destination, but a new session clears it', async () => {
  render();
  await flush();
  render().onTargetChange('artifact-a', 'custom/report.html');
  render(false);
  render(true);
  await flush();
  expect(render().targets['artifact-a']).toBe('custom/report.html');
  h.generation++;
  render();
  await flush();
  expect(render().targets['artifact-a']).toBeUndefined();
});
