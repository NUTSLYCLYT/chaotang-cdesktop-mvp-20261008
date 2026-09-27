import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';

const root = resolve(import.meta.dirname, '../../../../../..');
const compiled = await build({
  entryPoints: [resolve(import.meta.dirname, 'ChaotangProvider.tsx')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'controlled-provider-hooks',
      setup(b) {
        b.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, (args) => ({
          path: args.path,
          namespace: 'stub',
        }));
        b.onResolve({ filter: /^@tanstack\/react-query$/ }, () => ({
          path: 'query',
          namespace: 'stub',
        }));
        b.onResolve({ filter: /^@\/shared\/lib\/chaotangFusion$/ }, () => ({
          path: resolve(
            root,
            'desktop/packages/web-core/src/shared/lib/chaotangFusion.ts'
          ),
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
          contents:
            path === 'react/jsx-runtime'
              ? 'export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;'
              : path === 'query'
                ? 'export const useQueryClient=()=>globalThis.__providerHarness.query;'
                : `export const createContext=value=>({Provider:Symbol(),value});
         export const useContext=c=>c.value;
         export const useCallback=fn=>fn;export const useMemo=fn=>fn();export const useEffect=()=>{};
         export const useRef=value=>globalThis.__providerHarness.ref(value);
         export const useState=value=>globalThis.__providerHarness.state(value);`,
        }));
      },
    },
  ],
});
const { ChaotangProvider } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness() {
  const slots = [];
  let cursor = 0;
  const query = {
    cancelQueries: async () => {},
    removeQueries: () => {},
    getMutationCache: () => ({ getAll: () => [], remove: () => {} }),
  };
  globalThis.__providerHarness = {
    query,
    ref(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: value };
      return slots[i];
    },
    state(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [
        slots[i],
        (next) => {
          slots[i] = typeof next === 'function' ? next(slots[i]) : next;
        },
      ];
    },
  };
  let owner = 'A';
  const healthRequests = [];
  const userRequests = [];
  const client = {
    health: () => healthRequests.shift()(),
    currentUser: async () =>
      userRequests.length ? userRequests.shift()() : { id: owner },
    login: async (id) => {
      owner = id;
      return { id };
    },
    register: async (id) => {
      owner = id;
      return { id };
    },
    logout: async () => {
      owner = null;
    },
  };
  const render = () => {
    cursor = 0;
    return ChaotangProvider({ client, children: null }).props.children.props
      .value;
  };
  return { render, healthRequests, userRequests, client, query };
}
const healthA = {
  status: 'ok',
  service: 'test',
  version: 'A',
  baseUrl: 'http://test.invalid',
};
const healthB = { ...healthA, version: 'B' };

test('logout failure stays visible after the account content is hidden', async () => {
  const h = harness();
  try {
    await h.render().login('A', 'synthetic');
    const result = deferred();
    h.client.logout = () => result.promise;
    const pending = h.render().logout();
    assert.equal(h.render().user, null);
    assert.equal(h.render().isLoggingOut, true);
    result.reject(new Error('private server failure'));
    await assert.rejects(pending, /退出未能完整确认/);
    assert.equal(h.render().isLoggingOut, false);
    assert.match(h.render().logoutNotice, /退出未能完整确认/);
    assert.doesNotMatch(h.render().logoutNotice, /private server/);
    await h.render().login('B', 'synthetic');
    assert.equal(h.render().logoutNotice, null);
    assert.equal(h.render().user.id, 'B');
  } finally {
    delete globalThis.__providerHarness;
  }
});

test('failed cache cleanup does not skip server session revocation', async () => {
  const h = harness();
  try {
    await h.render().login('A', 'synthetic');
    let revoked = false;
    h.query.cancelQueries = async () => {
      throw new Error('cache cleanup failed');
    };
    h.client.logout = async () => {
      revoked = true;
    };
    await assert.rejects(h.render().logout(), /退出未能完整确认/);
    assert.equal(revoked, true);
    assert.equal(h.render().user, null);
    assert.equal(h.render().isLoggingOut, false);
  } finally {
    delete globalThis.__providerHarness;
  }
});

test('late logout failure cannot add a warning to a newer account', async () => {
  const h = harness();
  try {
    await h.render().login('A', 'synthetic');
    const result = deferred();
    h.client.logout = () => result.promise;
    const old = h.render().logout();
    const oldRejected = assert.rejects(old, /退出未能完整确认/);
    const next = h.render().login('B', 'synthetic');
    result.reject(new Error('old logout failed'));
    await oldRejected;
    await next;
    assert.equal(h.render().user.id, 'B');
    assert.equal(h.render().logoutNotice, null);
    assert.equal(h.render().isLoggingOut, false);
  } finally {
    delete globalThis.__providerHarness;
  }
});

test('a rejected old-account refresh cannot mark the newly authenticated owner offline', async () => {
  const h = harness();
  try {
    h.healthRequests.push(async () => healthA);
    await h.render().refresh();
    const old = deferred();
    h.healthRequests.push(() => old.promise);
    const pending = h.render().refresh();
    await h.render().login('B', 'synthetic');
    h.healthRequests.push(async () => healthB);
    await h.render().refresh();
    old.reject(new Error('old A refresh failed'));
    await pending;
    const actual = h.render();
    assert.equal(actual.user.id, 'B');
    assert.deepEqual(actual.health, healthB);
    assert.equal(actual.error, null);
  } finally {
    delete globalThis.__providerHarness;
  }
});

test('newer same-owner refresh owns health, error and checking state', async () => {
  const h = harness();
  try {
    const old = deferred(),
      current = deferred();
    h.healthRequests.push(
      () => old.promise,
      () => current.promise
    );
    const a = h.render().refresh(),
      b = h.render().refresh();
    old.reject(new Error('superseded'));
    await a;
    const pending = h.render();
    current.resolve(healthB);
    await b;
    assert.equal(pending.isChecking, true);
    assert.equal(pending.error, null);
    const slow = deferred();
    h.healthRequests.push(
      () => slow.promise,
      async () => healthB
    );
    const c = h.render().refresh();
    await h.render().refresh();
    slow.resolve(healthA);
    await c;
    assert.deepEqual(h.render().health, healthB);
  } finally {
    delete globalThis.__providerHarness;
  }
});

test('same-owner superseded currentUser response cannot replace the latest user', async () => {
  const h = harness();
  try {
    const oldUser = deferred();
    h.healthRequests.push(
      async () => healthA,
      async () => healthB
    );
    h.userRequests.push(
      () => oldUser.promise,
      async () => ({ id: 'current' })
    );
    const old = h.render().refresh();
    await Promise.resolve();
    await h.render().refresh();
    oldUser.resolve({ id: 'stale' });
    await old;
    assert.equal(h.render().user.id, 'current');
  } finally {
    delete globalThis.__providerHarness;
  }
});

for (const operation of ['login', 'register', 'logout'])
  test(`${operation} supersedes pending connection checking without leaving it stuck`, async () => {
    const h = harness();
    try {
      const old = deferred();
      h.healthRequests.push(() => old.promise);
      const pending = h.render().refresh();
      await h.render()[operation]('B', 'synthetic', 'synthetic');
      const afterAuth = h.render();
      old.resolve(healthA);
      await pending;
      assert.equal(afterAuth.isChecking, false);
      assert.equal(h.render().error, null);
    } finally {
      delete globalThis.__providerHarness;
    }
  });

test('a successful old-account refresh cannot replace the new owners health', async () => {
  const h = harness();
  try {
    const old = deferred();
    h.healthRequests.push(() => old.promise);
    const pending = h.render().refresh();
    await h.render().login('B', 'synthetic');
    h.healthRequests.push(async () => healthB);
    await h.render().refresh();
    old.resolve(healthA);
    await pending;
    const actual = h.render();
    assert.equal(actual.user.id, 'B');
    assert.deepEqual(actual.health, healthB);
  } finally {
    delete globalThis.__providerHarness;
  }
});

test('authentication generation changes for same-owner relogin and logout', async () => {
  const h = harness();
  try {
    const initial = h.render().authGeneration;
    await h.render().login('A', 'synthetic');
    const first = h.render().authGeneration;
    await h.render().login('A', 'synthetic');
    const second = h.render().authGeneration;
    await h.render().logout();
    const loggedOut = h.render().authGeneration;
    assert.equal(initial, 0);
    assert.ok(first > initial);
    assert.ok(second > first);
    assert.ok(loggedOut > second);
  } finally {
    delete globalThis.__providerHarness;
  }
});

test('old-account refresh finally cannot end a new owners pending connection check', async () => {
  const h = harness();
  try {
    const old = deferred();
    h.healthRequests.push(() => old.promise);
    const oldPending = h.render().refresh();
    await h.render().login('B', 'synthetic');
    const current = deferred();
    h.healthRequests.push(() => current.promise);
    const currentPending = h.render().refresh();
    old.reject(new Error('old A request failed'));
    await oldPending;
    const whilePending = h.render();
    current.resolve(healthB);
    await currentPending;
    assert.equal(whilePending.user.id, 'B');
    assert.equal(whilePending.isChecking, true);
  } finally {
    delete globalThis.__providerHarness;
  }
});
