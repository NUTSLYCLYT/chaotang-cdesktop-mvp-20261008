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
              /^(?:react(?:\/jsx-runtime)?|@.*|\.\/ChaotangPrimitives|\.\/StudyTaskProgress|\.\/StudyResourceBudget)$/,
          },
          (a) => ({ path: a.path, namespace: 'controlled' })
        );
        b.onLoad({ filter: /.*/, namespace: 'controlled' }, ({ path }) => ({
          contents:
            path === 'react/jsx-runtime'
              ? 'export const jsx=(type,props,key)=>({type,props,key});export const jsxs=jsx;export const Fragment=Symbol();'
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
                        : path.includes('StudyResourceBudget')
                          ? 'export const StudyResourceBudget="study-resource-budget";'
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
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage'
);

test('configuration failure preserves the goal and offers real recovery routes without execution', () => {
  const h = setup();
  h.goal('保留我的目标和资料');
  h.consult.error = Object.assign(new Error('模型配置不可用'), {
    code: 'config_unavailable',
  });
  const tree = h.render();
  assert.match(textOf(tree), /咨询或拟旨所需的模型配置尚未就绪/);
  assert.doesNotMatch(textOf(tree), /CHANCELLOR DESK · LIVE/);
  assert.equal(h.find('textarea').props.value, '保留我的目标和资料');
  assert.equal(h.find('a', '查看模型设置').props.href, '/court#models');
  assert.equal(h.find('a', '先试用户部现金分析').props.href, '/court#hubu');
  h.button('保存需求').props.onClick();
  assert.ok(
    [...h.savedValues.values()].some((value) =>
      value.includes('保留我的目标和资料')
    )
  );
  assert.equal(h.calls.length, 0);
});

test('unknown failure is not misclassified as missing model configuration', () => {
  const h = setup();
  h.consult.error = new Error('暂时失败');
  assert.doesNotMatch(textOf(h.render()), /咨询或拟旨所需的模型配置尚未就绪/);
});

test('recovery navigation saves input first and stops navigation when storage fails', () => {
  const h = setup();
  h.goal('离开前保留资料');
  h.consult.error = Object.assign(new Error('模型配置不可用'), {
    code: 'config_unavailable',
  });
  let prevented = false;
  h.find('a', '查看模型设置').props.onClick({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
  assert.ok(
    [...h.savedValues.values()].some((value) =>
      value.includes('离开前保留资料')
    )
  );
  h.goal('刚刚补充的新资料');
  h.failSave = true;
  h.find('a', '查看模型设置').props.onClick({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(h.find('textarea').props.value, '刚刚补充的新资料');
  assert.match(textOf(h.render()), /暂未离开上书房/);
  assert.equal(h.calls.length, 0);
});
afterEach(() => {
  delete globalThis.__studyHarness;
  if (originalStorage)
    Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
  else delete globalThis.sessionStorage;
  if (originalLocalStorage)
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else delete globalThis.localStorage;
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
  h.savedValues = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => h.savedValues.get(key) ?? null,
      setItem: (key, value) => {
        if (h.failSave) throw new Error('quota');
        h.savedValues.set(key, value);
      },
      removeItem: (key) => h.savedValues.delete(key),
    },
  });
  h.reopen = () => {
    stores.clear();
    h.consult.reset();
    h.draft.reset();
    h.issue.reset();
    return h.render();
  };
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

test('the decree agreement exposes exact materials, scope, exclusions and completion criteria before issue', () => {
  const h = setup();
  h.prepare();
  Object.assign(h.draft.data.draft, {
    scope: ['只比较指定仓库'],
    inputMaterials: ['用户上传的需求说明'],
    exclusions: ['不安装、不付费、不发送对外资料'],
    completionCriteria: ['每个判断都有来源链接'],
  });
  const tree = h.render();
  const text =
    textOf(tree) +
    nodes(tree)
      .filter(
        (node) =>
          typeof node.type === 'function' && node.type.name === 'DraftList'
      )
      .map((node) => textOf(node.type(node.props)))
      .join('');
  for (const exact of [
    '办理范围',
    '只比较指定仓库',
    '使用资料',
    '用户上传的需求说明',
    '本次不办理',
    '不安装、不付费、不发送对外资料',
    '完成标准',
    '每个判断都有来源链接',
  ]) {
    assert.ok(text.includes(exact), 'Missing confirmed draft field: ' + exact);
  }
  assert.equal(h.calls.filter((c) => c[0] === 'issue').length, 0);
});

test('missing agreement fields are explicit and never imply files were read or external actions authorized', () => {
  const h = setup();
  h.prepare();
  const tree = h.render();
  const text = nodes(tree)
    .filter(
      (node) =>
        typeof node.type === 'function' && node.type.name === 'DraftList'
    )
    .map((node) => textOf(node.type(node.props)))
    .join('');
  assert.ok(text.includes('尚未列明，不代表已读取任何文件'));
  assert.ok(text.includes('尚未列明，不代表允许所有外部动作'));
  assert.ok(text.includes('尚未列明，请返回补充验收要求'));
  assert.ok(h.find('study-resource-budget'));
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

test('an explicitly saved objective survives reopening without restoring execution authority', () => {
  const h = setup();
  h.prepare();
  h.button('保存需求').props.onClick();
  assert.equal(h.savedValues.size, 1);
  const record = JSON.parse([...h.savedValues.values()][0]);
  assert.equal(record.objective, '原始目标');
  assert.equal('fingerprint' in record, false);
  const callsBefore = h.calls.length;
  h.reopen();
  assert.equal(h.find('textarea').props.value, '');
  h.button('恢复已存需求').props.onClick();
  assert.equal(h.find('textarea').props.value, '原始目标');
  assert.equal(h.button('正式下旨'), undefined);
  assert.equal(h.button('请先确认理解').props.disabled, true);
  assert.equal(h.calls.length, callsBefore);
});

test('restoring saved text asks before replacing unsaved work and invalidates old confirmation', () => {
  const h = setup();
  h.goal('已存需求');
  h.button('保存需求').props.onClick();
  h.prepare();
  h.button('恢复已存需求').props.onClick();
  assert.equal(h.find('textarea').props.value, '原始目标');
  h.button('保留当前内容').props.onClick();
  assert.equal(h.find('textarea').props.value, '原始目标');
  h.button('恢复已存需求').props.onClick();
  h.button('用已存需求替换').props.onClick();
  assert.equal(h.find('textarea').props.value, '已存需求');
  assert.equal(h.button('正式下旨'), undefined);
  assert.equal(h.button('请先确认理解').props.disabled, true);
});

test('switching accounts hides another account saved objective', () => {
  const h = setup();
  h.goal('A 的资料');
  h.button('保存需求').props.onClick();
  h.provider.user = { id: 'owner-b', username: 'B' };
  h.provider.authGeneration++;
  h.reopen();
  assert.equal(h.button('恢复已存需求'), undefined);
  assert.equal(h.find('textarea').props.value, '');
  assert.equal(h.savedValues.size, 1);
});

test('save failure retains the earlier saved copy and the current editor', () => {
  const h = setup();
  h.goal('旧版');
  h.button('保存需求').props.onClick();
  const saved = [...h.savedValues.values()][0];
  h.goal('未保存的修改');
  h.failSave = true;
  h.button('保存需求').props.onClick();
  assert.equal([...h.savedValues.values()][0], saved);
  assert.equal(h.find('textarea').props.value, '未保存的修改');
  assert.match(textOf(h.render()), /未能保存/);
});

test('removing the saved copy keeps the visible objective available to save again', () => {
  const h = setup();
  h.goal('可继续编辑的需求');
  h.button('保存需求').props.onClick();
  h.button('移除已存副本').props.onClick();
  assert.equal(h.savedValues.size, 0);
  assert.equal(h.find('textarea').props.value, '可继续编辑的需求');
});

function textFile(text, name = '资料.md') {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  };
}
function selectMaterial(h, file) {
  const input = h.find('input');
  assert.ok(input, 'material input exists');
  input.props.onChange({
    currentTarget: { files: file ? [file] : [], value: 'selected' },
  });
}
const settleMaterial = () => new Promise((resolve) => setImmediate(resolve));

test('material selection previews locally; explicit append preserves goal and requires new understanding', async () => {
  const h = setup();
  h.prepare();
  const staleIssue = h.button('正式下旨').props.onClick;
  const callsBefore = h.calls.length;
  selectMaterial(h, textFile('资料原文'));
  staleIssue();
  await settleMaterial();
  assert.equal(h.find('textarea').props.value, '原始目标');
  assert.equal(textOf(h.find('pre')), '资料原文');
  assert.equal(h.button('咨询丞相').props.disabled, true);
  assert.equal(h.calls.length, callsBefore);
  h.button('加入当前需求').props.onClick();
  assert.equal(
    h.find('textarea').props.value,
    '原始目标\n\n[参考资料："资料.md"]\n资料原文\n[参考资料结束]'
  );
  assert.equal(h.button('正式下旨'), undefined);
  assert.equal(h.savedValues.size, 0);
  assert.equal(h.calls.length, callsBefore);
  h.button('咨询丞相').props.onClick();
  assert.match(h.calls.at(-1)[1][0].content, /资料原文/);
});

test('a cancelled file read cannot add a late preview or change the objective', async () => {
  const h = setup();
  h.goal('保留目标');
  let finish;
  selectMaterial(h, {
    ...textFile('abc'),
    arrayBuffer: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  h.button('取消资料导入').props.onClick();
  finish(new TextEncoder().encode('abc').buffer);
  await settleMaterial();
  assert.equal(h.find('pre'), undefined);
  assert.equal(h.find('textarea').props.value, '保留目标');
  assert.equal(h.calls.length, 0);
});

test('the newest file wins when local reads finish out of order', async () => {
  const h = setup();
  let finish;
  selectMaterial(h, {
    ...textFile('old'),
    arrayBuffer: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  selectMaterial(h, textFile('new', 'new.txt'));
  await settleMaterial();
  finish(new TextEncoder().encode('old').buffer);
  await settleMaterial();
  assert.equal(textOf(h.find('pre')), 'new');
  h.button('加入当前需求').props.onClick();
  assert.match(h.find('textarea').props.value, /new.txt/);
  assert.equal(h.calls.length, 0);
});

test('editing the goal invalidates a preview and its captured append action', async () => {
  const h = setup();
  selectMaterial(h, textFile('private material'));
  await settleMaterial();
  const staleApply = h.button('加入当前需求').props.onClick;
  h.goal('新的目标');
  staleApply();
  assert.equal(h.find('textarea').props.value, '新的目标');
  assert.equal(h.find('pre'), undefined);
});

test('unsupported and overlong imports leave the goal and saved copy intact', async () => {
  const h = setup();
  h.goal('保存目标');
  h.button('保存需求').props.onClick();
  const saved = [...h.savedValues];
  selectMaterial(h, textFile('content', 'report.pdf'));
  await settleMaterial();
  assert.match(textOf(h.render()), /仅支持 TXT/);
  assert.equal(h.find('textarea').props.value, '保存目标');
  h.goal('字'.repeat(3990));
  selectMaterial(h, textFile('content'));
  await settleMaterial();
  assert.match(textOf(h.render()), /未截断/);
  assert.equal(h.find('textarea').props.value.length, 3990);
  assert.equal(h.find('pre'), undefined);
  assert.deepEqual([...h.savedValues], saved);
  assert.equal(h.calls.length, 0);
});

test('the material preview is a local card that neither claims upload nor model reading', async () => {
  const h = setup();
  selectMaterial(h, textFile('资料原文', '长文件名资料.md'));
  await settleMaterial();
  const text = textOf(h.render());
  assert.match(text, /长文件名资料\.md/);
  assert.match(text, /本机已读取 · 待加入需求/);
  assert.match(text, /尚未发送/);
  assert.doesNotMatch(text, /上传成功/);
  assert.doesNotMatch(text, /模型已读/);
});

test('the material body is collapsed by default behind a native summary', async () => {
  const h = setup();
  selectMaterial(h, textFile('资料原文'));
  await settleMaterial();
  const details = h.find('details');
  assert.ok(details, 'native details exists');
  assert.ok(!details.props.open, 'details is collapsed by default');
  assert.equal(textOf(h.find('summary')), '查看资料内容');
  assert.match(textOf(details), /资料原文/);
});

test('加入当前需求 stays outside the collapsed region while cancel remains available', async () => {
  const h = setup();
  selectMaterial(h, textFile('资料原文'));
  await settleMaterial();
  const details = h.find('details');
  assert.ok(details, 'native details exists');
  const applyInsideDetails = nodes(details).some(
    (n) => n.type === 'button' && textOf(n).includes('加入当前需求')
  );
  assert.equal(applyInsideDetails, false);
  assert.ok(h.button('加入当前需求'));
  assert.ok(h.button('取消资料导入'));
});

test('switching to a different material resets the preview to collapsed via a content key', async () => {
  const h = setup();
  selectMaterial(h, textFile('第一份', 'first.txt'));
  await settleMaterial();
  const firstKey = h.find('details').key;
  selectMaterial(h, textFile('第二份', 'second.txt'));
  await settleMaterial();
  const secondDetails = h.find('details');
  assert.notEqual(secondDetails.key, firstKey);
  assert.match(String(secondDetails.key), /second\.txt/);
  assert.ok(!secondDetails.props.open);
  assert.match(textOf(secondDetails), /第二份/);
});

test('the collapsed card keeps the complete local text without truncation or HTML execution', async () => {
  const h = setup();
  const content = `${'长'.repeat(50)}\n<b>不应执行</b>尾`;
  selectMaterial(h, textFile(content));
  await settleMaterial();
  assert.equal(textOf(h.find('pre')), content);
  assert.equal(h.find('b'), undefined);
});

test('account changes hide pending material and do not transmit it', async () => {
  const h = setup();
  let finish;
  selectMaterial(h, {
    ...textFile('abc'),
    arrayBuffer: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  h.provider.user = { id: 'owner-b', username: 'B' };
  h.provider.authGeneration++;
  h.reopen();
  finish(new TextEncoder().encode('abc').buffer);
  await settleMaterial();
  assert.equal(h.find('pre'), undefined);
  assert.equal(h.find('textarea').props.value, '');
  assert.equal(h.calls.length, 0);
});

test('a ready draft explains the next step and keeps technical fields collapsed', () => {
  const h = setup();
  h.prepare();
  h.draft.data.fingerprint = 'fp-full-0123456789abcdef0123456789abcdef';
  h.render();
  const heading = textOf(h.find('h3'));
  assert.match(heading, /拟旨已就绪，等待您确认下旨/);
  assert.doesNotMatch(heading, /DRAFT_READY/);
  const details = h.find('details');
  assert.ok(details, 'native details exists');
  assert.ok(!details.props.open, 'details is collapsed by default');
  assert.equal(textOf(h.find('summary')), '拟旨详情');
  const detailText = textOf(details);
  assert.match(detailText, /状态/);
  assert.match(detailText, /版本/);
  assert.match(detailText, /指纹/);
  assert.match(detailText, /DRAFT_READY/);
  assert.match(
    detailText,
    /fp-full-0123456789abcdef0123456789abcdef/,
    'full fingerprint is preserved'
  );
  const button = h.button('正式下旨');
  assert.ok(button, 'ready button');
  assert.equal(button.props.disabled, false);
  assert.doesNotMatch(textOf(button), /DRAFT_READY/);
  assert.match(
    textOf(h.render()),
    /正式下旨后才创建办理任务；拟旨不代表部门已经执行/
  );
});

test('a non-ready draft says it needs more work and disables issuing', () => {
  const h = setup();
  h.prepare();
  h.draft.data.status = 'DRAFT_INCOMPLETE';
  h.render();
  assert.match(textOf(h.find('h3')), /拟旨尚需完善，请按下方意见补充/);
  const button = h.button('请先完善拟旨');
  assert.ok(button, 'not-ready button');
  assert.equal(button.props.disabled, true);
  assert.equal(h.button('正式下旨'), undefined);
  assert.doesNotMatch(textOf(h.find('h3')), /DRAFT_INCOMPLETE/);
});

test('an unknown draft status cannot claim readiness or enable issuing', () => {
  const h = setup();
  h.prepare();
  h.draft.data.status = 'SOMETHING_UNKNOWN';
  h.render();
  const heading = textOf(h.find('h3'));
  assert.match(heading, /拟旨尚需完善/);
  assert.doesNotMatch(heading, /就绪/);
  assert.doesNotMatch(heading, /可执行/);
  assert.equal(h.button('正式下旨'), undefined);
  const button = h.button('请先完善拟旨');
  assert.ok(button, 'unknown-state button');
  assert.equal(button.props.disabled, true);
  assert.match(textOf(h.find('details')), /SOMETHING_UNKNOWN/);
});

test('while submitting the card warns against duplicate submission and disables the button', () => {
  const h = setup();
  h.prepare();
  h.issue.isPending = true;
  h.render();
  assert.match(textOf(h.find('h3')), /正在受理，请勿重复提交/);
  const button = h.button('正在受理…');
  assert.ok(button, 'submitting button');
  assert.equal(button.props.disabled, true);
  assert.equal(h.button('正式下旨'), undefined);
});

test('after a task is created the card points to progress and disables duplicate issuing', async () => {
  const h = setup();
  h.prepare();
  h.button('正式下旨').props.onClick();
  await settleMaterial();
  h.render();
  assert.equal(h.calls.filter((c) => c[0] === 'issue').length, 1);
  assert.match(textOf(h.find('h3')), /已创建办理任务，请查看下方进展/);
  const button = h.button('已创建办理任务');
  assert.ok(button, 'created-task button');
  assert.equal(button.props.disabled, true);
  assert.equal(h.button('正式下旨'), undefined);
});
