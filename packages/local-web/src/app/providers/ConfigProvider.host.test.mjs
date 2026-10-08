import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToString } = require('react-dom/server');
const ts = require('typescript');

// Render the actual provider; only its IO/controller dependencies are mocked.
// The final browser check separately verifies the real query sends no request.
function loadProvider() {
  const calls = [];
  const apiCalls = [];
  const context = React.createContext(null);
  const source = readFileSync(
    new URL('./ConfigProvider.tsx', import.meta.url),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const dependencies = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/shared/lib/api': {
      configApi: {
        getConfig: async () => {
          apiCalls.push('get');
          return { config: null };
        },
        saveConfig: async () => {
          apiCalls.push('save');
          return {};
        },
      },
    },
    '@/i18n/config': { updateLanguageFromConfig() {} },
    '@/shared/lib/remoteApi': { setRemoteApiBase() {} },
    '@/shared/hooks/useUserSystemController': {
      useUserSystemController(options) {
        calls.push(options);
        return { value: { config: null }, userSystemInfo: undefined };
      },
    },
    '@/shared/hooks/useUserSystem': { UserSystemContext: context },
    '@/shared/lib/auth/tokenManager': {
      tokenManager: { syncRecoveryState() {} },
    },
  };
  runInNewContext(compiled, {
    exports: module.exports,
    module,
    require(name) {
      assert.ok(
        Object.hasOwn(dependencies, name),
        'Unexpected dependency: ' + name
      );
      return dependencies[name];
    },
  });
  return { Provider: module.exports.UserSystemProvider, calls, apiCalls };
}

test('an explicit browser-only profile disables the desktop configuration query', () => {
  const { Provider, calls } = loadProvider();
  renderToString(
    React.createElement(Provider, { hostConfigurationEnabled: false }, 'court')
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].enabled ?? true, false);
  assert.equal(calls[0].queryKey.join('/'), 'user-system/local');
});

for (const enabled of [undefined, true]) {
  test('desktop configuration remains available with ' + enabled, async () => {
    const { Provider, calls, apiCalls } = loadProvider();
    renderToString(
      React.createElement(
        Provider,
        { hostConfigurationEnabled: enabled },
        'court'
      )
    );
    assert.equal(calls[0].enabled ?? true, true);
    await calls[0].load();
    assert.deepEqual(apiCalls, ['get']);
  });
}
