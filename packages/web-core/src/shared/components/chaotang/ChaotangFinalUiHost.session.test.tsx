import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the real host handlers with controlled hooks and deferred clients.
// This verifies async account boundaries, not browser rendering or native IPC.
const h = vi.hoisted(() => ({
  cursor: 0,
  bridgeNonce: '',
  slots: [] as any[],
  effects: [] as Array<() => void>,
  listeners: new Set<(event: any) => void>(),
  user: { id: 'owner-A' } as { id: string } | null,
  authGeneration: 1,
  frame: { postMessage: vi.fn() },
  port: {
    postMessage: vi.fn(),
    close: vi.fn(),
    onmessage: undefined as ((event: any) => void) | undefined,
  },
  handshaken: false,
  client: { junjichuCases: vi.fn(), chancellorConsult: vi.fn() },
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef(value: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: value };
    return h.slots[i];
  },
  useState(value: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots))
      h.slots[i] = typeof value === 'function' ? value() : value;
    return [
      h.slots[i],
      (next: unknown) => {
        h.slots[i] = typeof next === 'function' ? next(h.slots[i]) : next;
      },
    ];
  },
  useEffect(effect: () => (() => void) | void, deps?: unknown[]) {
    const i = h.cursor++;
    const old = h.slots[i];
    if (old && deps?.every((dep, n) => Object.is(dep, old.deps?.[n]))) return;
    h.effects.push(() => {
      old?.cleanup?.();
      h.slots[i] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/today', hash: '' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/shared/providers/ChaotangProvider', () => ({
  useChaotangClient: () => h.client,
  useChaotangProvider: () => ({
    user: h.user,
    health: null,
    authGeneration: h.authGeneration,
  }),
}));
vi.mock('./ChancellorStudyWorkspace', () => ({
  ChancellorStudyWorkspace: () => null,
}));
vi.mock('./JunjichuCasesWorkspace', () => ({
  JunjichuCasesWorkspace: () => null,
}));
vi.mock('./ChaotangAccountForm', () => ({ ChaotangAccountForm: () => null }));
vi.mock('./ModelProvidersWorkspace', () => ({
  ModelProvidersWorkspace: () => null,
}));
vi.mock('./SkillsWorkspace', () => ({ SkillsWorkspace: () => null }));
vi.mock('./McpWorkspace', () => ({ McpWorkspace: () => null }));

import { ChaotangFinalUiHost } from './ChaotangFinalUiHost';
import { ChancellorStudyWorkspace } from './ChancellorStudyWorkspace';
import { HubuOperationsWorkspace } from './HubuOperationsWorkspace';
import { JinyiweiWorkspace } from './JinyiweiWorkspace';
import { ShiguanOperationsWorkspace } from './ShiguanOperationsWorkspace';
import { OutcomeCatalogWorkspace } from './OutcomeCatalogWorkspace';
import {
  GongbuTaskWorkspace,
  JunjichuOperationsWorkspace,
} from './CourtOperationsWorkspace';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function render(handshake = true) {
  h.cursor = 0;
  const tree = ChaotangFinalUiHost();
  const frame = tree.props.children.find(
    (child: any) => child?.type === 'iframe'
  );
  frame.ref.current = { contentWindow: h.frame };
  h.bridgeNonce =
    new URL(frame.props.src, 'https://isolated.invalid').searchParams.get(
      'bridgeNonce'
    ) || '';
  for (const effect of h.effects.splice(0)) effect();
  if (handshake && !h.handshaken) {
    h.handshaken = true;
    for (const listener of h.listeners)
      listener({
        source: h.frame,
        origin: 'null',
        data: { type: 'chaotang:bridge-ready', bridgeNonce: h.bridgeNonce },
        ports: [h.port],
      });
    h.port.postMessage.mockClear();
  }
  return tree;
}

function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !node.props) return [];
  return [node, ...elements(node.props.children)];
}

function sendHandoff(prompt: string) {
  for (const listener of h.listeners)
    listener({
      source: h.frame,
      origin: 'null',
      data: {
        bridgeNonce: h.bridgeNonce,
        type: 'chaotang:prepare-decree',
        prompt,
      },
    });
}

const resumeButton = (tree: any) =>
  elements(tree).find(
    (node) => node.type === 'button' && node.props.children === '带入上书房'
  );

describe('real department panel handoff', () => {
  it('keeps the selected iframe document when the router removes the UI query', () => {
    window.location.search = '?chaotangUi=legacy';
    const first = elements(render()).find((node) => node.type === 'iframe');
    expect(first.props.src).toContain('/chaotang-final/index.html');
    window.location.search = '';
    const next = elements(render()).find((node) => node.type === 'iframe');
    expect(next.props.src).toBe(first.props.src);
  });
  it('rejects missing or wrong document nonce even from the same opaque iframe', () => {
    render();
    for (const bridgeNonce of [undefined, 'wrong-document']) {
      for (const receive of h.listeners)
        receive({
          source: h.frame,
          origin: 'null',
          data: { type: 'chaotang:action', action: 'hubu', bridgeNonce },
        });
      expect(
        elements(render()).some((node) => node.type === HubuOperationsWorkspace)
      ).toBe(false);
    }
  });
  it('requires both the exact iframe and the sandbox origin', () => {
    render();
    for (const event of [
      { source: {}, origin: 'null' },
      { source: h.frame, origin: 'https://isolated.invalid' },
      { source: h.frame, origin: 'https://foreign.invalid' },
    ]) {
      for (const receive of h.listeners)
        receive({
          ...event,
          data: {
            bridgeNonce: h.bridgeNonce,
            type: 'chaotang:action',
            action: 'hubu',
          },
        });
      expect(
        elements(render()).some((node) => node.type === HubuOperationsWorkspace)
      ).toBe(false);
    }
    const tree = render();
    const frame = elements(tree).find((node) => node.type === 'iframe');
    expect(frame.props.sandbox).toBe('allow-scripts allow-downloads');
  });
  it('turns archive reuse into an editable study request without starting execution', () => {
    render();
    for (const receive of h.listeners)
      receive({
        origin: 'null',
        source: h.frame,
        data: {
          bridgeNonce: h.bridgeNonce,
          type: 'chaotang:action',
          action: 'shiguan',
        },
      });
    elements(render())
      .find((node) => node.type === ShiguanOperationsWorkspace)
      .props.onReuse('原始调研需求');
    const study = elements(render()).find(
      (node) => node.type === ChancellorStudyWorkspace
    );
    expect(study.props.initialObjective).toBe('原始调研需求');
    expect(h.client.chancellorConsult).not.toHaveBeenCalled();
    expect(h.client.junjichuCases).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'catalog prepares editable input with authenticated=%s and never executes',
    (authenticated) => {
      if (!authenticated) h.user = null;
      render();
      for (const receive of h.listeners)
        receive({
          origin: 'null',
          source: h.frame,
          data: {
            bridgeNonce: h.bridgeNonce,
            type: 'chaotang:action',
            action: 'results',
          },
        });
      const catalog = elements(render()).find(
        (node) => node.type === OutcomeCatalogWorkspace
      );
      catalog.props.onPrepare('核实开源许可证');
      if (!authenticated) {
        expect(resumeButton(render())).toBeUndefined();
        h.user = { id: 'owner-A' };
        h.authGeneration++;
        render();
        resumeButton(render()).props.onClick();
      }
      const study = elements(render()).find(
        (node) => node.type === ChancellorStudyWorkspace
      );
      expect(study.props.initialObjective).toBe('核实开源许可证');
      expect(h.client.chancellorConsult).not.toHaveBeenCalled();
      expect(h.client.junjichuCases).not.toHaveBeenCalled();
    }
  );
  it('routes the original shell to existing business components without calling a model', () => {
    render();
    for (const [action, component] of [
      ['hubu', HubuOperationsWorkspace],
      ['jinyiwei', JinyiweiWorkspace],
      ['shiguan', ShiguanOperationsWorkspace],
      ['gongbu', GongbuTaskWorkspace],
      ['cases', JunjichuOperationsWorkspace],
    ]) {
      for (const receive of h.listeners)
        receive({
          origin: 'null',
          source: h.frame,
          data: { bridgeNonce: h.bridgeNonce, type: 'chaotang:action', action },
        });
      expect(elements(render()).some((node) => node.type === component)).toBe(
        true
      );
    }
    expect(h.client.chancellorConsult).not.toHaveBeenCalled();
  });
  it('remounts the engineering task selection when the authenticated session changes', () => {
    render();
    for (const receive of h.listeners)
      receive({
        origin: 'null',
        source: h.frame,
        data: {
          bridgeNonce: h.bridgeNonce,
          type: 'chaotang:action',
          action: 'gongbu',
        },
      });
    const before = elements(render()).find(
      (node) => node.type === GongbuTaskWorkspace
    );
    h.authGeneration++;
    const after = elements(render()).find(
      (node) => node.type === GongbuTaskWorkspace
    );
    expect(before.key).not.toBe(after.key);
  });
});

describe('anonymous result-case handoff', () => {
  it('retains input through login and transfers it only after explicit confirmation', () => {
    h.user = null;
    render();
    sendHandoff('调研一个开源项目');
    expect(resumeButton(render())).toBeUndefined();
    h.user = { id: 'owner-A' };
    h.authGeneration++;
    render();
    const account = render();
    expect(resumeButton(account)).toBeDefined();
    expect(
      elements(account).some((node) => node.type === ChancellorStudyWorkspace)
    ).toBe(false);
    resumeButton(account).props.onClick();
    const study = elements(render()).find(
      (node) => node.type === ChancellorStudyWorkspace
    );
    expect(study.props.initialObjective).toBe('调研一个开源项目');
    expect(h.client.chancellorConsult).not.toHaveBeenCalled();
    expect(h.client.junjichuCases).not.toHaveBeenCalled();
    expect(resumeButton(render())).toBeUndefined();
  });

  it('forgets pending input when the account panel is closed', () => {
    h.user = null;
    render();
    sendHandoff('不要保留');
    const close = elements(render()).find(
      (node) => node.props['aria-label'] === '关闭'
    );
    close.props.onClick();
    h.user = { id: 'owner-A' };
    render();
    expect(resumeButton(render())).toBeUndefined();
  });

  it('does not offer one account pending input after switching accounts', () => {
    h.user = null;
    render();
    sendHandoff('仅供初次登录用户确认');
    h.user = { id: 'owner-A' };
    render();
    const oldButton = resumeButton(render());
    expect(oldButton).toBeDefined();
    h.user = { id: 'owner-B' };
    h.authGeneration++;
    render();
    oldButton.props.onClick();
    const tree = render();
    expect(resumeButton(tree)).toBeUndefined();
    expect(
      elements(tree).some((node) => node.type === ChancellorStudyWorkspace)
    ).toBe(false);
  });

  it('allows discarding the draft without logging out or issuing a task', () => {
    h.user = null;
    render();
    sendHandoff('稍后再办');
    const discard = elements(render()).find(
      (node) => node.type === 'button' && node.props.children === '放弃这次需求'
    );
    expect(discard).toBeDefined();
    discard.props.onClick();
    h.user = { id: 'owner-A' };
    render();
    expect(resumeButton(render())).toBeUndefined();
    expect(h.client.chancellorConsult).not.toHaveBeenCalled();
  });
});
function consult(page = 'A03') {
  for (const listener of h.listeners)
    listener({
      source: h.frame,
      origin: 'null',
      data: {
        bridgeNonce: h.bridgeNonce,
        type: 'chaotang:consult',
        page,
        prompt: 'synthetic question',
        requestId: 'old-request',
      },
    });
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const messages = () =>
  h.port.postMessage.mock.calls.map(([message]) => message);

beforeEach(() => {
  h.slots = [];
  h.effects = [];
  h.listeners.clear();
  h.cursor = 0;
  h.user = { id: 'owner-A' };
  h.authGeneration = 1;
  h.frame.postMessage.mockReset();
  h.port.postMessage.mockReset();
  h.port.close.mockReset();
  h.port.onmessage = undefined;
  h.handshaken = false;
  vi.stubGlobal('localStorage', { getItem: () => null });
  h.client.junjichuCases.mockReset().mockResolvedValue([]);
  h.client.chancellorConsult
    .mockReset()
    .mockResolvedValue({ reply: 'synthetic reply', consultant: 'fixture' });
  vi.stubGlobal('window', {
    location: {
      origin: 'https://isolated.invalid',
      search: '',
      pathname: '/today',
    },
    setTimeout,
    clearTimeout,
    addEventListener: (_type: string, fn: any) => h.listeners.add(fn),
    removeEventListener: (_type: string, fn: any) => h.listeners.delete(fn),
  });
});
afterEach(() => {
  for (const slot of h.slots) slot?.cleanup?.();
  vi.unstubAllGlobals();
});

describe('original shell asynchronous consultation account boundary', () => {
  it('blocks an early navigation even before the first iframe load event', async () => {
    render();
    h.port.onmessage?.({ data: { type: 'chaotang:bridge-closed' } });
    h.port.postMessage.mockClear();
    consult('A01');
    await settle();
    expect(h.port.close).toHaveBeenCalledTimes(1);
    expect(h.client.chancellorConsult).not.toHaveBeenCalled();
    expect(h.port.postMessage).not.toHaveBeenCalled();
    expect(
      elements(render()).some((node) => node.props.children === '重新打开朝堂')
    ).toBe(true);
  });
  it('does not send web output through the reusable window before or after handshake', async () => {
    render(false);
    consult('A01');
    await settle();
    expect(h.port.postMessage).not.toHaveBeenCalled();
    expect(h.frame.postMessage).not.toHaveBeenCalled();
    render();
    consult('A01');
    await settle();
    expect(messages()).toContainEqual(
      expect.objectContaining({ type: 'chaotang:reply' })
    );
    expect(h.frame.postMessage).not.toHaveBeenCalled();
  });
  it('rejects forged channel offers and cannot replace the accepted document channel', () => {
    render(false);
    const foreign = { postMessage: vi.fn(), close: vi.fn() };
    for (const override of [
      { source: {} },
      { origin: 'https://foreign.invalid' },
      { data: { type: 'chaotang:bridge-ready', bridgeNonce: 'wrong' } },
      { ports: [] },
    ]) {
      for (const receive of h.listeners)
        receive({
          source: h.frame,
          origin: 'null',
          data: { type: 'chaotang:bridge-ready', bridgeNonce: h.bridgeNonce },
          ports: [foreign],
          ...override,
        });
    }
    expect(foreign.postMessage).not.toHaveBeenCalled();
    render();
    for (const receive of h.listeners)
      receive({
        source: h.frame,
        origin: 'null',
        data: { type: 'chaotang:bridge-ready', bridgeNonce: h.bridgeNonce },
        ports: [foreign],
      });
    expect(foreign.close).toHaveBeenCalledTimes(1);
    expect(foreign.postMessage).not.toHaveBeenCalled();
    expect(h.port.close).not.toHaveBeenCalled();
  });
  it('revokes the channel on navigation before delayed frames or replies can send', async () => {
    const callbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return 1;
    };
    const pending = deferred<any>();
    h.client.chancellorConsult.mockReturnValue(pending.promise);
    const frame = elements(render()).find((node) => node.type === 'iframe');
    frame.props.onLoad();
    consult('A01');
    await settle();
    frame.props.onLoad();
    h.port.postMessage.mockClear();
    for (const callback of callbacks) callback(0);
    pending.resolve({ reply: 'old document reply' });
    await settle();
    expect(h.port.close).toHaveBeenCalledTimes(1);
    expect(h.port.postMessage).not.toHaveBeenCalled();
    expect(h.frame.postMessage).not.toHaveBeenCalled();
  });
  it('keeps a current-session failure visible for recovery', async () => {
    h.client.chancellorConsult.mockRejectedValue(
      new Error('synthetic failure')
    );
    render();
    consult('A01');
    await settle();
    expect(messages()).toContainEqual(
      expect.objectContaining({
        type: 'chaotang:error',
        message: 'synthetic failure',
      })
    );
  });
  it('delivers a reply while the original session is still current', async () => {
    render();
    consult();
    await settle();
    expect(h.client.chancellorConsult).toHaveBeenCalledTimes(1);
    expect(messages()).toContainEqual(
      expect.objectContaining({
        type: 'chaotang:reply',
        reply: 'synthetic reply',
      })
    );
  });
  it('does not start consultation after account changes while case context is pending', async () => {
    const pending = deferred<any[]>();
    h.client.junjichuCases.mockReturnValue(pending.promise);
    render();
    consult();
    h.user = { id: 'owner-B' };
    h.authGeneration++;
    render();
    pending.resolve([]);
    await settle();
    expect(h.client.chancellorConsult).not.toHaveBeenCalled();
    expect(
      messages().filter((m) =>
        ['chaotang:reply', 'chaotang:error'].includes(m.type)
      )
    ).toEqual([]);
  });
  it('does not return an old-session reply after logout and login as the same account', async () => {
    const pending = deferred<any>();
    h.client.chancellorConsult.mockReturnValue(pending.promise);
    render();
    consult('A01');
    h.user = null;
    h.authGeneration++;
    render();
    h.user = { id: 'owner-A' };
    h.authGeneration++;
    render();
    pending.resolve({ reply: 'old private reply' });
    await settle();
    expect(messages().filter((m) => m.type === 'chaotang:reply')).toEqual([]);
  });
  it('does not return an old-session error to a new account', async () => {
    const pending = deferred<any>();
    h.client.chancellorConsult.mockReturnValue(pending.promise);
    render();
    consult('A01');
    h.user = { id: 'owner-B' };
    h.authGeneration++;
    render();
    pending.reject(new Error('old private failure'));
    await settle();
    expect(messages().filter((m) => m.type === 'chaotang:error')).toEqual([]);
  });
  it('does not proceed from a context read after the host unmounts', async () => {
    const pending = deferred<any[]>();
    h.client.junjichuCases.mockReturnValue(pending.promise);
    render();
    consult();
    for (const slot of h.slots) slot?.cleanup?.();
    pending.resolve([]);
    await settle();
    expect(h.client.chancellorConsult).not.toHaveBeenCalled();
    expect(messages().filter((m) => m.type === 'chaotang:reply')).toEqual([]);
  });
});
