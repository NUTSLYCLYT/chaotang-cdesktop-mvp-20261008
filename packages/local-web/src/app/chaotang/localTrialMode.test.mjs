import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseLocalTrialTransport } from './localTrialMode.ts';

const browser = {
  dev: false,
  acceptance: undefined,
  localTrial: undefined,
  protocol: 'http:',
  hostname: '127.0.0.1',
  nativeShell: false,
};

test('ordinary production and native desktop keep their original transport', () => {
  assert.equal(shouldUseLocalTrialTransport(browser), false);
  assert.equal(shouldUseLocalTrialTransport({ ...browser, acceptance: '1' }), false);
  assert.equal(
    shouldUseLocalTrialTransport({ ...browser, localTrial: 'true' }),
    false
  );
  assert.equal(
    shouldUseLocalTrialTransport({ ...browser, localTrial: '1', nativeShell: true }),
    false
  );
});

test('explicit frozen local profile uses the same HTTP client as dev acceptance', () => {
  assert.equal(shouldUseLocalTrialTransport({ ...browser, localTrial: '1' }), true);
  assert.equal(
    shouldUseLocalTrialTransport({ ...browser, dev: true, acceptance: '1' }),
    true
  );
  assert.equal(shouldUseLocalTrialTransport({ ...browser, dev: true }), false);
});

test('local profile never activates on a public host or non-http origin', () => {
  for (const hostname of [
    'example.com',
    '127.0.0.1.example.com',
    'localhost',
    '192.168.1.2',
  ]) {
    assert.equal(
      shouldUseLocalTrialTransport({ ...browser, localTrial: '1', hostname }),
      false
    );
  }
  for (const protocol of ['file:', 'tauri:', 'https:']) {
    assert.equal(
      shouldUseLocalTrialTransport({ ...browser, localTrial: '1', protocol }),
      false
    );
  }
});
