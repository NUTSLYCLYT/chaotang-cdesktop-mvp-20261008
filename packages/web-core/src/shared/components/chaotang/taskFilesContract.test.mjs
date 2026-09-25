import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as contract from './taskFilesContract.ts';

const scope = (ownerId = 'A') => ({
  ownerId,
  generation: 'generation',
  bindingId: 'binding',
  jobId: 'job',
  workspaceId: 'workspace',
});
const entry = (relativePath = 'report.txt') => ({
  relativePath,
  name: relativePath.split('/').at(-1),
  kind: 'file',
  bytes: 3,
  modifiedAt: '2026-09-19T10:00:00Z',
});
const list = () => ({
  jobId: 'job',
  workspaceId: 'workspace',
  relativePath: '',
  entries: [],
  truncated: false,
});
const read = () => ({
  jobId: 'job',
  workspaceId: 'workspace',
  entry: entry(),
  sha256: 'a'.repeat(64),
  kind: 'text',
  text: 'abc',
  encoding: 'utf-8',
  truncated: false,
});
const imported = () => ({
  status: 'imported',
  jobId: 'job',
  workspaceId: 'workspace',
  entry: entry(),
  sha256: 'a'.repeat(64),
  source: { artifactId: 'artifact', sha256: 'a'.repeat(64), version: 1 },
});
const rejected = (values) => {
  for (const value of values)
    assert.throws(value, contract.TaskFilesContractError);
};

test('inputs contain only job/artifact identifiers and normalized relative paths', () => {
  assert.deepEqual(
    contract.taskFileListInput({ jobId: 'job', relativePath: '' }),
    { jobId: 'job', relativePath: '' }
  );
  assert.deepEqual(
    contract.taskFileReadInput({ jobId: 'job', relativePath: '资料/报告.txt' }),
    { jobId: 'job', relativePath: '资料/报告.txt' }
  );
  assert.deepEqual(
    contract.taskArtifactImportInput({
      jobId: 'job',
      artifactId: 'artifact',
      relativePath: '报告.txt',
    }),
    { jobId: 'job', artifactId: 'artifact', relativePath: '报告.txt' }
  );
  for (const relativePath of [
    '',
    '../secret',
    'a/../b',
    'a//b',
    'a/./b',
    'a\\b',
    '/etc/file',
    'C:/file',
    'file:stream',
    'NUL.txt',
    'a/CON',
    'a/trailing.',
    'a/trailing ',
    'a\u0000b',
    'a\u007fb',
  ])
    rejected([
      () => contract.taskFileReadInput({ jobId: 'job', relativePath }),
    ]);
  for (const field of ['root', 'owner', 'workspaceId', 'endpoint'])
    rejected([
      () =>
        contract.taskFileListInput({
          jobId: 'job',
          relativePath: '',
          [field]: 'injected',
        }),
    ]);
  rejected([
    () =>
      contract.taskArtifactImportInput({
        jobId: 'job',
        artifactId: '',
        relativePath: 'a',
      }),
    () => contract.taskFileReadInput({ jobId: '../job', relativePath: 'a' }),
  ]);
});

test('list separates a verified empty directory from malformed or cross-scope receipts', () => {
  assert.deepEqual(contract.decodeTaskFileList(list(), scope(), ''), list());
  const nested = {
    ...list(),
    relativePath: 'docs',
    entries: [
      entry('docs/a.txt'),
      { ...entry('docs/sub'), kind: 'directory', bytes: null },
    ],
  };
  assert.deepEqual(
    contract.decodeTaskFileList(nested, scope(), 'docs'),
    nested
  );
  for (const change of [
    (v) => (v.jobId = 'other'),
    (v) => (v.workspaceId = 'other'),
    (v) => delete v.truncated,
    (v) => (v.entries = [entry('../outside')]),
    (v) => (v.entries = [entry('sub/deep.txt')]),
    (v) => (v.entries = [entry(), entry()]),
    (v) => (v.entries = [{ ...entry(), bytes: -1 }]),
    (v) => (v.entries = [{ ...entry(), bytes: NaN }]),
    (v) => (v.entries = [{ ...entry(), name: 'wrong' }]),
    (v) => (v.entries = [{ ...entry(), modifiedAt: 'today' }]),
  ]) {
    const value = list();
    change(value);
    rejected([() => contract.decodeTaskFileList(value, scope(), '')]);
  }
});

test('read distinguishes empty UTF-8, bounded preview and binary instead of inventing contents', () => {
  assert.deepEqual(
    contract.decodeTaskFileRead(read(), scope(), 'report.txt'),
    read()
  );
  const empty = { ...read(), entry: { ...entry(), bytes: 0 }, text: '' };
  assert.equal(
    contract.decodeTaskFileRead(empty, scope(), 'report.txt').text,
    ''
  );
  const truncated = {
    ...read(),
    entry: { ...entry(), bytes: 30 },
    truncated: true,
  };
  assert.equal(
    contract.decodeTaskFileRead(truncated, scope(), 'report.txt').truncated,
    true
  );
  const binary = {
    jobId: 'job',
    workspaceId: 'workspace',
    entry: entry(),
    sha256: 'a'.repeat(64),
    kind: 'not_previewable',
    reason: 'binary',
  };
  assert.equal(
    contract.decodeTaskFileRead(binary, scope(), 'report.txt').reason,
    'binary'
  );
  const tooLarge = {
    ...binary,
    entry: { ...entry(), bytes: 32 * 1024 * 1024 + 1 },
    sha256: null,
    reason: 'too_large',
  };
  assert.equal(
    contract.decodeTaskFileRead(tooLarge, scope(), 'report.txt').sha256,
    null
  );
  rejected([
    () =>
      contract.decodeTaskFileRead(
        { ...read(), text: 'abc-more' },
        scope(),
        'report.txt'
      ),
    () =>
      contract.decodeTaskFileRead(
        { ...read(), encoding: 'base64' },
        scope(),
        'report.txt'
      ),
    () =>
      contract.decodeTaskFileRead(
        { ...read(), sha256: 'fake' },
        scope(),
        'report.txt'
      ),
    () =>
      contract.decodeTaskFileRead(
        { ...read(), kind: 'chunk' },
        scope(),
        'report.txt'
      ),
    () =>
      contract.decodeTaskFileRead(
        { ...binary, text: 'invented' },
        scope(),
        'report.txt'
      ),
    () =>
      contract.decodeTaskFileRead(
        { ...binary, sha256: null },
        scope(),
        'report.txt'
      ),
    () => contract.decodeTaskFileRead(read(), scope(), 'other.txt'),
  ]);
});

test('import requires final verified file and source receipt; no fabricated save or overwrite status', () => {
  const input = {
    jobId: 'job',
    artifactId: 'artifact',
    relativePath: 'report.txt',
  };
  assert.deepEqual(
    contract.decodeTaskArtifactImport(imported(), scope(), input),
    imported()
  );
  assert.equal(
    contract.decodeTaskArtifactImport(
      { ...imported(), status: 'already_present' },
      scope(),
      input
    ).status,
    'already_present'
  );
  for (const change of [
    (v) => (v.source.artifactId = 'foreign'),
    (v) => (v.source.sha256 = 'b'.repeat(64)),
    (v) => (v.source.version = 0),
    (v) => (v.source.version = 1.5),
    (v) => (v.entry.kind = 'directory'),
    (v) => (v.entry.bytes = null),
    (v) => (v.status = 'saved'),
    (v) => (v.jobId = 'other'),
    (v) => (v.entry.relativePath = 'other.txt'),
  ]) {
    const v = imported();
    change(v);
    rejected([() => contract.decodeTaskArtifactImport(v, scope(), input)]);
  }
});

test('missing binding, unprovisioned, unsupported and real errors remain distinct', () => {
  assert.equal(
    contract.taskFilesError(new Error('OWNER_BINDING_NOT_FOUND')).kind,
    'unlinked'
  );
  assert.equal(
    contract.taskFilesError(new Error('TASK_FILES_UNPROVISIONED')).kind,
    'unprovisioned'
  );
  assert.equal(
    contract.taskFilesError(new Error('TASK_FILES_UNSUPPORTED')).kind,
    'unsupported'
  );
  for (const message of [
    '403 forbidden',
    'OWNER_RUNTIME_UNAVAILABLE',
    'prefix TASK_FILES_UNPROVISIONED',
    'TASK_FILE_NOT_FOUND',
    'TASK_ARTIFACT_INTEGRITY_FAILED',
  ])
    assert.equal(contract.taskFilesError(new Error(message)).kind, 'error');
});

test('scope replacement discards late success and error before decoding; relogin also invalidates', async () => {
  const gate = contract.createTaskFileScopeGate(scope());
  const ticket = gate.begin();
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  let decodes = 0;
  const wait = gate.settle(ticket, pending, () => {
    decodes++;
    return 'old';
  });
  gate.replace(scope('B'));
  finish('late');
  assert.deepEqual(await wait, { status: 'discarded' });
  assert.equal(decodes, 0);
  const current = gate.begin();
  assert.deepEqual(
    await gate.settle(current, Promise.resolve(2), (v) => v + 1),
    { status: 'accepted', value: 3 }
  );
  let reject;
  const beforeRelogin = gate.begin();
  const failed = gate.settle(
    beforeRelogin,
    new Promise((_, no) => {
      reject = no;
    }),
    (v) => v
  );
  gate.replace(scope('B'));
  reject(new Error('old-session'));
  assert.deepEqual(await failed, { status: 'discarded' });
});

test('scope tickets cannot be forged, mutated or reused after dispose and current errors stay errors', async () => {
  const original = scope();
  const gate = contract.createTaskFileScopeGate(original);
  const token = gate.begin();
  original.jobId = 'mutated';
  assert.equal(token.scope.jobId, 'job');
  assert.ok(Object.isFrozen(token.scope));
  assert.deepEqual(
    await gate.settle({ ...token }, Promise.resolve('forged'), (v) => v),
    { status: 'discarded' }
  );
  const error = new Error('permission');
  const failed = await gate.settle(token, Promise.reject(error), (v) => v);
  assert.equal(failed.status, 'error');
  assert.equal(failed.error, error);
  gate.dispose();
  assert.deepEqual(
    await gate.settle(token, Promise.resolve('late'), (v) => v),
    { status: 'discarded' }
  );
  assert.throws(() => gate.begin());
});

test('same-scope requests are latest-wins per operation lane', async () => {
  const gate = contract.createTaskFileScopeGate(scope());
  const oldPreview = gate.begin('preview');
  const directory = gate.begin('directory');
  const newPreview = gate.begin('preview');
  assert.deepEqual(
    await gate.settle(oldPreview, Promise.resolve('old'), (value) => value),
    { status: 'discarded' }
  );
  assert.deepEqual(
    await gate.settle(
      directory,
      Promise.resolve('directory'),
      (value) => value
    ),
    { status: 'accepted', value: 'directory' }
  );
  assert.deepEqual(
    await gate.settle(newPreview, Promise.resolve('new'), (value) => value),
    { status: 'accepted', value: 'new' }
  );
});
