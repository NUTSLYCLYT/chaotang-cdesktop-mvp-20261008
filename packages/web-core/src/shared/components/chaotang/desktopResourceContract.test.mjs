import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDesktopResources,
  desktopResourcesError,
} from './desktopResourceContract.ts';
const fixture = () => ({
  jobId: 'job',
  binding: {
    bindingId: 'binding',
    jobId: 'job',
    installationId: 'installation',
    workspaceId: 'workspace',
    sessionId: 'session',
    resourceFingerprint: 'fingerprint',
    businessAttemptId: 'attempt-a',
    createdAt: 'today',
  },
  workspace: {
    id: 'workspace',
    name: null,
    branch: 'main',
    archived: false,
    useWorktree: false,
    createdAt: 'today',
    updatedAt: 'today',
  },
  session: {
    id: 'session',
    workspaceId: 'workspace',
    name: null,
    executor: null,
    createdAt: 'today',
    updatedAt: 'today',
  },
  filesAvailable: true,
  executionAvailable: true,
  terminalAvailable: true,
  previewAvailable: true,
});
test('metadata receipt requires the bound supervised execution and terminal capabilities', () => {
  const valid = fixture();
  assert.deepEqual(validateDesktopResources(valid, 'job'), valid);
  const waiting = fixture();
  waiting.binding.businessAttemptId = null;
  assert.deepEqual(validateDesktopResources(waiting, 'job'), waiting);
  for (const alter of [
    (v) => (v.jobId = 'other'),
    (v) => (v.binding.jobId = 'other'),
    (v) => (v.binding.businessAttemptId = '../outside'),
    (v) => (v.binding.workspaceId = 'other'),
    (v) => (v.binding.sessionId = 'other'),
    (v) => (v.session.workspaceId = 'other'),
    (v) => (v.filesAvailable = false),
    (v) => delete v.filesAvailable,
    (v) => (v.executionAvailable = false),
    (v) => (v.terminalAvailable = false),
    (v) => delete v.terminalAvailable,
    (v) => (v.previewAvailable = false),
    (v) => delete v.previewAvailable,
    (v) => delete v.binding.resourceFingerprint,
    (v) => (v.workspace.archived = 'false'),
    (v) => (v.session.executor = 4),
  ]) {
    const v = fixture();
    alter(v);
    assert.throws(() => validateDesktopResources(v, 'job'));
  }
});
test('only exact missing-binding sentinel is empty; unavailable and authorization remain errors', () => {
  assert.equal(
    desktopResourcesError(new Error('OWNER_BINDING_NOT_FOUND')).kind,
    'unlinked'
  );
  assert.equal(
    desktopResourcesError(new Error('OWNER_RUNTIME_UNAVAILABLE')).kind,
    'unavailable'
  );
  for (const message of [
    '403 forbidden',
    'prefix OWNER_BINDING_NOT_FOUND',
    'OWNER_BINDING_NOT_FOUND suffix',
    'job_not_found',
  ]) {
    const result = desktopResourcesError(new Error(message));
    assert.equal(result.kind, 'error');
    assert.equal(result.message, message);
  }
});
