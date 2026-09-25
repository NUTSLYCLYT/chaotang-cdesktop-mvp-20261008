import type {
  LocalApiRequestOptions,
  LocalApiTransport,
  LocalApiWebSocketOptions,
} from './localApiTransport';

export interface OwnerRuntimeCapability {
  generation: string;
  token: string;
  /** UTC Unix milliseconds, never seconds. */
  expiresAt: number;
}
export interface OwnerRuntimeWsTicket {
  generation: string;
  /** Exact validated API path including its query string. */
  path: string;
  ticket: string;
  expiresAt: number;
}
export interface ChaotangOwnerTransportOptions {
  endpoint: string;
  generation: string;
  // Native authenticates the current owner. JavaScript cannot nominate an owner.
  requestCapability(generation: string): Promise<OwnerRuntimeCapability>;
  issueWsTicket(
    path: string,
    generation: string
  ): Promise<OwnerRuntimeWsTicket>;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  createWebSocket?: (
    url: string,
    protocols: string[]
  ) => WebSocket | Promise<WebSocket>;
  now?: () => number;
}
export interface ChaotangOwnerTransport extends LocalApiTransport {
  readonly generation: string;
  dispose(): void;
}

export class OwnerRuntimeTransportError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'OwnerRuntimeTransportError';
    this.code = code;
  }
}
const failure = (code: string, message: string) =>
  new OwnerRuntimeTransportError(code, message);
const stale = () =>
  failure(
    'generation_expired',
    '专用工作区代际已失效或关闭，请重新打开任务工作区'
  );
const hexSecret = /^[a-f0-9]{64}$/;
const hostKeys = new Set([
  'host',
  'hostscope',
  'hostid',
  'relayhostid',
  'relay',
  'relayurl',
]);
const credentialKeys = new Set([
  'authorization',
  'token',
  'accesstoken',
  'ticket',
  'capability',
  'password',
  'cookie',
]);

function loopbackOrigin(endpoint: string): string {
  const matched =
    /^(https?):\/\/(127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})\/?$/.exec(
      endpoint
    );
  if (!matched || Number(matched[3]) < 1 || Number(matched[3]) > 65535)
    throw failure(
      'invalid_endpoint',
      '专用工作区必须使用带显式端口的本地 loopback origin'
    );
  return new URL(endpoint).origin;
}
function validatePath(path: string): string {
  const badPath = () =>
    failure('invalid_path', '专用工作区仅允许安全的相对 /api/ 路径');
  if (
    typeof path !== 'string' ||
    path.length > 8192 ||
    !path.startsWith('/api/') ||
    /[\s\\#]/.test(path)
  )
    throw badPath();
  const pathname = path.split('?', 1)[0];
  if (/%(?:2f|5c|25)/i.test(pathname)) throw badPath();
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw badPath();
  }
  if (
    /[\s\\?#\x00-\x1f\x7f]/.test(decoded) ||
    decoded.includes('//') ||
    decoded.split('/').some((part) => part === '.' || part === '..')
  )
    throw badPath();
  if (
    /^\/api\/(?:hosts?|relay(?:-auth)?|open-remote-editor)(?:\/|$)/i.test(
      decoded
    )
  )
    throw failure('host_switch_forbidden', '专用工作区不允许切换主机或中继');
  const query = path.indexOf('?') < 0 ? '' : path.slice(path.indexOf('?') + 1);
  for (const [rawKey, value] of new URLSearchParams(query)) {
    let key = rawKey;
    try {
      for (let i = 0; key.includes('%') && i < 4; i++)
        key = decodeURIComponent(key);
    } catch {
      throw badPath();
    }
    if (key.includes('%') || /[\\\x00-\x1f\x7f]/.test(key + value))
      throw badPath();
    const normalized = key.replace(/[-_]/g, '').toLowerCase();
    if (hostKeys.has(normalized))
      throw failure('host_switch_forbidden', '请求路径不允许指定主机或中继');
    if (credentialKeys.has(normalized))
      throw failure(
        'caller_credential_forbidden',
        '请求路径不允许携带调用方凭据'
      );
  }
  return path;
}
function rejectHostOptions(options: LocalApiWebSocketOptions): void {
  if (['hostScope', 'hostId', 'relayHostId'].some((key) => key in options))
    throw failure(
      'host_switch_forbidden',
      '专用工作区不允许调用方切换主机或中继'
    );
}
function requestHeaders(init: LocalApiRequestOptions): Headers {
  rejectHostOptions(init);
  if (init.credentials !== undefined && init.credentials !== 'omit')
    throw failure(
      'caller_credential_forbidden',
      '专用工作区不允许携带浏览器凭据'
    );
  if (init.redirect !== undefined && init.redirect !== 'error')
    throw failure('redirect_forbidden', '专用工作区不允许自动重定向');
  let headers: Headers;
  try {
    headers = new Headers(init.headers);
  } catch {
    throw failure('invalid_headers', '请求头格式无效，不能携带调用方凭据');
  }
  for (const name of headers.keys()) {
    if (
      /authorization|cookie|token|capability|ticket/i.test(name) ||
      ['host', 'origin', 'sec-websocket-protocol', 'x-forwarded-host'].includes(
        name
      )
    )
      throw failure(
        'caller_credential_forbidden',
        '请求头不允许覆盖专用工作区凭据'
      );
  }
  return headers;
}

/** Does not install itself globally, choose an owner, or fall back to a personal runtime. */
export function createChaotangOwnerTransport(
  options: ChaotangOwnerTransportOptions
): ChaotangOwnerTransport {
  const origin = loopbackOrigin(options.endpoint);
  const generation = options.generation;
  if (
    typeof generation !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(generation)
  )
    throw failure('invalid_generation', '专用工作区代际格式无效');
  const now = options.now ?? Date.now;
  const requestFetch =
    options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const createSocket =
    options.createWebSocket ??
    ((url, protocols) => new WebSocket(url, protocols));
  let disposed = false;
  const operations = new Set<AbortController>();
  const sockets = new Set<WebSocket>();
  const usedTickets = new Set<string>();
  const assertActive = () => {
    if (disposed) throw stale();
  };
  const closeSocket = (socket: WebSocket) => {
    sockets.delete(socket);
    try {
      socket.close(1000, 'Owner runtime closed');
    } catch {
      /* Already closed or still connecting. */
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const controller of operations) controller.abort(stale());
    operations.clear();
    for (const socket of sockets) closeSocket(socket);
    usedTickets.clear();
  };
  function validateGeneration(receiptGeneration: string) {
    assertActive();
    if (receiptGeneration !== generation) {
      dispose();
      throw stale();
    }
  }
  function validExpiry(expiresAt: number) {
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now())
      throw failure(
        'capability_expired',
        '专用工作区能力或票据已过期，请重新请求'
      );
  }
  function operation(external?: AbortSignal | null) {
    assertActive();
    const controller = new AbortController();
    const abort = () =>
      controller.abort(new DOMException('请求已取消', 'AbortError'));
    if (external?.aborted) abort();
    else external?.addEventListener('abort', abort, { once: true });
    operations.add(controller);
    return {
      controller,
      finish: () => {
        operations.delete(controller);
        external?.removeEventListener('abort', abort);
      },
    };
  }
  function wait<T>(
    promise: Promise<T>,
    signal: AbortSignal,
    late?: (value: T) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const abort = () => {
        if (!settled) {
          settled = true;
          reject(signal.reason ?? stale());
        }
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      promise.then(
        (value) => {
          signal.removeEventListener('abort', abort);
          if (settled) {
            late?.(value);
            return;
          }
          settled = true;
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', abort);
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      );
    });
  }
  async function credential<T>(
    acquire: () => Promise<T>,
    signal: AbortSignal,
    kind: 'capability' | 'ticket'
  ): Promise<T> {
    try {
      return await wait(
        Promise.resolve().then(() => {
          assertActive();
          if (signal.aborted) throw signal.reason;
          return acquire();
        }),
        signal
      );
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof OwnerRuntimeTransportError) throw error;
      throw failure(
        `${kind}_unavailable`,
        '专用工作区能力或票据获取失败，请重新打开任务工作区'
      );
    }
  }
  function guardedResponse(
    response: Response,
    context: ReturnType<typeof operation>,
    metadata = {
      url: response.url,
      type: response.type,
      redirected: response.redirected,
    }
  ): Response {
    if (!response.body) {
      context.finish();
      return response;
    }
    const reader = response.body.getReader();
    let ended = false;
    let output: ReadableStreamDefaultController<Uint8Array>;
    const signal = context.controller.signal;
    const finish = () => {
      signal.removeEventListener('abort', abort);
      context.finish();
    };
    const abort = () => {
      if (ended) return;
      ended = true;
      void reader.cancel(signal.reason).catch(() => undefined);
      output.error(signal.reason ?? stale());
      finish();
    };
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          output = controller;
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        },
        async pull(controller) {
          try {
            assertActive();
            const chunk = await reader.read();
            assertActive();
            if (ended) return;
            if (chunk.done) {
              ended = true;
              controller.close();
              finish();
            } else controller.enqueue(chunk.value);
          } catch (error) {
            if (!ended) {
              ended = true;
              controller.error(error);
              void reader.cancel(error).catch(() => undefined);
              finish();
            }
          }
        },
        async cancel(reason) {
          ended = true;
          try {
            await reader.cancel(reason);
          } finally {
            finish();
          }
        },
      },
      { highWaterMark: 0 }
    );
    const wrapped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    const clone = wrapped.clone.bind(wrapped);
    Object.defineProperties(wrapped, {
      url: { value: metadata.url },
      type: { value: metadata.type },
      redirected: { value: metadata.redirected },
      clone: {
        value: () => {
          assertActive();
          const clonedContext = operation();
          try {
            return guardedResponse(clone(), clonedContext, metadata);
          } catch (error) {
            clonedContext.finish();
            throw error;
          }
        },
      },
    });
    return wrapped;
  }
  return {
    generation,
    dispose,
    async request(path, init = {}) {
      assertActive();
      const approvedPath = validatePath(path);
      const headers = requestHeaders(init);
      const context = operation(init.signal);
      const signal = context.controller.signal;
      let response: Response | undefined;
      try {
        const receipt = await credential(
          () => options.requestCapability(generation),
          signal,
          'capability'
        );
        if (!receipt || typeof receipt !== 'object')
          throw failure('invalid_capability', '专用工作区能力格式无效');
        validateGeneration(receipt.generation);
        validExpiry(receipt.expiresAt);
        if (typeof receipt.token !== 'string' || !hexSecret.test(receipt.token))
          throw failure('invalid_capability', '专用工作区能力格式无效');
        headers.set('Authorization', `Bearer ${receipt.token}`);
        response = await wait<Response>(
          Promise.resolve().then(() => {
            assertActive();
            if (signal.aborted) throw signal.reason;
            return requestFetch(origin + approvedPath, {
              ...init,
              headers,
              signal,
              credentials: 'omit',
              cache: 'no-store',
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              referrer: '',
              mode: 'cors',
            });
          }),
          signal,
          (response) => {
            void response.body?.cancel().catch(() => undefined);
          }
        );
        assertActive();
        return guardedResponse(response, context);
      } catch (error) {
        void response?.body?.cancel().catch(() => undefined);
        context.finish();
        throw error;
      }
    },
    async openWebSocket(path, init = {}) {
      assertActive();
      const approvedPath = validatePath(path);
      rejectHostOptions(init);
      const context = operation();
      const signal = context.controller.signal;
      try {
        const receipt = await credential(
          () => options.issueWsTicket(approvedPath, generation),
          signal,
          'ticket'
        );
        if (!receipt || typeof receipt !== 'object')
          throw failure('invalid_ws_ticket', '专用工作区票据格式无效');
        validateGeneration(receipt.generation);
        validExpiry(receipt.expiresAt);
        if (
          receipt.path !== approvedPath ||
          typeof receipt.ticket !== 'string' ||
          !hexSecret.test(receipt.ticket) ||
          usedTickets.has(receipt.ticket)
        )
          throw failure(
            'invalid_ws_ticket',
            '专用工作区单次票据无效或路径不匹配'
          );
        usedTickets.add(receipt.ticket);
        const socket = await wait(
          Promise.resolve().then(() => {
            assertActive();
            return createSocket(origin.replace(/^http/, 'ws') + approvedPath, [
              `fusion-ticket.${receipt.ticket}`,
            ]);
          }),
          signal,
          closeSocket
        );
        if (disposed) {
          closeSocket(socket);
          throw stale();
        }
        sockets.add(socket);
        socket.addEventListener('close', () => sockets.delete(socket), {
          once: true,
        });
        return socket;
      } finally {
        context.finish();
      }
    },
  };
}
