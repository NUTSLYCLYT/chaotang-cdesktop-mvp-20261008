import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAcceptanceChaotangClient } from './acceptanceChaotangClient.test-support.mjs';

test('account storage outage gives recovery guidance without losing an existing session', async () => {
  let token = 'existing-session';
  const client = createAcceptanceChaotangClient(
    {},
    async () =>
      new Response(
        JSON.stringify({
          code: 'AUTH_STORAGE_UNAVAILABLE',
          message: 'private-database-path-and-error',
        }),
        { status: 503 }
      ),
    {
      getItem: () => token,
      setItem: (_, value) => {
        token = value;
      },
      removeItem: () => {
        token = null;
      },
    }
  );
  await assert.rejects(
    () => client.currentUser(),
    (error) => {
      assert.equal(error.message, '账户服务暂时不可用，请稍后重试（HTTP 503）');
      assert.doesNotMatch(error.message, /private-database/);
      return true;
    }
  );
  assert.equal(token, 'existing-session');
});

test('authentication rejection still expires the session even with a storage error code', async () => {
  let token = 'expired-session';
  const client = createAcceptanceChaotangClient(
    {},
    async () =>
      new Response(JSON.stringify({ code: 'AUTH_STORAGE_UNAVAILABLE' }), {
        status: 401,
      }),
    {
      getItem: () => token,
      setItem: (_, value) => {
        token = value;
      },
      removeItem: () => {
        token = null;
      },
    }
  );
  await assert.rejects(
    () => client.currentUser(),
    /朝堂会话已失效，请重新登录/
  );
  assert.equal(token, null);
});
test('real HTTP adapter maps job metadata but preserves report keys and sends authority header', async () => {
  const requests = [];
  let token = null;
  const storage = {
    getItem: () => token,
    setItem: (k, v) => {
      token = v;
    },
    removeItem: () => {
      token = null;
    },
  };
  const transport = async (url, opts) => {
    requests.push([url, opts]);
    return new Response(
      JSON.stringify(
        url.endsWith('/login')
          ? {
              user: { id: 'u', username: 'test', email: 't@e.com' },
              session_id: 'opaque',
            }
          : url.endsWith('/chancellor')
            ? { job_id: 'j', state: 'QUEUED' }
            : {
                job_id: 'j',
                result: { final_verdict: 'x' },
                provider_request_count: 3,
              }
      ),
      { status: 200 }
    );
  };
  const native = {
    login: async () => null,
    decreeJob: async () => null,
    issueChancellorDecree: async () => null,
  };
  const client = createAcceptanceChaotangClient(native, transport, storage);
  assert.equal((await client.login('test', 'password')).id, 'u');
  const job = await client.decreeJob('j');
  assert.equal(job.jobId, 'j');
  assert.equal(job.result.final_verdict, 'x');
  assert.equal(job.providerRequestCount, 3);
  await client.issueChancellorDecree({
    decreeText: 'x',
    draftVersion: 1,
    draftFingerprint: 'f',
    idempotencyKey: 'key',
  });
  assert.equal(requests[2][1].headers['Idempotency-Key'], 'key');
  assert.equal(requests[2][1].headers.Authorization, 'Bearer opaque');
  assert.deepEqual(JSON.parse(requests[2][1].body), {
    decree_text: 'x',
    draft_version: 1,
    draft_fingerprint: 'f',
  });
  await client.retryDecreeJob('j');
  assert.equal(requests[3][0], '/fusion-api/api/v1/decree-jobs/j/retry');
  assert.equal(requests[3][1].method, 'POST');
  assert.ok(requests.every(([url]) => url.startsWith('/fusion-api/')));
});

test('structured error reasons are readable without leaking response content', async () => {
  const storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  for (const [body, expected] of [
    [
      { reason: 'model_unavailable', message: 'secret-provider-response' },
      '模型服务未能返回有效结果',
    ],
    [
      {
        detail: {
          code: 'provider_budget_exceeded',
          message: 'secret-provider-response',
        },
      },
      '模型请求预算已用完',
    ],
    [
      {
        reason: 'secret-provider-response',
        message: 'secret-provider-response',
      },
      '朝堂请求失败',
    ],
  ]) {
    const client = createAcceptanceChaotangClient(
      {},
      async () => new Response(JSON.stringify(body), { status: 502 }),
      storage
    );
    await assert.rejects(
      () => client.chancellorDraft({ messages: [], version: 1 }),
      (e) =>
        e.message.includes(expected) &&
        e.message.includes('HTTP 502') &&
        !e.message.includes('secret-provider-response')
    );
  }
});

test('capability summary maps actual snake-case contract without probing connectors', async () => {
  const paths = [];
  const client = createAcceptanceChaotangClient(
    {},
    async (path) => {
      paths.push(path);
      return new Response(
        JSON.stringify({
          execution: {
            mode: 'external',
            node_available: true,
            host_available: true,
            availability_scope: 'file_presence',
          },
          network_enabled: false,
          registry_status: 'VALID',
          connectors: [
            {
              id: 'local',
              enabled: true,
              credential_status: 'NOT_REQUIRED',
              approval_revision: 'v1',
              approved_tools: [],
              probe_status: 'UNVERIFIED',
            },
          ],
        })
      );
    },
    { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  );
  const result = await client.fusionCapabilities();
  assert.equal(result.execution.availabilityScope, 'file_presence');
  assert.equal(result.connectors[0].probeStatus, 'UNVERIFIED');
  assert.deepEqual(paths, ['/fusion-api/api/v1/fusion-capabilities']);
});

test('browser adapter does not inherit native save and maps task metadata', async () => {
  const client = createAcceptanceChaotangClient(
    {
      saveWorkspaceArtifact: async () => {
        throw new Error('native must not run');
      },
      linkDecreeWorkspace: async () => {
        throw new Error('native must not run');
      },
      decreeDesktopResources: async () => {
        throw new Error('native must not run');
      },
    },
    async () =>
      new Response(
        JSON.stringify({
          job_id: 'j',
          title: '批准任务',
          decree_text: '批准内容',
          draft_fingerprint: 'f',
          reply_id: 'r',
          runtime_attempt_id: 'a',
          retry_of_job_id: 'old',
          approved_draft: {
            status: 'DRAFT_READY',
            draft: { objective: '冻结目标', completion_criteria: ['冻结验收'] },
            decree_text: '冻结旨意',
            draft_version: 2,
          },
        })
      ),
    { getItem: () => 'token', setItem: () => {}, removeItem: () => {} }
  );
  assert.equal(client.saveWorkspaceArtifact, undefined);
  assert.equal(client.linkDecreeWorkspace, undefined);
  assert.equal(client.decreeDesktopResources, undefined);
  const job = await client.decreeJob('j');
  assert.equal(job.decreeText, '批准内容');
  assert.equal(job.runtimeAttemptId, 'a');
  assert.equal(job.retryOfJobId, 'old');
  assert.equal(job.approvedDraft.draft.completionCriteria[0], '冻结验收');
  assert.equal(job.approvedDraft.decreeText, '冻结旨意');
});

test('history GET sends literal server query and stable page, PUT changes annotation only', async () => {
  const seen = [];
  const client = createAcceptanceChaotangClient(
    {},
    async (url, init) => {
      seen.push([url, init]);
      return new Response(
        JSON.stringify(
          init.method === 'PUT'
            ? {
                job_id: 'j',
                history_archived: true,
                updated_at: '2026-09-19T00:00:00Z',
              }
            : { items: [], total: 71, limit: 50, offset: 50 }
        )
      );
    },
    { getItem: () => 'token', setItem: () => {}, removeItem: () => {} }
  );
  const page = await client.decreeJobs({
    q: '电池%_ 标题',
    limit: 50,
    offset: 50,
    archived: 'all',
  });
  const url = new URL(seen[0][0], 'http://localhost');
  assert.equal(url.searchParams.get('q'), '电池%_ 标题');
  assert.equal(url.searchParams.get('offset'), '50');
  assert.equal(url.searchParams.get('archived'), 'all');
  assert.equal(page.offset, 50);
  assert.equal(typeof client.setDecreeHistoryArchived, 'function');
  const result = await client.setDecreeHistoryArchived('j', true);
  assert.equal(
    seen[1][0],
    '/fusion-api/api/v1/decree-jobs/j/history-annotation'
  );
  assert.equal(seen[1][1].method, 'PUT');
  assert.deepEqual(JSON.parse(seen[1][1].body), { archived: true });
  assert.equal(result.historyArchived, true);
  assert.ok(
    seen.every(([url]) => !url.includes('/cancel') && !url.includes('/shiguan'))
  );
});
test('history 409 and missing endpoint report failure rather than successful annotation', async () => {
  for (const [status, body, pattern] of [
    [409, { reason: 'job_history_archive_rejected' }, /终态|结束/],
    [404, { reason: 'job_not_found' }, /不存在|无权/],
    [404, {}, /不可用|请求失败/],
  ]) {
    const client = createAcceptanceChaotangClient(
      {},
      async () => new Response(JSON.stringify(body), { status }),
      { getItem: () => 'token', setItem: () => {}, removeItem: () => {} }
    );
    assert.equal(typeof client.setDecreeHistoryArchived, 'function');
    await assert.rejects(client.setDecreeHistoryArchived('j', true), pattern);
  }
});
