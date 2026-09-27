import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Use Vite's already installed compiler; no browser, network or model is involved.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))(
  'esbuild'
);
const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'ChancellorStudyWorkspace.tsx')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'controlled-study',
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(?:react(?:\/jsx-runtime)?|@.*|\.\/ChaotangPrimitives|\.\/StudyTaskProgress)$/,
          },
          (a) => ({ path: a.path, namespace: 'controlled' })
        );
        b.onLoad({ filter: /.*/, namespace: 'controlled' }, ({ path }) => ({
          contents:
            path === 'react/jsx-runtime'
              ? 'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;'
              : path === 'react'
                ? 'export const useState=v=>globalThis.__studyHarness.state(v);export const useRef=v=>globalThis.__studyHarness.ref(v);export const useEffect=(f,d)=>globalThis.__studyHarness.effect(f,d);'
                : path.includes('ChaotangProvider')
                  ? 'export const useChaotangProvider=()=>globalThis.__studyHarness.provider;'
                  : path.includes('useChancellor')
                    ? 'export const useChancellorConsult=()=>globalThis.__studyHarness.consult;export const useChancellorDraft=()=>globalThis.__studyHarness.draft;export const useIssueChancellorDecree=()=>globalThis.__studyHarness.issue;export const useDecreeJob=()=>({});export const useCancelDecreeJob=()=>({reset(){}});'
                    : path.includes('chaotangFusion')
                      ? 'export const decreeIdempotencyKey=async()=>"test-owner-draft-key";'
                      : path.includes('ChaotangPrimitives')
                        ? 'export const ChaotangButton="button";export const ChaotangPanel="section";'
                        : path.includes('StudyTaskProgress')
                          ? 'export const StudyTaskProgress="task-progress";'
                          : 'export const CheckCircleIcon="icon";export const ChatCircleTextIcon="icon";export const PaperPlaneTiltIcon="icon";export const ScrollIcon="icon";',
        }));
      },
    },
  ],
});
const { ChancellorStudyWorkspace } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'sessionStorage'
);
afterEach(() => {
  delete globalThis.__studyHarness;
  if (originalStorage)
    Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
  else delete globalThis.sessionStorage;
});

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
      health: {},
      authGeneration: 1,
    },
    calls: [],
    state(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      const active = slots;
      return [
        active[i],
        (next) => {
          const value = typeof next === 'function' ? next(active[i]) : next;
          if (active[i] !== value) {
            active[i] = value;
            dirty = true;
          }
        },
      ];
    },
    ref(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: value };
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
  globalThis.__studyHarness = h;
  const values = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });
  h.render = () => {
    let result;
    for (let pass = 0; pass < 8; pass++) {
      dirty = false;
      effects = [];
      const session = ChancellorStudyWorkspace();
      if (!stores.has(session.key)) stores.set(session.key, []);
      slots = stores.get(session.key);
      cursor = 0;
      result = session.type(session.props);
      for (const effect of effects) effect();
      if (!dirty) return result;
    }
    throw new Error('component did not settle');
  };
  h.find = (type, label) =>
    nodes(h.render()).find(
      (n) => n.type === type && (!label || textOf(n).includes(label))
    );
  h.goal = (value) => h.find('textarea').props.onChange({ target: { value } });
  h.button = (label) => h.find('button', label);
  h.confirm = () => h.button('确认理解无误').props.onClick();
  h.consultation = (reply) => {
    h.button('咨询丞相').props.onClick();
    h.consult.data = { reply };
    h.render();
  };
  h.prepare = () => {
    h.goal('原始目标');
    h.consultation('仅拟草案，不执行付款');
    h.confirm();
    h.button('形成拟旨').props.onClick();
    h.draft.data = {
      status: 'DRAFT_READY',
      decreeText: '已拟旨',
      version: 1,
      fingerprint: 'fp',
      understanding: 'understanding',
      draft: {
        departments: [],
        deliverables: [],
        materialGaps: [],
        permissionsAndLimits: [],
      },
    };
    h.render();
  };
  return h;
}

test('the live study passes the confirmed restatement with the original objective', () => {
  const h = setup();
  h.prepare();
  assert.deepEqual(h.calls.find((c) => c[0] === 'draft')[1], {
    messages: [
      {
        role: 'user',
        content:
          '[用户原始目标]\n原始目标\n\n[用户已确认的丞相理解]\n仅拟草案，不执行付款',
      },
    ],
    version: 1,
  });
});
test('overlong combined content is refused without silent clipping or draft calls', () => {
  const h = setup();
  h.goal('目标');
  h.consultation('长'.repeat(4000));
  h.confirm();
  h.button('形成拟旨').props.onClick();
  assert.equal(h.calls.filter((c) => c[0] === 'draft').length, 0);
  assert.match(textOf(h.render()), /4000/);
});
test('new restatement removes the old draft and rejects its captured issue action', async () => {
  const h = setup();
  h.prepare();
  const stale = h.button('正式下旨').props.onClick;
  h.consult.data = { reply: '新的理解与限制' };
  h.render();
  assert.equal(h.button('正式下旨'), undefined);
  stale();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.filter((c) => c[0] === 'issue').length, 0);
});
test('the user can revoke confirmed understanding before starting a task', () => {
  const h = setup();
  h.prepare();
  assert.ok(h.button('重新确认理解'));
  h.button('重新确认理解').props.onClick();
  h.render();
  assert.equal(h.button('正式下旨'), undefined);
  assert.equal(h.button('请先确认理解').props.disabled, true);
});
test('a change during key preparation prevents issuing the superseded intent', async () => {
  const h = setup();
  h.prepare();
  h.button('正式下旨').props.onClick();
  h.goal('改为只作比较');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.filter((c) => c[0] === 'issue').length, 0);
});
test('a stale confirmation click after goal editing cannot approve the new content', () => {
  const h = setup();
  h.goal('原始目标');
  h.consultation('理解');
  const stale = h.button('确认理解无误').props.onClick;
  h.goal('新目标');
  stale();
  h.render();
  assert.equal(h.button('请先确认理解').props.disabled, true);
  assert.equal(h.calls.filter((c) => c[0] === 'draft').length, 0);
});
test('the same ready intent issues once under synchronous double click', async () => {
  const h = setup();
  h.prepare();
  const click = h.button('正式下旨').props.onClick;
  click();
  click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.filter((c) => c[0] === 'issue').length, 1);
});
