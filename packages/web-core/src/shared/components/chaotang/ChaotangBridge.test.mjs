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

function fixture() {
  const handlers = new Map();
  const documentHandlers = new Map();
  const inputHandlers = new Map();
  const timers = new Map();
  const sent = [];
  let nextTimer = 0;
  const input = {
    value: '',
    addEventListener: (type, fn) => inputHandlers.set(type, fn),
  };
  const send = { disabled: false, addEventListener() {} };
  const avatar = { textContent: '', title: '' };
  const app = { dataset: {} };
  const parent = { postMessage: (message) => sent.push(message) };
  const setTimer = (fn) => {
    const id = ++nextTimer;
    timers.set(id, fn);
    return id;
  };
  const clearTimer = (id) => timers.delete(id);
  const context = {
    window: {
      parent,
      location: { origin: 'https://isolated.invalid' },
      addEventListener: (type, fn) => handlers.set(type, fn),
      setTimeout: setTimer,
      clearTimeout: clearTimer,
    },
    document: {
      getElementById: (id) =>
        ({ app, promptInput: input, sendButton: send })[id] ?? null,
      querySelector: (selector) => (selector === '.avatar' ? avatar : null),
      addEventListener: (type, fn) => documentHandlers.set(type, fn),
    },
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    crypto: { randomUUID },
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    requestAnimationFrame: (fn) => fn(),
  };
  vm.runInNewContext(source, context, { timeout: 1000 });
  const message = (data) =>
    handlers.get('message')({
      origin: context.window.location.origin,
      source: parent,
      data,
    });
  const account = (username) =>
    message({ type: 'chaotang:status', authenticated: !!username, username });
  const load = (draft = '') =>
    message({
      type: 'chaotang:store',
      authenticated: true,
      body: JSON.stringify({
        records: {},
        selected: { A01: 'synthetic-session' },
        sessions: { 'synthetic-session': { page: 'A01', draft } },
      }),
    });
  const clickPage = (page) =>
    documentHandlers.get('click')({
      target: {
        closest: (selector) =>
          selector === '[data-page]' ? { dataset: { page } } : null,
      },
    });
  return {
    account,
    load,
    input,
    send,
    avatar,
    timers,
    sent,
    inputHandlers,
    clickPage,
  };
}

test('original study and council navigation opens real workspaces without issuing a decree', () => {
  for (const [page, action] of [
    ['A02', 'study'],
    ['A03', 'cases'],
  ]) {
    const f = fixture();
    f.clickPage(page);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].type, 'chaotang:action');
    assert.equal(f.sent[0].action, action);
  }
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
