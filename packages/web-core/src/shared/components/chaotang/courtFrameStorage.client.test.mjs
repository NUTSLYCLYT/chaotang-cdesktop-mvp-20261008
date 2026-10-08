import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../../../../../public/chaotang-frame-storage.js', import.meta.url),
  'utf8'
);
function fixture(document = { activeElement: null }) {
  const sent = [],
    notices = [],
    handlers = [],
    timers = new Map();
  let nextTimer = 0;
  const parent = {
    postMessage: (data, origin, ports) => sent.push({ data, origin, ports }),
  };
  let pagehide;
  class MessageChannel {
    constructor() {
      this.port1 = {
        postMessage: (data) => this.port2.onmessage?.({ data }),
        onmessage: null,
        closed: false,
        start() {},
        close() {
          this.closed = true;
        },
      };
      this.port2 = {
        postMessage: (data) => {
          if (!this.port1.closed) this.port1.onmessage?.({ data });
        },
      };
    }
  }
  const window = {
    parent,
    location: {
      origin: 'http://127.0.0.1:5216',
      search: '?bridgeNonce=document-one',
    },
    get localStorage() {
      throw new Error('Storage denied in opaque frame');
    },
    addEventListener: (type, fn) => {
      if (type === 'message') handlers.push(fn);
      if (type === 'pagehide') pagehide = fn;
    },
    dispatchEvent: (event) => {
      if (event.type === 'message') handlers.forEach((fn) => fn(event));
      else notices.push(event.type);
    },
  };
  vm.runInNewContext(source, {
    window,
    document,
    URLSearchParams,
    MessageChannel,
    crypto: { randomUUID },
    MessageEvent: class {
      constructor(type, options) {
        this.type = type;
        Object.assign(this, options);
      }
    },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    setTimeout(fn) {
      const id = ++nextTimer;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  const receive = (data, overrides = {}) =>
    handlers.forEach((fn) =>
      fn({ source: parent, origin: window.location.origin, data, ...overrides })
    );
  const snapshot = () =>
    receive({
      type: 'chaotang:demo-storage',
      values: { 'chaotang-demo-onboarding-v2': '{"skipped":true}' },
      available: true,
    });
  const ack = (request, ok) =>
    receive({
      type: 'chaotang:demo-storage-saved',
      requestId: request.data.requestId,
      ok,
    });
  return {
    window,
    sent,
    notices,
    timers,
    receive,
    snapshot,
    ack,
    pagehide: () => pagehide(),
    storage: window.CHAOTANG_DEMO_STORAGE,
  };
}

test('untrusted source/origin cannot inject preference snapshots', async () => {
  const f = fixture();
  for (const overrides of [
    { source: {} },
    { origin: 'https://foreign.invalid' },
  ]) {
    f.receive(
      {
        type: 'chaotang:demo-storage',
        values: { fake: 'injected' },
        available: true,
      },
      overrides
    );
    assert.equal(f.storage.getItem('fake'), null);
  }
  f.snapshot();
  await f.storage.ready;
  assert.equal(
    f.storage.getItem('chaotang-demo-onboarding-v2'),
    '{"skipped":true}'
  );
});

test('write carries the document identity and waits for authentic host ACK', async () => {
  const f = fixture();
  f.snapshot();
  let finished = false;
  const write = f.storage
    .setItem('chaotang-demo-onboarding-v2', '{"skipped":false}')
    .then((ok) => {
      finished = true;
      return ok;
    });
  const request = f.sent.at(-1);
  assert.equal(request.data.bridgeNonce, 'document-one');
  assert.equal(request.origin, 'http://127.0.0.1:5216');
  f.receive(
    {
      type: 'chaotang:demo-storage-saved',
      requestId: request.data.requestId,
      ok: true,
    },
    { source: {} }
  );
  await Promise.resolve();
  assert.equal(finished, false);
  f.ack(request, true);
  assert.equal(await write, true);
});

test('rejection restores the mirror and never reports successful saving', async () => {
  const f = fixture();
  f.snapshot();
  const write = f.storage.setItem(
    'chaotang-demo-onboarding-v2',
    '{"skipped":false}'
  );
  f.ack(f.sent.at(-1), false);
  assert.equal(await write, false);
  assert.equal(
    f.storage.getItem('chaotang-demo-onboarding-v2'),
    '{"skipped":true}'
  );
  assert.deepEqual(f.notices, ['chaotang:preference-save-failed']);
});

test('older failed write cannot roll back a newer identical value', async () => {
  const f = fixture();
  f.snapshot();
  const a = f.storage.setItem(
    'chaotang-demo-onboarding-v2',
    '{"skipped":false}'
  );
  const requestA = f.sent.at(-1);
  const b = f.storage.setItem(
    'chaotang-demo-onboarding-v2',
    '{"skipped":false}'
  );
  f.ack(requestA, false);
  f.ack(f.sent.at(-1), true);
  assert.equal(await a, false);
  assert.equal(await b, true);
  assert.equal(
    f.storage.getItem('chaotang-demo-onboarding-v2'),
    '{"skipped":false}'
  );
});

test('unavailable host fails saving and releases startup without pretending persistence', async () => {
  const f = fixture();
  for (const timeout of [...f.timers.values()]) timeout();
  await f.storage.ready;
  assert.equal(
    await f.storage.setItem('chaotang-demo-onboarding-v2', '{}'),
    false
  );
  assert.equal(
    f.sent.filter((request) => request.data.type !== 'chaotang:bridge-ready')
      .length,
    0
  );
});

test('unknown ACK does not settle a write, and timeout fails it', async () => {
  const f = fixture();
  f.snapshot();
  const write = f.storage.setItem('chaotang-demo-onboarding-v2', '{}');
  f.receive({
    type: 'chaotang:demo-storage-saved',
    requestId: 'other-request',
    ok: true,
  });
  for (const timeout of [...f.timers.values()]) timeout();
  assert.equal(await write, false);
});

test('only the authentic parent can restore the last business trigger once', () => {
  let focusCalls = 0;
  const target = {
    isConnected: true,
    focus() {
      focusCalls++;
    },
  };
  const f = fixture({ activeElement: target });
  f.window.CHAOTANG_PARENT.postMessage(
    { type: 'chaotang:action', action: 'results' },
    f.window.location.origin
  );
  for (const overrides of [
    { source: {} },
    { origin: 'https://foreign.invalid' },
  ])
    f.receive({ type: 'chaotang:restore-focus' }, overrides);
  assert.equal(focusCalls, 0);
  f.receive({ type: 'chaotang:restore-focus' });
  assert.equal(focusCalls, 1);
  f.receive({ type: 'chaotang:restore-focus' });
  assert.equal(focusCalls, 1);
});

test('removed triggers cannot be focused and ordinary storage writes do not capture focus', () => {
  let focusCalls = 0;
  const target = {
    isConnected: true,
    focus() {
      focusCalls++;
    },
  };
  const f = fixture({ activeElement: target });
  f.window.CHAOTANG_PARENT.postMessage(
    { type: 'chaotang:store-load' },
    f.window.location.origin
  );
  f.receive({ type: 'chaotang:restore-focus' });
  assert.equal(focusCalls, 0);
  f.window.CHAOTANG_PARENT.postMessage(
    { type: 'chaotang:action', action: 'results' },
    f.window.location.origin
  );
  target.isConnected = false;
  f.receive({ type: 'chaotang:restore-focus' });
  assert.equal(focusCalls, 0);
});

test('child-owned channel carries replies only while this document is alive', async () => {
  const f = fixture();
  const handshake = f.sent.find(
    (request) => request.data.type === 'chaotang:bridge-ready'
  );
  assert.equal(handshake.data.bridgeNonce, 'document-one');
  assert.equal(handshake.ports.length, 1);
  handshake.ports[0].postMessage({
    type: 'chaotang:demo-storage',
    values: { example: 'first' },
    available: true,
  });
  await f.storage.ready;
  assert.equal(f.storage.getItem('example'), 'first');
  const lifecycle = [];
  handshake.ports[0].onmessage = (event) => lifecycle.push(event.data.type);
  f.pagehide();
  assert.deepEqual(lifecycle, ['chaotang:bridge-closed']);
  handshake.ports[0].postMessage({
    type: 'chaotang:demo-storage',
    values: { example: 'after-navigation' },
    available: true,
  });
  assert.equal(f.storage.getItem('example'), 'first');
});
