import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'CourtWorkspace.tsx')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'controlled-court',
      setup(b) {
        b.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, (a) => ({
          path: a.path,
          namespace: 'stub',
        }));
        b.onResolve({ filter: /^@/ }, (a) => ({
          path: a.path,
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
          contents:
            path === 'react/jsx-runtime'
              ? `export const jsx=(type,props,key)=>({type,props,key}); export const jsxs=jsx;export const Fragment=Symbol();`
              : path === 'react'
                ? `export const useState=v=>globalThis.__courtHarness.state(v);export const useRef=v=>globalThis.__courtHarness.ref(v);export const useEffect=(f,d)=>globalThis.__courtHarness.effect(f,d);export const useCallback=f=>f;export const useMemo=f=>f();`
                : path.includes('ChaotangProvider')
                  ? `export const useChaotangProvider=()=>globalThis.__courtHarness.provider;export const useChaotangClient=()=>({});`
                  : path.includes('useDecreeJobs')
                    ? `export const useDecreeJobs=()=>({data:{items:[],offset:0,limit:50,total:0}});export const useSetDecreeHistoryArchived=()=>({});`
                    : path.includes('useChancellor')
                      ? `export const useChancellorConsult=()=>globalThis.__courtHarness.consult;export const useChancellorDraft=()=>globalThis.__courtHarness.draft;export const useIssueChancellorDecree=()=>globalThis.__courtHarness.issue;export const useDecreeJob=()=>({});export const useDecreeDesktopResources=()=>({});export const useLinkDecreeWorkspace=()=>({});export const useDecreeWorkspace=()=>({});export const useCancelDecreeJob=()=>({reset(){}});export const useRetryDecreeJob=()=>({reset(){}});`
                      : path.includes('chaotangFusion')
                        ? `export const decreeIdempotencyKey=async()=> 'synthetic-key';export const parseDecreeResult=()=>{};export const projectDraftAcceptance=value=>value;`
                        : `export const FilesIcon=()=>null;export const UsersThreeIcon=()=>null;export const BookOpenIcon=()=>null;`,
        }));
      },
    },
  ],
});
const { CourtWorkspace } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  return textOf(tree?.props?.children ?? '');
}
function setup() {
  const stores = new Map();
  let slots,
    cursor,
    dirty = false,
    effects = [];
  const h = {
    provider: {
      user: { id: 'owner-a', username: 'A' },
      health: { status: 'ok' },
    },
    calls: [],
    state(v) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = v;
      const active = slots;
      return [
        slots[i],
        (n) => {
          const next = typeof n === 'function' ? n(active[i]) : n;
          if (next !== active[i]) {
            active[i] = next;
            dirty = true;
          }
        },
      ];
    },
    ref(v) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: v };
      return slots[i];
    },
    effect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((d, j) => d !== slots[i][j])) {
        slots[i] = deps;
        effects.push(fn);
      }
    },
  };
  const mutation = (name) => ({
    data: undefined,
    isPending: false,
    reset() {
      this.data = undefined;
      dirty = true;
    },
    mutate(input) {
      h.calls.push([name, input]);
    },
    async mutateAsync(input) {
      h.calls.push([name, input]);
      return { jobId: 'accepted' };
    },
  });
  h.consult = mutation('consult');
  h.draft = mutation('draft');
  h.issue = mutation('issue');
  globalThis.__courtHarness = h;
  function invoke(name, fn) {
    if (!stores.has(name)) stores.set(name, []);
    slots = stores.get(name);
    cursor = 0;
    return fn();
  }
  h.render = () => {
    let result;
    for (let pass = 0; pass < 5; pass++) {
      dirty = false;
      effects = [];
      const outer = invoke('outer', () => CourtWorkspace({ onSelectJob() {} }));
      const session = nodes(outer).find(
        (n) => typeof n.type === 'function' && n.type.name === 'CourtSession'
      );
      result = invoke(session.key, () => session.type(session.props));
      for (const effect of effects) effect();
      if (!dirty) break;
    }
    return result;
  };
  h.find = (type, label) =>
    nodes(h.render()).find(
      (n) => n.type === type && (!label || textOf(n).includes(label))
    );
  h.goal = (v) => h.find('textarea').props.onChange({ target: { value: v } });
  h.button = (label) => h.find('button', label);
  h.confirm = (checked) =>
    nodes(h.render())
      .find((n) => n.type === 'input' && n.props.type === 'checkbox')
      .props.onChange({ target: { checked } });
  h.consultation = (reply) => {
    h.button('咨询丞相').props.onClick();
    h.consult.data = { reply };
    h.render();
  };
  h.ready = () => {
    h.draft.data = {
      status: 'DRAFT_READY',
      decreeText: '已拟旨',
      version: 1,
      fingerprint: 'fp',
      understanding: 'understanding',
      draft: { departments: [], materialGaps: [], permissionsAndLimits: [] },
    };
    h.render();
  };
  return h;
}
test('actual court events send the confirmed restatement with the original goal', () => {
  const h = setup();
  try {
    h.goal('原始目标');
    h.consultation('仅拟草案，不执行付款');
    h.confirm(true);
    h.button('形成拟旨').props.onClick();
    assert.deepEqual(
      h.calls.filter((c) => c[0] === 'draft'),
      [
        [
          'draft',
          {
            messages: [
              {
                role: 'user',
                content:
                  '[用户原始目标]\n原始目标\n\n[用户已确认的丞相理解]\n仅拟草案，不执行付款',
              },
            ],
            version: 1,
          },
        ],
      ]
    );
  } finally {
    delete globalThis.__courtHarness;
  }
});
test('refused or overlong confirmation does not call draft even if a stale click is delivered', () => {
  const h = setup();
  try {
    h.goal('目标');
    h.consultation('理解');
    h.confirm(false);
    h.button('形成拟旨').props.onClick();
    h.consult.data = { reply: '长'.repeat(4000) };
    h.render();
    h.confirm(true);
    h.button('形成拟旨').props.onClick();
    assert.equal(h.calls.filter((c) => c[0] === 'draft').length, 0);
  } finally {
    delete globalThis.__courtHarness;
  }
});
test('goal or confirmed-content changes clear old draft and formal approval', () => {
  const h = setup();
  try {
    h.goal('目标');
    h.consultation('理解');
    h.confirm(true);
    h.button('形成拟旨').props.onClick();
    h.ready();
    nodes(h.render())
      .filter((n) => n.type === 'input' && n.props.type === 'checkbox')
      .at(-1)
      .props.onChange({ target: { checked: true } });
    assert.equal(h.button('确认并正式下旨').props.disabled, false);
    h.consult.data = { reply: '新理解' };
    h.render();
    assert.equal(h.draft.data, undefined);
    assert.equal(h.button('确认并正式下旨'), undefined);
    h.confirm(true);
    h.button('形成拟旨').props.onClick();
    h.ready();
    h.goal('新目标');
    h.render();
    assert.equal(h.draft.data, undefined);
    assert.equal(h.button('确认并正式下旨'), undefined);
    assert.equal(h.calls.filter((c) => c[0] === 'issue').length, 0);
  } finally {
    delete globalThis.__courtHarness;
  }
});

test('revoking understanding removes the prepared draft; a new draft needs independent approval', () => {
  const h = setup();
  try {
    h.goal('目标');
    h.consultation('理解');
    h.confirm(true);
    h.button('形成拟旨').props.onClick();
    h.ready();
    assert.equal(h.button('确认并正式下旨').props.disabled, true);
    h.confirm(false);
    h.render();
    assert.equal(h.draft.data, undefined);
    assert.equal(h.button('确认并正式下旨'), undefined);
    h.confirm(true);
    h.button('形成拟旨').props.onClick();
    h.ready();
    assert.equal(h.button('确认并正式下旨').props.disabled, true);
  } finally {
    delete globalThis.__courtHarness;
  }
});

test('an oversized goal never calls consultation', () => {
  const h = setup();
  try {
    h.goal('字'.repeat(4001));
    h.button('咨询丞相').props.onClick();
    assert.equal(h.calls.length, 0);
  } finally {
    delete globalThis.__courtHarness;
  }
});

test('changing goal while issue key is pending invalidates the captured approval before sending', async () => {
  const h = setup();
  try {
    h.goal('目标');
    h.consultation('理解');
    h.confirm(true);
    h.button('形成拟旨').props.onClick();
    h.ready();
    nodes(h.render())
      .filter((n) => n.type === 'input' && n.props.type === 'checkbox')
      .at(-1)
      .props.onChange({ target: { checked: true } });
    h.button('确认并正式下旨').props.onClick();
    h.goal('新目标');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.calls.filter((c) => c[0] === 'issue').length, 0);
  } finally {
    delete globalThis.__courtHarness;
  }
});
