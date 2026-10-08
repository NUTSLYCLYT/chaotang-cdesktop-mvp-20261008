import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  process.env.CHAOTANG_BRIDGE_TEST_SOURCE ??
    new URL(
      '../../../../../public/chaotang-final-v2/bridge.js',
      import.meta.url
    ),
  'utf8'
);

const legacySource = readFileSync(
  new URL('../../../../../public/chaotang-final/bridge.js', import.meta.url),
  'utf8'
);

test('original department navigation opens real department panels', () => {
  const f = fixture();
  for (const [page, action] of [
    ['B02', 'hubu'],
    ['C01', 'jinyiwei'],
    ['A06', 'shiguan'],
    ['B06', 'gongbu'],
    ['C02', 'forecast'],
    ['C03', 'learning'],
    ['E04', 'life'],
  ]) {
    f.clickPage(page);
    assert.ok(
      f.sent.some(
        (message) =>
          message.type === 'chaotang:action' && message.action === action
      )
    );
  }
});

test('the Qintian and Hanlin page buttons dispatch exactly one panel action, no route and open the inline surface', () => {
  for (const [page, action] of [
    ['C02', 'forecast'],
    ['C03', 'learning'],
  ]) {
    const f = fixture();
    f.setPage('A01');
    f.clickPage(page);
    assert.deepEqual(
      f.snapshot().filter((message) => message.type === 'chaotang:action'),
      [{ type: 'chaotang:action', action }]
    );
    assert.equal(
      f.sent.some((message) => message.type === 'chaotang:navigate'),
      false
    );
    assert.deepEqual(
      f
        .snapshot()
        .filter((message) => message.type === 'chaotang:inline-surface'),
      [
        {
          type: 'chaotang:inline-surface',
          page,
          suspended: false,
          rect: { left: 421, top: 258, width: 638, height: 551 },
        },
      ]
    );
    assert.equal(f.app.dataset.courtInline, 'active');
    assert.equal(f.input.readOnly, true);
    assert.equal(f.send.disabled, true);
  }
});

test('the life page button dispatches exactly one real life action and no route', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('E04');
  assert.deepEqual(f.snapshot(), [{ type: 'chaotang:action', action: 'life' }]);
});

test('the treasury page button opens the real hubu panel on its B02 inner surface', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B02');
  assert.deepEqual(
    f.snapshot().filter((message) => message.type === 'chaotang:action'),
    [{ type: 'chaotang:action', action: 'hubu' }]
  );
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B02',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
  assert.equal(f.send.disabled, true);
});

test('migrated department page buttons never leak a navigate message', () => {
  for (const page of ['B02', 'E04', 'C02', 'C03']) {
    const f = fixture();
    f.setPage('A01');
    f.clickPage(page);
    assert.equal(
      f.sent.some((message) => message.type === 'chaotang:navigate'),
      false
    );
  }
});

test('a parent route sync to the life page selects it without dispatching an action', () => {
  const f = fixture();
  f.setPage('A01');
  f.route('E04');
  assert.deepEqual(f.snapshot(), []);
});

test('result catalog entrance opens its panel without a model or demo execution', () => {
  const f = fixture();
  f.clickAction('results');
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent)), [
    { type: 'chaotang:action', action: 'results' },
  ]);
});

function attributeValue(element, name) {
  if (name.startsWith('data-')) {
    const key = name
      .slice(5)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.prototype.hasOwnProperty.call(element.dataset, key))
      return element.dataset[key];
  }
  return Object.prototype.hasOwnProperty.call(element.attributes, name)
    ? element.attributes[name]
    : undefined;
}

function matchesCompound(element, selector) {
  const parsed = selector.match(
    /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)((?:\[[^\]]+\])*)$/
  );
  if (!parsed) return false;
  const [, tag, markers, attributes] = parsed;
  if (tag && element.tagName !== tag.toUpperCase()) return false;
  for (const id of markers.match(/#[\w-]+/g) || [])
    if (element.attributes.id !== id.slice(1)) return false;
  const classList = String(element.className || '').split(/\s+/);
  for (const name of markers.match(/\.[\w-]+/g) || [])
    if (!classList.includes(name.slice(1))) return false;
  const attributePattern = /\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g;
  let match;
  while ((match = attributePattern.exec(attributes))) {
    const value = attributeValue(element, match[1]);
    if (match[2] === undefined) {
      if (value === undefined || value === null) return false;
    } else if (String(value) !== match[2]) {
      return false;
    }
  }
  return true;
}

function matchesSelector(element, selector) {
  if (!element || element.nodeType !== 1) return false;
  return selector
    .split(',')
    .some((part) => matchesCompound(element, part.trim()));
}

// Depth-first, document-order lookup that mirrors querySelector. This keeps the
// fixture honest: an ancestor such as #app[data-page] is visited before its
// descendant buttons, so a selector that is too broad returns the ancestor.
function searchTree(root, selector, includeRoot) {
  if (includeRoot && matchesSelector(root, selector)) return root;
  for (const child of root.children) {
    const found = searchTree(child, selector, true);
    if (found) return found;
  }
  return null;
}

function collectTree(root, selector) {
  const found = [];
  const walk = (node) => {
    if (matchesSelector(node, selector)) found.push(node);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return found;
}

function createElement(tagName, options = {}, dispatch) {
  const classSet = new Set(
    String(options.className ?? '')
      .split(/\s+/)
      .filter(Boolean)
  );
  const syncClassName = () => {
    element.className = [...classSet].join(' ');
  };
  const element = {
    nodeType: 1,
    tagName: String(tagName).toUpperCase(),
    className: options.className ?? '',
    classList: {
      contains: (name) => classSet.has(name),
      add: (name) => {
        classSet.add(name);
        syncClassName();
      },
      remove: (name) => {
        classSet.delete(name);
        syncClassName();
      },
      toggle: (name, force) => {
        const want = force === undefined ? !classSet.has(name) : Boolean(force);
        if (want) classSet.add(name);
        else classSet.delete(name);
        syncClassName();
        return want;
      },
    },
    dataset: options.dataset ?? {},
    attributes: options.attributes ?? {},
    rect: options.rect ?? null,
    children: [],
    parentNode: null,
    hidden: false,
    open: options.open ?? false,
    disabled: false,
    textContent: '',
    style: {},
    listeners: new Map(),
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    append(...children) {
      children.forEach((child) => element.appendChild(child));
    },
    replaceChildren(...children) {
      element.children = [];
      children.forEach((child) => element.appendChild(child));
    },
    setAttribute(name, value) {
      element.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(element.attributes, name)
        ? element.attributes[name]
        : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(element.attributes, name);
    },
    removeAttribute(name) {
      delete element.attributes[name];
    },
    addEventListener(type, listener) {
      if (!element.listeners.has(type)) element.listeners.set(type, []);
      element.listeners.get(type).push(listener);
    },
    matches(selector) {
      return matchesSelector(element, selector);
    },
    closest(selector) {
      for (let node = element; node; node = node.parentNode) {
        if (matchesSelector(node, selector)) return node;
      }
      return null;
    },
    querySelector(selector) {
      return searchTree(element, selector, false);
    },
    click() {
      dispatch(element);
    },
    focus() {},
    getBoundingClientRect() {
      return (
        element.rect ?? {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
        }
      );
    },
  };
  return element;
}

const NAV_PAGES = [
  'A01',
  'A02',
  'A03',
  'A06',
  'B02',
  'B06',
  'C01',
  'C02',
  'C03',
  'E04',
  // A real prototype page id that owns no inline surface: used to prove the
  // six-page whitelist rejects a genuinely unknown page.
  'B03',
];

function fixture(scriptSource = source) {
  const handlers = new Map();
  const documentHandlers = new Map();
  const inputHandlers = new Map();
  const timers = new Map();
  const sent = [];
  let nextTimer = 0;

  const dispatchClick = (target) => {
    const click = documentHandlers.get('click');
    if (!click) return;
    click({ target, preventDefault() {}, stopImmediatePropagation() {} });
  };
  const create = (tagName, options) =>
    createElement(tagName, options, dispatchClick);

  // The #app shell carries data-page for the current page (app.js does this).
  // Every nav control is a real button[data-page] nested inside it.
  const app = create('div', { className: 'app', dataset: { page: 'A03' } });
  app.setAttribute('id', 'app');
  const navButtons = new Map();
  const navSpans = new Map();
  for (const page of NAV_PAGES) {
    const button = create('button', { dataset: { page } });
    const span = create('span');
    button.appendChild(span);
    app.appendChild(button);
    navButtons.set(page, button);
    navSpans.set(page, span);
  }
  const plainButton = create('button', {
    dataset: { secondary: '参数微调' },
  });
  const drawerClose = create('button', {
    attributes: { 'aria-label': '关闭业务面板' },
  });
  app.append(plainButton, drawerClose);
  for (const action of ['results', 'account']) {
    app.appendChild(create('button', { dataset: { open: action } }));
  }

  // Real app shell geometry the bridge measures for the single operation
  // surface: the stage content column and the page heading above it.
  const stage = create('main', {
    rect: {
      left: 398,
      top: 106,
      right: 1094,
      bottom: 874,
      width: 696,
      height: 768,
    },
  });
  stage.setAttribute('id', 'stage');
  let appScrollLeft = 0;
  let appScrollTop = 0;
  Object.defineProperties(app, {
    scrollLeft: {
      get: () => appScrollLeft,
      set: (value) => {
        const delta = value - appScrollLeft;
        appScrollLeft = value;
        stage.rect.left -= delta;
        stage.rect.right -= delta;
      },
    },
    scrollTop: {
      get: () => appScrollTop,
      set: (value) => {
        const delta = value - appScrollTop;
        appScrollTop = value;
        stage.rect.top -= delta;
        stage.rect.bottom -= delta;
      },
    },
  });
  const heading = create('div', {
    className: 'page-heading',
    rect: {
      left: 398,
      top: 130,
      right: 1094,
      bottom: 190,
      width: 696,
      height: 60,
    },
  });
  const centralDisplay = create('section', {
    rect: {
      left: 420,
      top: 210,
      right: 1060,
      bottom: 810,
      width: 640,
      height: 600,
    },
  });
  const displayBar = create('header', {
    rect: {
      left: 420,
      top: 210,
      right: 1060,
      bottom: 258,
      width: 640,
      height: 48,
    },
  });
  centralDisplay.addEventListener ??= () => {};
  stage.addEventListener ??= () => {};
  const overlays = {};
  for (const id of ['drawer', 'atlas', 'onboarding']) {
    const node = create('dialog');
    node.setAttribute('id', id);
    overlays[id] = node;
  }
  // Narrow-screen side panels. On screens below 1180px the real shell collapses
  // both panels; expanding one overlays the stage and must suspend the surface.
  const leftPanel = create('aside', {
    className: 'side-panel left-panel is-collapsed',
  });
  const rightPanel = create('aside', {
    className: 'side-panel right-panel is-collapsed',
  });
  app.append(leftPanel, rightPanel);
  const composerHint = create('span');
  composerHint.textContent = '当前阶段只澄清目标，不会自动执行。';

  const input = {
    value: '',
    addEventListener: (type, fn) => inputHandlers.set(type, fn),
  };
  const send = { disabled: false, addEventListener() {} };
  const avatar = { textContent: '', title: '' };
  const identityName = { textContent: '昭明君' };
  const identityStatus = { textContent: '开府之主 · LV.3' };
  const identityControl = {
    title: '个人朝堂 · 用户设置',
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const staticSelectors = {
    '.avatar': avatar,
    '.identity-copy b': identityName,
    '.identity-copy small': identityStatus,
    '.identity-control': identityControl,
    '.page-heading': heading,
    '.display-bar': displayBar,
  };
  const parent = { postMessage: (message) => sent.push(message) };
  const observations = [];
  const scrollToCalls = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe(node, options) {
      observations.push({ node, options });
    }
    disconnect() {}
  }
  const setTimer = (fn) => {
    const id = ++nextTimer;
    timers.set(id, fn);
    return id;
  };
  const clearTimer = (id) => timers.delete(id);
  const document = {
    getElementById: (id) =>
      ({
        app,
        promptInput: input,
        sendButton: send,
        stage,
        centralDisplay,
        drawer: overlays.drawer,
        atlas: overlays.atlas,
        onboarding: overlays.onboarding,
        composerHint,
      })[id] ?? null,
    querySelector: (selector) =>
      staticSelectors[selector] ?? searchTree(app, selector, true),
    querySelectorAll: (selector) => collectTree(app, selector),
    createElement: (tagName) => create(tagName),
    addEventListener: (type, fn) => documentHandlers.set(type, fn),
  };
  const context = {
    window: {
      parent,
      innerWidth: 1440,
      scrollX: 0,
      scrollY: 0,
      scrollTo: (x, y) => {
        const deltaX = context.window.scrollX - x;
        const deltaY = context.window.scrollY - y;
        context.window.scrollX = x;
        context.window.scrollY = y;
        stage.rect = {
          ...stage.rect,
          left: stage.rect.left + deltaX,
          right: stage.rect.right + deltaX,
          top: stage.rect.top + deltaY,
          bottom: stage.rect.bottom + deltaY,
        };
        scrollToCalls.push([x, y]);
      },
      location: { origin: 'https://isolated.invalid' },
      addEventListener: (type, fn) => handlers.set(type, fn),
      setTimeout: setTimer,
      clearTimeout: clearTimer,
    },
    document,
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    crypto: { randomUUID },
    MutationObserver: FakeMutationObserver,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    requestAnimationFrame: (fn) => fn(),
  };
  vm.runInNewContext(scriptSource, context, { timeout: 1000 });

  const message = (data) =>
    handlers.get('message')({
      origin: context.window.location.origin,
      source: parent,
      data,
    });
  const account = (username) =>
    message({ type: 'chaotang:status', authenticated: !!username, username });
  const load = (draft = '', page = 'A01') =>
    message({
      type: 'chaotang:store',
      authenticated: true,
      body: JSON.stringify({
        records: {},
        selected: { [page]: 'synthetic-session' },
        sessions: { 'synthetic-session': { page, draft } },
      }),
    });
  const route = (page) => message({ type: 'chaotang:route', page });
  const requestInlineSurface = (page = 'A02') =>
    message({ type: 'chaotang:inline-surface-request', page });
  const dismissInline = () =>
    message({ type: 'chaotang:inline-surface-dismiss' });
  const snapshot = () => JSON.parse(JSON.stringify(sent));
  return {
    app,
    stage,
    displayBar,
    account,
    load,
    storeError: () =>
      message({
        type: 'chaotang:store-error',
        message: 'native store unavailable',
      }),
    route,
    requestInlineSurface,
    dismissInline,
    input,
    send,
    avatar,
    identityName,
    identityStatus,
    identityControl,
    composerHint,
    overlays,
    leftPanel,
    rightPanel,
    observations,
    scrollToCalls,
    timers,
    sent,
    snapshot,
    inputHandlers,
    setPage: (page) => {
      app.dataset.page = page;
    },
    setViewportWidth: (width) => {
      context.window.innerWidth = width;
    },
    setAppScroll: (x, y) => {
      app.scrollLeft = x;
      app.scrollTop = y;
    },
    setWindowScroll: (x, y) => {
      const deltaX = x - context.window.scrollX;
      const deltaY = y - context.window.scrollY;
      context.window.scrollX = x;
      context.window.scrollY = y;
      stage.rect = {
        ...stage.rect,
        left: stage.rect.left - deltaX,
        right: stage.rect.right - deltaX,
        top: stage.rect.top - deltaY,
        bottom: stage.rect.bottom - deltaY,
      };
    },
    resize: () => handlers.get('resize')(),
    clickPage: (page) => navButtons.get(page).click(),
    clickInnerPage: (page) => navSpans.get(page).click(),
    clickPlain: () => plainButton.click(),
    clickBlank: () => app.click(),
    clickDrawerClose: () => drawerClose.click(),
    clickAction: (action) =>
      searchTree(app, `[data-open="${action}"]`, true).click(),
  };
}

test('original study and council navigation opens real workspaces without issuing a decree', () => {
  for (const [page, action] of [
    ['A02', 'study'],
    ['A03', 'cases'],
  ]) {
    const f = fixture();
    f.setPage('A01');
    f.clickPage(page);
    assert.deepEqual(
      f.snapshot().filter((message) => message.type === 'chaotang:action'),
      [{ type: 'chaotang:action', action }]
    );
    assert.equal(
      f.sent.some((message) => message.type === 'chaotang:navigate'),
      false
    );
  }
});

test('the A02 operation surface reports one measurement from the original paper geometry', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A02');
  const inline = f
    .snapshot()
    .filter((message) => message.type === 'chaotang:inline-surface');
  assert.deepEqual(inline, [
    {
      type: 'chaotang:inline-surface',
      page: 'A02',
      suspended: false,
      rect: { left: 421, top: 258, width: 638, height: 551 },
    },
  ]);
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
  assert.equal(f.send.disabled, true);
  assert.equal(
    f.composerHint.textContent,
    '请在上方真实办理区填写需求、附资料并确认办理；此处不再重复发送。'
  );
});

test('an inline-surface request measures only while on an operation page', () => {
  const f = fixture();
  f.setPage('A01');
  f.requestInlineSurface();
  assert.equal(
    f.sent.filter((message) => message.type === 'chaotang:inline-surface')
      .length,
    0
  );
  f.clickPage('A03');
  f.sent.length = 0;
  f.requestInlineSurface();
  assert.deepEqual(f.snapshot(), [
    {
      type: 'chaotang:inline-surface',
      page: 'A03',
      suspended: false,
      rect: { left: 421, top: 258, width: 638, height: 551 },
    },
  ]);
});

test('a child overlay suspends the real surface and its release restores it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A02');
  f.sent.length = 0;
  f.overlays.drawer.open = true;
  f.clickPlain();
  let inline = f
    .snapshot()
    .filter((message) => message.type === 'chaotang:inline-surface');
  assert.deepEqual(inline, [
    {
      type: 'chaotang:inline-surface',
      page: 'A02',
      suspended: true,
      rect: null,
    },
  ]);
  assert.equal(f.app.dataset.courtInline, 'suspended');
  assert.equal(f.input.readOnly, true);
  assert.equal(f.send.disabled, true);
  f.overlays.drawer.open = false;
  f.clickPlain();
  inline = f
    .snapshot()
    .filter((message) => message.type === 'chaotang:inline-surface');
  assert.deepEqual(inline.at(-1), {
    type: 'chaotang:inline-surface',
    page: 'A02',
    suspended: false,
    rect: { left: 421, top: 258, width: 638, height: 551 },
  });
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
});

test('leaving the operation pages restores the composer and demo controls', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A02');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.input.value = '未发送的草稿';
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  // The real single operation surface released the page, so the ordinary
  // composer owns sending again and reflects the content still in the box.
  assert.equal(f.send.disabled, false);
  assert.equal(
    f.composerHint.textContent,
    '当前阶段只澄清目标，不会自动执行。'
  );
});

test('an explicit dismiss releases the lease and a later plain click cannot reactivate it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A02');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.dismissInline();
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  assert.equal(f.send.disabled, true);
  assert.equal(
    f.composerHint.textContent,
    '当前阶段只澄清目标，不会自动执行。'
  );
  f.sent.length = 0;
  f.clickPlain();
  f.clickBlank();
  assert.equal(
    f.sent.filter((message) => message.type === 'chaotang:inline-surface')
      .length,
    0
  );
  assert.equal(f.app.dataset.courtInline, undefined);
});

test('a Host re-request after an explicit dismiss re-leases the same surface', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A02');
  f.dismissInline();
  assert.equal(f.app.dataset.courtInline, undefined);
  f.sent.length = 0;
  f.requestInlineSurface('A02');
  assert.deepEqual(f.snapshot(), [
    {
      type: 'chaotang:inline-surface',
      page: 'A02',
      suspended: false,
      rect: { left: 421, top: 258, width: 638, height: 551 },
    },
  ]);
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('a narrow expanded side panel suspends the surface and collapse restores it', () => {
  const f = fixture();
  f.setViewportWidth(1000);
  f.setPage('A01');
  f.clickPage('A02');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.sent.length = 0;
  f.leftPanel.classList.remove('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'A02',
        suspended: true,
        rect: null,
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'suspended');
  assert.equal(f.input.readOnly, true);
  f.sent.length = 0;
  f.leftPanel.classList.add('is-collapsed');
  f.rightPanel.classList.remove('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'A02',
        suspended: true,
        rect: null,
      },
    ]
  );
  f.sent.length = 0;
  f.rightPanel.classList.add('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'A02',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('a narrow panel focus scroll is reset before the real surface is measured', () => {
  const f = fixture();
  f.setViewportWidth(1000);
  f.setPage('A01');
  f.clickPage('A02');
  f.setAppScroll(508, 0);
  f.sent.length = 0;
  f.resize();
  assert.equal(f.app.scrollLeft, 0);
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'A02',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('expanded side panels on a wide screen do not suspend the surface', () => {
  const f = fixture();
  f.setViewportWidth(1440);
  f.leftPanel.classList.remove('is-collapsed');
  f.rightPanel.classList.remove('is-collapsed');
  f.setPage('A01');
  f.clickPage('A02');
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('side panel class changes are observed with a narrow listener, not a frame loop', () => {
  const f = fixture();
  const panelObservations = f.observations.filter(
    (entry) => entry.node === f.leftPanel || entry.node === f.rightPanel
  );
  assert.equal(panelObservations.length, 2);
  for (const entry of panelObservations)
    assert.deepEqual([...entry.options.attributeFilter], ['class']);
});

test('a degenerate stage keeps prototype controls inert while the Host connects', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A02');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.stage.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  f.sent.length = 0;
  f.clickPlain();
  const last = f
    .snapshot()
    .filter((message) => message.type === 'chaotang:inline-surface')
    .at(-1);
  assert.deepEqual(last, {
    type: 'chaotang:inline-surface',
    page: 'A02',
    suspended: false,
    rect: null,
  });
  assert.equal(f.app.dataset.courtInline, 'connecting');
  assert.equal(f.input.readOnly, true);
  assert.equal(f.send.disabled, true);
  f.input.value = '连接期间保留的草稿';
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  assert.equal(f.send.disabled, false);
});

test('a parent route sync to the study page measures without echoing an action', () => {
  const f = fixture();
  f.setPage('A01');
  f.route('A02');
  assert.deepEqual(
    f
      .snapshot()
      .filter(
        (message) =>
          message.type === 'chaotang:action' ||
          message.type === 'chaotang:navigate'
      ),
    []
  );
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'A02',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
});

test('a plain button inside the A03 shell does not reopen the council workspace', () => {
  const f = fixture();
  f.setPage('A03');
  f.clickPlain();
  assert.deepEqual(f.snapshot(), []);
});

test('clicking blank shell surface does not reopen the council workspace', () => {
  const f = fixture();
  f.setPage('A03');
  f.clickBlank();
  assert.deepEqual(f.snapshot(), []);
});

test('closing a business drawer does not reopen the council workspace', () => {
  const f = fixture();
  f.setPage('A03');
  f.clickDrawerClose();
  assert.deepEqual(f.snapshot(), []);
});

test('a plain edit control on A02 does not reopen the study workspace', () => {
  const f = fixture();
  f.setPage('A02');
  f.clickPlain();
  assert.deepEqual(f.snapshot(), []);
});

test('clicking a navigation label inside a real page button still routes to that page', () => {
  const f = fixture();
  f.setPage('A03');
  f.clickInnerPage('B02');
  assert.deepEqual(
    f.snapshot().filter((message) => message.type === 'chaotang:action'),
    [{ type: 'chaotang:action', action: 'hubu' }]
  );
});

test('results and account entries dispatch exactly one matching action each', () => {
  for (const action of ['results', 'account']) {
    const f = fixture();
    f.setPage('A03');
    f.clickAction(action);
    assert.deepEqual(f.snapshot(), [{ type: 'chaotang:action', action }]);
  }
});

test('a parent route sync selects the real page button without dispatching back', () => {
  const f = fixture();
  f.setPage('A03');
  f.account('account-A');
  f.load('A03 draft', 'A03');
  f.route('A03');
  assert.deepEqual(
    f
      .snapshot()
      .filter(
        (message) =>
          message.type === 'chaotang:action' ||
          message.type === 'chaotang:navigate'
      ),
    []
  );
  assert.equal(f.input.value, 'A03 draft');
});

test('legacy: a plain button inside the shell no longer opens the current route', () => {
  const f = fixture(legacySource);
  f.setPage('A03');
  f.clickPlain();
  assert.deepEqual(f.snapshot(), []);
});

test('legacy: an inner navigation label still routes through its page button', () => {
  const f = fixture(legacySource);
  f.clickInnerPage('C02');
  assert.deepEqual(f.snapshot(), [
    { type: 'chaotang:navigate', route: '/forecast' },
  ]);
});

test('legacy: a parent route sync selects the real button without echoing a route', () => {
  const f = fixture(legacySource);
  f.setPage('A03');
  f.route('A03');
  assert.deepEqual(f.snapshot(), []);
});

test('signed-in identity replaces the sample name and level in the visible account control', () => {
  const f = fixture();
  f.account('朝堂测试用户');
  assert.equal(f.identityName.textContent, '朝堂测试用户');
  assert.equal(f.identityStatus.textContent, '已登录朝堂账户');
  assert.equal(f.identityControl.title, '朝堂测试用户 · 账户设置');
  assert.equal(
    f.identityControl.attributes['aria-label'],
    '朝堂测试用户 · 账户设置'
  );
});

test('account switching and logout remove the previous visible identity and accessible name', () => {
  const f = fixture();
  f.account('account-A');
  f.account('account-B');
  assert.equal(f.identityName.textContent, 'account-B');
  assert.equal(f.identityControl.title, 'account-B · 账户设置');
  f.account(null);
  assert.equal(f.identityName.textContent, '未登录');
  assert.equal(f.identityStatus.textContent, '登录后查看账户');
  assert.equal(f.identityControl.title, '登录或注册朝堂账户');
  assert.equal(
    f.identityControl.attributes['aria-label'],
    '登录或注册朝堂账户'
  );
});

test('an initial anonymous status clears the sample account before any login', () => {
  const f = fixture();
  f.account(null);
  assert.equal(f.identityName.textContent, '未登录');
  assert.equal(f.identityStatus.textContent, '登录后查看账户');
});

test('logout immediately removes account draft and resets account display', () => {
  const f = fixture();
  f.account('account-A');
  f.load('Private synthetic A draft');
  f.account(null);
  assert.equal(f.input.value, '');
  assert.equal(f.send.disabled, true);
  assert.equal(f.avatar.title, '未登录');
  assert.equal(f.avatar.textContent, '君');
});

test('direct account switch stays empty and disabled while next storage is pending', () => {
  const f = fixture();
  f.account('account-A');
  f.load('Private synthetic A draft');
  f.account('account-B');
  assert.equal(f.input.value, '');
  assert.equal(f.send.disabled, true);
  assert.equal(
    f.sent.filter((m) => m.type === 'chaotang:store-load').length,
    2
  );
});

test('restored own draft controls whether send is available', () => {
  const f = fixture();
  f.account('account-B');
  f.load('Own draft');
  assert.equal(f.input.value, 'Own draft');
  assert.equal(f.send.disabled, false);
  f.load('   ');
  assert.equal(f.send.disabled, true);
});

test('account change cancels a pending draft write without saving it under next account', () => {
  const f = fixture();
  f.account('account-A');
  f.load('');
  f.input.value = 'A draft waiting for debounce';
  f.inputHandlers.get('input')();
  assert.equal(f.timers.size, 1);
  f.account('account-B');
  f.load('B draft');
  assert.equal(f.timers.size, 0);
  assert.equal(
    f.sent.filter((m) => m.type === 'chaotang:store-save').length,
    0
  );
  assert.equal(f.input.value, 'B draft');
});

test('repeated status for the same account preserves an unsent draft and timer', () => {
  const f = fixture();
  f.account('account-A');
  f.load('');
  f.input.value = 'Still editing';
  f.inputHandlers.get('input')();
  f.account('account-A');
  assert.equal(f.input.value, 'Still editing');
  assert.equal(f.timers.size, 1);
});

test('Shiguan navigation leases the original central stage and releases it on exit', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A06');
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.ok(
    f
      .snapshot()
      .some(
        (m) =>
          m.type === 'chaotang:inline-surface' && m.page === 'A06' && m.rect
      )
  );
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
});

test('Jinyiwei uses the inner original display rectangle and supports collapse', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('C01');
  f.requestInlineSurface('C01');
  assert.equal(f.app.dataset.courtInline, 'active');
  const latest = () =>
    f
      .snapshot()
      .filter((m) => m.type === 'chaotang:inline-surface')
      .at(-1);
  assert.deepEqual(latest().rect, {
    left: 421,
    top: 258,
    width: 638,
    height: 551,
  });
  assert.equal(latest().page, 'C01');
  f.app.dataset.scroll = 'seal';
  f.clickPlain();
  assert.equal(latest().suspended, true);
  f.app.dataset.scroll = 'full';
  f.clickPlain();
  assert.equal(latest().suspended, false);
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
});

test('Junjichu uses the inner original display rectangle and supports collapse', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('A03');
  f.requestInlineSurface('A03');
  assert.equal(f.app.dataset.courtInline, 'active');
  const latest = () =>
    f
      .snapshot()
      .filter((m) => m.type === 'chaotang:inline-surface')
      .at(-1);
  assert.deepEqual(latest().rect, {
    left: 421,
    top: 258,
    width: 638,
    height: 551,
  });
  assert.equal(latest().page, 'A03');
  f.app.dataset.scroll = 'seal';
  f.clickPlain();
  assert.equal(latest().suspended, true);
  f.app.dataset.scroll = 'full';
  f.clickPlain();
  assert.equal(latest().suspended, false);
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
});

test('a host request measures the B02 treasury inner display rectangle', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B02');
  f.sent.length = 0;
  f.requestInlineSurface('B02');
  assert.deepEqual(f.snapshot(), [
    {
      type: 'chaotang:inline-surface',
      page: 'B02',
      suspended: false,
      rect: { left: 421, top: 258, width: 638, height: 551 },
    },
  ]);
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
});

test('an explicit dismiss releases the B02 lease and a re-request re-leases it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B02');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.dismissInline();
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  f.sent.length = 0;
  f.clickPlain();
  assert.equal(
    f.sent.filter((message) => message.type === 'chaotang:inline-surface')
      .length,
    0
  );
  f.requestInlineSurface('B02');
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B02',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('a narrow expanded side panel suspends the B02 surface and collapse restores it', () => {
  const f = fixture();
  f.setViewportWidth(1000);
  f.setPage('A01');
  f.clickPage('B02');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.sent.length = 0;
  f.leftPanel.classList.remove('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B02',
        suspended: true,
        rect: null,
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'suspended');
  assert.equal(f.input.readOnly, true);
  f.sent.length = 0;
  f.leftPanel.classList.add('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B02',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('collapsing the B02 scroll suspends the surface and expanding restores it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B02');
  const latest = () =>
    f
      .snapshot()
      .filter((m) => m.type === 'chaotang:inline-surface')
      .at(-1);
  assert.equal(latest().suspended, false);
  f.app.dataset.scroll = 'seal';
  f.clickPlain();
  assert.equal(latest().suspended, true);
  assert.equal(f.app.dataset.courtInline, 'suspended');
  f.app.dataset.scroll = 'full';
  f.clickPlain();
  assert.equal(latest().suspended, false);
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('leaving B02 releases the lease and restores the prototype composer', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B02');
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
  f.input.value = '未发送的户部草稿';
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  assert.equal(f.send.disabled, false);
});

test('the engineering page button opens the real gongbu panel on its B06 inner surface', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B06');
  assert.deepEqual(
    f.snapshot().filter((message) => message.type === 'chaotang:action'),
    [{ type: 'chaotang:action', action: 'gongbu' }]
  );
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B06',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
  assert.equal(f.send.disabled, true);
});

test('a host request measures the B06 engineering inner display rectangle', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B06');
  f.sent.length = 0;
  f.requestInlineSurface('B06');
  assert.deepEqual(f.snapshot(), [
    {
      type: 'chaotang:inline-surface',
      page: 'B06',
      suspended: false,
      rect: { left: 421, top: 258, width: 638, height: 551 },
    },
  ]);
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
});

test('an explicit dismiss releases the B06 lease and a re-request re-leases it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B06');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.dismissInline();
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  f.sent.length = 0;
  f.clickPlain();
  assert.equal(
    f.sent.filter((message) => message.type === 'chaotang:inline-surface')
      .length,
    0
  );
  f.requestInlineSurface('B06');
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B06',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('a narrow expanded side panel suspends the B06 surface and collapse restores it', () => {
  const f = fixture();
  f.setViewportWidth(1000);
  f.setPage('A01');
  f.clickPage('B06');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.sent.length = 0;
  f.leftPanel.classList.remove('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B06',
        suspended: true,
        rect: null,
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'suspended');
  assert.equal(f.input.readOnly, true);
  f.sent.length = 0;
  f.leftPanel.classList.add('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'B06',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('collapsing the B06 scroll suspends the surface and expanding restores it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B06');
  const latest = () =>
    f
      .snapshot()
      .filter((m) => m.type === 'chaotang:inline-surface')
      .at(-1);
  assert.equal(latest().suspended, false);
  f.app.dataset.scroll = 'seal';
  f.clickPlain();
  assert.equal(latest().suspended, true);
  assert.equal(f.app.dataset.courtInline, 'suspended');
  f.app.dataset.scroll = 'full';
  f.clickPlain();
  assert.equal(latest().suspended, false);
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('leaving B06 releases the lease and restores the prototype composer', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('B06');
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
  f.input.value = '未发送的工部草稿';
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  assert.equal(f.send.disabled, false);
});

test('a host request measures the C02 Qintian inner display rectangle like the other real pages', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('C02');
  f.sent.length = 0;
  f.requestInlineSurface('C02');
  assert.deepEqual(f.snapshot(), [
    {
      type: 'chaotang:inline-surface',
      page: 'C02',
      suspended: false,
      rect: { left: 421, top: 258, width: 638, height: 551 },
    },
  ]);
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
});

test('a host request measures the C03 Hanlin inner display rectangle like the other real pages', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('C03');
  f.sent.length = 0;
  f.requestInlineSurface('C03');
  assert.deepEqual(f.snapshot(), [
    {
      type: 'chaotang:inline-surface',
      page: 'C03',
      suspended: false,
      rect: { left: 421, top: 258, width: 638, height: 551 },
    },
  ]);
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
});

test('an explicit dismiss releases the C02 lease and a re-request re-leases it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('C02');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.dismissInline();
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  f.sent.length = 0;
  f.clickPlain();
  assert.equal(
    f.sent.filter((message) => message.type === 'chaotang:inline-surface')
      .length,
    0
  );
  f.requestInlineSurface('C02');
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'C02',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('a narrow expanded side panel suspends the C03 surface and collapse restores it', () => {
  const f = fixture();
  f.setViewportWidth(1000);
  f.setPage('A01');
  f.clickPage('C03');
  assert.equal(f.app.dataset.courtInline, 'active');
  f.sent.length = 0;
  f.leftPanel.classList.remove('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'C03',
        suspended: true,
        rect: null,
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'suspended');
  assert.equal(f.input.readOnly, true);
  f.sent.length = 0;
  f.leftPanel.classList.add('is-collapsed');
  f.resize();
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'C03',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('collapsing the C02 scroll suspends the surface and expanding restores it', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('C02');
  const latest = () =>
    f
      .snapshot()
      .filter((m) => m.type === 'chaotang:inline-surface')
      .at(-1);
  assert.equal(latest().suspended, false);
  f.app.dataset.scroll = 'seal';
  f.clickPlain();
  assert.equal(latest().suspended, true);
  assert.equal(f.app.dataset.courtInline, 'suspended');
  f.app.dataset.scroll = 'full';
  f.clickPlain();
  assert.equal(latest().suspended, false);
  assert.equal(f.app.dataset.courtInline, 'active');
});

test('a parent route sync to C03 selects it without echoing an action and still measures the surface', () => {
  const f = fixture();
  f.setPage('A01');
  f.route('C03');
  assert.deepEqual(
    f
      .snapshot()
      .filter(
        (message) =>
          message.type === 'chaotang:action' ||
          message.type === 'chaotang:navigate'
      ),
    []
  );
  assert.deepEqual(
    f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface'),
    [
      {
        type: 'chaotang:inline-surface',
        page: 'C03',
        suspended: false,
        rect: { left: 421, top: 258, width: 638, height: 551 },
      },
    ]
  );
});

test('leaving C02 releases the lease and restores the prototype composer', () => {
  const f = fixture();
  f.setPage('A01');
  f.clickPage('C02');
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.input.readOnly, true);
  f.input.value = '未发送的钦天监草稿';
  f.clickPage('A01');
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.input.readOnly, false);
  assert.equal(f.send.disabled, false);
});

test('legacy store errors never replace the active C02/C03 paper with a second chat surface', () => {
  for (const page of ['C02', 'C03']) {
    const f = fixture();
    f.clickPage(page);
    f.account('paper-owner');
    f.storeError();
    assert.equal(f.app.dataset.chatOpen, undefined);
    assert.equal(f.app.dataset.courtInline, 'active');
    assert.equal(f.input.readOnly, true);
    assert.match(f.composerHint.textContent, /历史对话暂不可用/);
  }
});

test('a truly unknown page never receives an inline surface even when requested', () => {
  const f = fixture();
  f.setPage('A01');
  // B03 is a real prototype page id but not one of the eight inline surfaces.
  f.clickPage('B03');
  f.requestInlineSurface('B03');
  assert.equal(
    f.sent.some(
      (message) =>
        message.type === 'chaotang:inline-surface' && message.page === 'B03'
    ),
    false
  );
  assert.equal(f.app.dataset.courtInline, undefined);
  assert.equal(f.send.disabled, false);
});

test('study and archives measure only the existing paper below its original header', () => {
  for (const page of ['A02', 'A06']) {
    const f = fixture();
    f.setPage('A01');
    f.clickPage(page);
    const surface = f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface')
      .at(-1);
    assert.deepEqual(surface.rect, {
      left: 421,
      top: 258,
      width: 638,
      height: 551,
    });
    assert.equal(f.input.readOnly, true);
    assert.equal(f.send.disabled, true);
  }
});

test('the original A02 footer controls remain outside the real paper rectangle', () => {
  const f = fixture();
  f.setPage('A01');
  f.displayBar.rect = {
    left: 420,
    top: 700,
    right: 1060,
    bottom: 738,
    width: 640,
    height: 38,
  };
  f.clickPage('A02');
  const surface = f
    .snapshot()
    .filter((message) => message.type === 'chaotang:inline-surface')
    .at(-1);
  assert.deepEqual(surface.rect, {
    left: 421,
    top: 211,
    width: 638,
    height: 489,
  });
  assert.ok(surface.rect.top + surface.rect.height <= f.displayBar.rect.top);
});

test('study and archives open the paper on request, honour collapse, then restore the same lease', () => {
  for (const page of ['A02', 'A06']) {
    const f = fixture();
    f.setPage('A01');
    f.clickPage(page);
    f.app.dataset.scroll = 'seal';
    f.requestInlineSurface(page);
    assert.equal(f.app.dataset.scroll, 'full');
    f.app.dataset.scroll = 'seal';
    f.clickPlain();
    let surface = f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface')
      .at(-1);
    assert.equal(surface.suspended, true);
    assert.equal(surface.rect, null);
    f.app.dataset.scroll = 'full';
    f.clickPlain();
    surface = f
      .snapshot()
      .filter((message) => message.type === 'chaotang:inline-surface')
      .at(-1);
    assert.equal(surface.suspended, false);
    assert.deepEqual(surface.rect, {
      left: 421,
      top: 258,
      width: 638,
      height: 551,
    });
  }
});

test('result catalog explicitly leases A01 paper and dismiss restores composer', () => {
  const f = fixture();
  f.setPage('A01');
  f.requestInlineSurface('A01');
  assert.equal(f.app.dataset.courtInline, 'active');
  assert.equal(f.app.dataset.scroll, 'full');
  assert.equal(f.input.readOnly, true);
  assert.equal(
    f
      .snapshot()
      .filter((x) => x.type === 'chaotang:inline-surface')
      .at(-1).page,
    'A01'
  );
  f.dismissInline();
  assert.equal(f.input.readOnly, false);
  assert.equal(f.app.dataset.courtInline, undefined);
});
