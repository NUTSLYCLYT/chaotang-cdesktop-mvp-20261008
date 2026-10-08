import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as Array<() => void>,
  user: { id: 'owner-a' } as { id: string } | null,
  generation: 1,
  download: vi.fn(),
  click: vi.fn(),
  remove: vi.fn(),
  append: vi.fn(),
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
    return [h.slots[i], (next: unknown) => (h.slots[i] = next)];
  },
  useEffect(effect: () => (() => void) | void, deps: unknown[]) {
    const i = h.cursor++;
    const old = h.slots[i];
    if (old && deps.every((v, n) => Object.is(v, old.deps[n]))) return;
    h.effects.push(() => {
      old?.cleanup?.();
      h.slots[i] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock('@/shared/hooks/chaotang/useHubu', () => ({
  useHubuArtifactDownload: () => ({ mutateAsync: h.download }),
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangProvider: () => ({
    user: h.user,
    authGeneration: h.generation,
  }),
}));
import { HubuArtifactDownloadButton } from './HubuArtifactDownloadButton';

const file = {
  bytes: [80, 75, 3, 4],
  fileName: '现金分析.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
function render(published = true) {
  h.cursor = 0;
  const tree = HubuArtifactDownloadButton({
    artifactId: 'artifact-a',
    published,
  });
  h.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function button(tree = render()) {
  return tree.props.children[0];
}
function messages(tree = render()) {
  return tree.props.children
    .filter(Boolean)
    .map((node: ReactElement<any>) => node.props.children)
    .flat()
    .filter((value: unknown) => typeof value === 'string')
    .join('');
}
function deferred() {
  let resolve!: (value: typeof file) => void;
  const promise = new Promise<typeof file>((done) => (resolve = done));
  h.download.mockReturnValueOnce(promise);
  return resolve;
}
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.user = { id: 'owner-a' };
  h.generation = 1;
  [h.download, h.click, h.remove, h.append].forEach((mock) => mock.mockReset());
  h.download.mockResolvedValue(file);
  vi.stubGlobal('document', {
    createElement: () => ({ click: h.click, remove: h.remove }),
    body: { appendChild: h.append },
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-only');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('hands the returned filename to the browser and reports handoff, not disk save', async () => {
  await button().props.onClick();
  expect(h.download).toHaveBeenCalledWith('artifact-a');
  expect(h.append.mock.calls[0][0].download).toBe(file.fileName);
  expect(h.click).toHaveBeenCalledOnce();
  expect(h.remove).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-only');
  expect(messages()).toContain('已交给浏览器下载');
  expect(messages()).not.toContain('保存成功');
});

it('handles a failed request and allows a new explicit retry', async () => {
  h.download.mockRejectedValueOnce(new Error('synthetic provider failure'));
  await expect(button().props.onClick()).resolves.toBeUndefined();
  expect(h.click).not.toHaveBeenCalled();
  expect(messages()).toContain('下载未完成');
  await button().props.onClick();
  expect(h.download).toHaveBeenCalledTimes(2);
  expect(messages()).toContain('已交给浏览器下载');
});

it('prevents duplicate requests while showing progress', async () => {
  const finish = deferred();
  const control = button();
  const pending = control.props.onClick();
  await control.props.onClick();
  expect(h.download).toHaveBeenCalledOnce();
  expect(button().props.disabled).toBe(true);
  expect(button().props['aria-busy']).toBe(true);
  finish(file);
  await pending;
});

it.each(['account', 'logout', 'same-account-new-session', 'unmount'])(
  'does not hand off a late file after %s',
  async (change) => {
    const finish = deferred();
    const pending = button().props.onClick();
    if (change === 'unmount') {
      h.slots.forEach((slot) => slot?.cleanup?.());
    } else {
      if (change === 'account') h.user = { id: 'owner-b' };
      if (change === 'logout') h.user = null;
      h.generation += 1;
      render();
    }
    finish(file);
    await pending;
    expect(h.click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  }
);

it('does not request an unpublished artifact', async () => {
  const control = button(render(false));
  expect(control.props.disabled).toBe(true);
  await control.props.onClick();
  expect(h.download).not.toHaveBeenCalled();
});

it('cleans up a created URL when browser handoff throws', async () => {
  h.click.mockImplementationOnce(() => {
    throw new Error('synthetic browser failure');
  });
  await expect(button().props.onClick()).resolves.toBeUndefined();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-only');
  expect(h.remove).toHaveBeenCalledOnce();
  expect(messages()).toContain('下载未完成');
});
