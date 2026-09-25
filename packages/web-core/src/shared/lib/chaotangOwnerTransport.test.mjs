import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as owner from './chaotangOwnerTransport.ts';
const token = 'a'.repeat(64);
const ticket = 'b'.repeat(64);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const config = (extra = {}) => ({
  endpoint: 'http://127.0.0.1:45231',
  generation: 'gen-a',
  now: () => 1000,
  requestCapability: async (generation) => ({
    generation,
    token,
    expiresAt: 2000,
  }),
  issueWsTicket: async (path, generation) => ({
    generation,
    path,
    ticket,
    expiresAt: 2000,
  }),
  fetch: async () => new Response('ok'),
  ...extra,
});
const create = (extra = {}) => {
  assert.equal(typeof owner.createChaotangOwnerTransport, 'function');
  return owner.createChaotangOwnerTransport(config(extra));
};
class Socket extends EventTarget {
  closed = [];
  close(code, reason) {
    this.closed.push([code, reason]);
    this.dispatchEvent(new Event('close'));
  }
}

test('owner transport requires an explicit loopback origin with a port', () => {
  assert.equal(typeof owner.createChaotangOwnerTransport, 'function');
  for (const endpoint of [
    'https://example.org:123',
    'http://127.0.0.1',
    'http://127.0.0.1:123/api/',
    'http://user:password@localhost:123',
    'http://localhost:123?token=x',
    'http://127.1:123',
    'http://0x7f000001:123',
  ])
    assert.throws(() => create({ endpoint }), /loopback|本地/);
  for (const endpoint of [
    'http://localhost:123',
    'http://127.0.0.1:123/',
    'https://[::1]:123',
  ])
    create({ endpoint }).dispose();
});
test('paths cannot escape API, select another host, or inject credentials', async () => {
  let calls = 0;
  const transport = create({
    requestCapability: async () => {
      calls++;
      return { generation: 'gen-a', token, expiresAt: 2000 };
    },
  });
  for (const path of [
    'https://localhost:123/api/jobs',
    '//evil/api/jobs',
    '/other',
    '/api/../secret',
    '/api/%2e%2e/secret',
    '/api/%252e%252e/secret',
    '/api/foo%2f..%2fsecret',
    '/api/foo\\bar',
    '/api//host/a',
    '/api/host/a/jobs',
    '/api/relay-auth/client/a',
    '/api/hosts/a',
    '/api/jobs?hostId=other',
    '/api/jobs?%68ost_scope=none',
    '/api/jobs?relayHostId=x',
    '/api/jobs?token=secret',
    '/api/jobs#fragment',
    '/api/jobs\n',
  ]) {
    await assert.rejects(transport.request(path), /路径|凭据|主机/);
    await assert.rejects(transport.openWebSocket(path), /路径|凭据|主机/);
  }
  assert.equal(calls, 0);
  transport.dispose();
});
test('HTTP injects only generation capability and pins privacy options', async () => {
  const seen = [];
  const transport = create({
    fetch: async (url, init) => {
      seen.push([url, init]);
      return new Response('ok', { status: 201 });
    },
  });
  const response = await transport.request('/api/tasks?limit=2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 201);
  assert.equal(await response.text(), 'ok');
  assert.equal(seen[0][0], 'http://127.0.0.1:45231/api/tasks?limit=2');
  assert.equal(seen[0][1].headers.get('authorization'), 'Bearer ' + token);
  assert.equal(seen[0][1].headers.get('cookie'), null);
  assert.equal(seen[0][1].credentials, 'omit');
  assert.equal(seen[0][1].cache, 'no-store');
  assert.equal(seen[0][1].redirect, 'error');
  assert.equal(seen[0][1].referrerPolicy, 'no-referrer');
  assert.ok(seen[0][1].signal instanceof AbortSignal);
  transport.dispose();
});
test('HTTP options cannot switch runtime or supply caller credentials', async () => {
  let calls = 0;
  const transport = create({
    fetch: async () => {
      calls++;
      return new Response();
    },
  });
  for (const init of [
    { hostScope: 'none' },
    { hostId: null },
    { relayHostId: 'x' },
    { credentials: 'include' },
    { redirect: 'follow' },
    { headers: { Authorization: 'Bearer caller' } },
    { headers: { Cookie: 'session=caller' } },
    { headers: { 'Proxy-Authorization': 'caller' } },
  ])
    await assert.rejects(
      transport.request('/api/jobs', init),
      /凭据|主机|重定向/
    );
  await assert.rejects(
    transport.openWebSocket('/api/events', { hostScope: 'current' }),
    /主机/
  );
  assert.equal(calls, 0);
  transport.dispose();
});
test('invalid and expired capabilities never reach HTTP or a personal fallback', async () => {
  let calls = 0;
  for (const receipt of [
    { generation: 'gen-b', token, expiresAt: 2000 },
    { generation: 'gen-a', token: 'UPPERCASE', expiresAt: 2000 },
    { generation: 'gen-a', token, expiresAt: 1000 },
  ]) {
    const transport = create({
      requestCapability: async () => receipt,
      fetch: async () => {
        calls++;
        return new Response();
      },
    });
    await assert.rejects(transport.request('/api/jobs'), /代际|能力|过期/);
    transport.dispose();
  }
  assert.equal(calls, 0);
});
test('dispose promptly aborts a request waiting for capability', async () => {
  const capability = deferred();
  let calls = 0;
  const transport = create({
    requestCapability: () => capability.promise,
    fetch: async () => {
      calls++;
      return new Response();
    },
  });
  const request = transport.request('/api/jobs');
  transport.dispose();
  await assert.rejects(request, /失效|关闭/);
  capability.resolve({ generation: 'gen-a', token, expiresAt: 2000 });
  await Promise.resolve();
  assert.equal(calls, 0);
  await assert.rejects(transport.request('/api/jobs'), /失效|关闭/);
});
test('dispose aborts in-flight HTTP and discards a late response body', async () => {
  const result = deferred();
  let signal;
  let cancelled = false;
  const transport = create({
    fetch: async (_url, init) => {
      signal = init.signal;
      return result.promise;
    },
  });
  const request = transport.request('/api/jobs');
  await new Promise((r) => setImmediate(r));
  transport.dispose();
  assert.equal(signal.aborted, true);
  await assert.rejects(request, /失效|关闭/);
  result.resolve(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      })
    )
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(cancelled, true);
});
test('a returned response stream cannot emit old context data after dispose', async () => {
  let stream;
  let cancelled = false;
  const transport = create({
    fetch: async () =>
      new Response(
        new ReadableStream({
          start(c) {
            stream = c;
          },
          cancel() {
            cancelled = true;
          },
        })
      ),
  });
  const response = await transport.request('/api/stream');
  const reader = response.body.getReader();
  const read = reader.read();
  transport.dispose();
  await assert.rejects(read, /失效|关闭/);
  assert.equal(cancelled, true);
  assert.throws(() => stream.enqueue(new Uint8Array([1])));
});
test('WS tickets are exact-path bound and travel only in a protocol', async () => {
  const seen = [];
  const socket = new Socket();
  const transport = create({
    createWebSocket: (url, protocols) => {
      seen.push([url, protocols]);
      return socket;
    },
  });
  assert.equal(await transport.openWebSocket('/api/events?cursor=2'), socket);
  assert.deepEqual(seen, [
    ['ws://127.0.0.1:45231/api/events?cursor=2', ['fusion-ticket.' + ticket]],
  ]);
  await assert.rejects(transport.openWebSocket('/api/events?cursor=2'), /票据/);
  transport.dispose();
  assert.equal(socket.closed.length, 1);
  for (const receipt of [
    { generation: 'gen-b', path: '/api/events', ticket, expiresAt: 2000 },
    { generation: 'gen-a', path: '/api/other', ticket, expiresAt: 2000 },
    {
      generation: 'gen-a',
      path: '/api/events',
      ticket: ticket.toUpperCase(),
      expiresAt: 2000,
    },
    { generation: 'gen-a', path: '/api/events', ticket, expiresAt: 999 },
  ]) {
    const t = create({
      issueWsTicket: async () => receipt,
      createWebSocket: () => {
        throw new Error('must not open');
      },
    });
    await assert.rejects(t.openWebSocket('/api/events'), /票据|代际|过期/);
    t.dispose();
  }
});
test('dispose closes a late asynchronous WS and rejects old-generation caller', async () => {
  const result = deferred();
  let started = false;
  const socket = new Socket();
  const transport = create({
    createWebSocket: () => {
      started = true;
      return result.promise;
    },
  });
  const connection = transport.openWebSocket('/api/events');
  await new Promise((r) => setImmediate(r));
  assert.equal(started, true);
  transport.dispose();
  await assert.rejects(connection, /失效|关闭/);
  result.resolve(socket);
  await new Promise((r) => setImmediate(r));
  assert.equal(socket.closed.length, 1);
});
test('caller abort cancels a request without retiring the active runtime', async () => {
  let first = true;
  const transport = create({
    fetch: async () => {
      if (first) {
        first = false;
        return new Promise(() => {});
      }
      return new Response('ok');
    },
  });
  const controller = new AbortController();
  const request = transport.request('/api/jobs', { signal: controller.signal });
  await new Promise((r) => setImmediate(r));
  controller.abort();
  await assert.rejects(request, (error) => error.name === 'AbortError');
  assert.equal(await (await transport.request('/api/jobs')).text(), 'ok');
  transport.dispose();
});

test('response diagnostics and cloned streams remain generation scoped', async () => {
  const original = new Response('private body');
  Object.defineProperty(original, 'url', {
    value: 'http://127.0.0.1:45231/api/jobs',
  });
  const transport = create({ fetch: async () => original });
  const response = await transport.request('/api/jobs');
  assert.equal(response.url, original.url);
  const copy = response.clone();
  assert.equal(await response.text(), 'private body');
  transport.dispose();
  await assert.rejects(copy.text(), /失效|关闭/);
  assert.throws(() => copy.clone(), /失效|关闭/);
});
test('native credential acquisition errors never expose native credentials', async () => {
  const transport = create({
    requestCapability: async () => {
      throw new Error('secret-token:' + token);
    },
    issueWsTicket: async () => {
      throw new Error('secret-ticket:' + ticket);
    },
  });
  await assert.rejects(
    transport.request('/api/jobs'),
    (error) =>
      error.code === 'capability_unavailable' && !error.message.includes(token)
  );
  await assert.rejects(
    transport.openWebSocket('/api/events'),
    (error) =>
      error.code === 'ticket_unavailable' && !error.message.includes(ticket)
  );
  transport.dispose();
});
