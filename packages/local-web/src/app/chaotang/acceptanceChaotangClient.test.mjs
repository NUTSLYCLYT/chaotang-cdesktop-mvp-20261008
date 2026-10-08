import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAcceptanceChaotangClient } from './acceptanceChaotangClient.test-support.mjs';

test('delivery review uses the existing authenticated POST and preserves raw receipt fields', async () => {
  const calls = [];
  const receipt = {
    job_id: 'job-1',
    scope: 'STRUCTURAL_DELIVERY',
    quality_assessment: 'NOT_ASSESSED',
  };
  const client = createAcceptanceChaotangClient(
    {},
    async (path, options) => {
      calls.push({ path, options });
      return Response.json(receipt, { status: 201 });
    },
    { getItem: () => 'fixture-session', setItem() {}, removeItem() {} }
  );
  assert.deepEqual(await client.reviewDecreeDelivery('job-1'), receipt);
  assert.equal(
    calls[0].path,
    '/fusion-api/api/v1/hanlin/decree-jobs/job-1/task-review'
  );
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(
    calls[0].options.headers.Authorization,
    'Bearer fixture-session'
  );
  assert.equal(calls[0].options.body, undefined);
  for (const id of ['../other', 'job?owner=other', 'job/next', '']) {
    await assert.rejects(async () => client.reviewDecreeDelivery(id));
  }
  assert.equal(calls.length, 1);
});

test('only allowlisted error codes accompany fixed messages, with 401 taking precedence', async () => {
  for (const [status, reason, expected] of [
    [503, 'config_unavailable', 'config_unavailable'],
    [503, 'SECRET-UPSTREAM-CODE', undefined],
    [401, 'config_unavailable', undefined],
  ]) {
    const client = createAcceptanceChaotangClient(
      {},
      async () => Response.json({ reason, message: 'SECRET BODY' }, { status }),
      { getItem: () => 'session', setItem() {}, removeItem() {} }
    );
    await assert.rejects(
      client.chancellorConsult([{ role: 'user', content: 'goal' }]),
      (error) => {
        assert.equal(error.code, expected);
        assert.doesNotMatch(error.message, /SECRET/);
        assert.doesNotMatch(JSON.stringify(error), /SECRET/);
        return true;
      }
    );
  }
});

test('department failures explain the next step without displaying upstream details', async () => {
  for (const [status, expected] of [
    [404, /无权查看/],
    [409, /查看最新结果/],
    [422, /检查填写内容/],
    [503, /稍后重试/],
  ]) {
    const client = createAcceptanceChaotangClient(
      {},
      async () =>
        Response.json({ message: 'private upstream detail' }, { status }),
      { getItem: () => 'session', setItem() {}, removeItem() {} }
    );
    await assert.rejects(client.hubuWorkProducts(), (error) => {
      assert.match(error.message, expected);
      assert.doesNotMatch(error.message, /private upstream/);
      return true;
    });
  }
});

test('department pages use authenticated HTTP instead of a native-only fallback', async () => {
  const calls = [];
  const methods = [
    'jinyiweiSummary',
    'jinyiweiInvestigations',
    'jinyiweiInvestigation',
    'hubuWorkProducts',
    'hubuWorkProduct',
    'skillCatalog',
    'mcpCatalog',
    'connectorCatalog',
    'junjichuCases',
    'junjichuCase',
    'shiguanStatistics',
  ];
  const native = Object.fromEntries(
    methods.map((name) => [
      name,
      () => {
        throw new Error('native-only fallback');
      },
    ])
  );
  const client = createAcceptanceChaotangClient(
    native,
    async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        url.includes('report-artifacts?') ? { items: [] } : {}
      );
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  await client.jinyiweiSummary();
  await client.jinyiweiInvestigations('BLOCKED');
  await client.jinyiweiInvestigation('investigation-123');
  assert.deepEqual(await client.hubuWorkProducts(), []);
  await client.hubuWorkProduct('a'.repeat(32));
  await client.skillCatalog();
  await client.mcpCatalog();
  await client.connectorCatalog();
  await client.junjichuCases();
  await client.junjichuCase('case-123');
  await client.shiguanStatistics();
  assert.equal(calls.length, methods.length);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith('/fusion-api/api/v1/'));
    assert.equal(options.headers.Authorization, 'Bearer session');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
  }
  assert.match(calls[1].url, /status=BLOCKED/);
});

test('cash results keep their real persistence and confirmation contracts', async () => {
  const calls = [];
  const client = createAcceptanceChaotangClient(
    {},
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        persistence_status: 'PERSISTED',
        artifact_id: 'a'.repeat(32),
      });
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  const input = { kind: 'hubu.cash-safety-review.v1', asOf: '2026-09-28' };
  const result = await client.cashSafetyEvaluate(input);
  assert.equal(result.persistenceStatus, 'PERSISTED');
  assert.equal(calls[0].url, '/fusion-api/api/v1/hubu/cash-safety/create');
  assert.deepEqual(JSON.parse(calls[0].options.body), input);
  await client.hubuConfirmArtifact(
    'a'.repeat(32),
    'CONFIRMED',
    '核对输入与结果'
  );
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    decision: 'CONFIRMED',
    structured_reason: '核对输入与结果',
  });
});

test('archive detail, review and recall preserve domain fields', async () => {
  const calls = [];
  const client = createAcceptanceChaotangClient(
    {},
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({ id: 'archive-123', type: 'REPLY' });
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  assert.equal(
    (await client.shiguanArchive('archive-123')).archiveType,
    'REPLY'
  );
  await client.shiguanReview('archive-123', {
    status: 'ACHIEVED',
    reviewedAt: '2026-09-28',
    note: 'checked',
  });
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    status: 'ACHIEVED',
    reviewed_at: '2026-09-28',
    note: 'checked',
  });
  await client.shiguanRecall({ matterType: 'budget', limit: 5 });
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    matter_type: 'budget',
    limit: 5,
  });
});

test('artifact download rejects invalid IDs and expired sessions before exposing bytes', async () => {
  let token = 'session';
  let requests = 0;
  const client = createAcceptanceChaotangClient(
    {},
    async () => {
      requests++;
      return new Response('private upstream error', { status: 401 });
    },
    {
      getItem: () => token,
      setItem() {},
      removeItem() {
        token = null;
      },
    }
  );
  await assert.rejects(
    async () => client.hubuDownloadArtifact('../other'),
    /编号无效/
  );
  assert.equal(requests, 0);
  await assert.rejects(
    client.hubuDownloadArtifact('a'.repeat(32)),
    /会话已失效/
  );
  assert.equal(token, null);
});

test('a delayed logout does not remove a newer session from shared storage', async () => {
  let token = 'old-session';
  let release;
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const client = createAcceptanceChaotangClient({}, () => response, {
    getItem: () => token,
    setItem: (_, value) => {
      token = value;
    },
    removeItem: () => {
      token = null;
    },
  });
  const pending = client.logout();
  token = 'new-session';
  release(new Response(null, { status: 204 }));
  await pending;
  assert.equal(token, 'new-session');
});

test('failed logout clears its local session but reports failed revocation', async () => {
  let token = 'old-session';
  const client = createAcceptanceChaotangClient(
    {},
    async () => new Response(null, { status: 503 }),
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
  await assert.rejects(client.logout(), /HTTP 503/);
  assert.equal(token, null);
});

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
    [404, {}, /记录不存在或当前账户无权查看，请返回列表刷新/],
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

function qintianNativeSentinels() {
  return Object.fromEntries(
    [
      'qintianForecasts',
      'qintianConsult',
      'qintianForecast',
      'qintianPendingTriggers',
      'createQintianForecast',
      'reviewQintianForecast',
    ].map((name) => [
      name,
      () => {
        throw new Error('native-only fallback');
      },
    ])
  );
}

test('qintian lists unwrap items over authenticated HTTP instead of the native sentinel', async () => {
  const calls = [];
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        url.includes('/triggers/pending')
          ? { items: [{ id: 'trigger-1', review_at: '2026-10-05' }] }
          : { items: [{ id: 'forecast-1', review_at: '2026-10-07' }] }
      );
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  const forecasts = await client.qintianForecasts();
  const triggers = await client.qintianPendingTriggers();
  assert.equal(forecasts.length, 1);
  assert.equal(forecasts[0].reviewAt, '2026-10-07');
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].reviewAt, '2026-10-05');
  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      '/fusion-api/api/v1/qintianjian/forecasts',
      '/fusion-api/api/v1/qintianjian/triggers/pending',
    ]
  );
  for (const { options } of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer session');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal, 'timeout signal must guard the request');
  }
});

test('qintian forecast detail preserves nested scenario, evidence, trigger and review fields', async () => {
  const calls = [];
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        id: 'forecast-123',
        created_at: '2026-09-29T00:00:00Z',
        review_at: '2026-10-07',
        methodology_version: 'qintianjian-v1',
        human_signoff_required: true,
        confidence_basis: '据实',
        subject: {
          kind: 'DRAFT',
          id: 'draft-1',
          title: '草案',
          content: '正文',
        },
        scenarios: [
          {
            kind: 'BASELINE',
            summary: '情景',
            impact: '影响',
            time_window: '未来一周',
            counterfactual: '反事实',
          },
        ],
        evidence_refs: [
          { id: 'e1', summary: '摘要', source: '来源', as_of: '2026-09-01' },
        ],
        triggers: [
          {
            id: 'trigger-1',
            signal: '信号',
            threshold: '阈值',
            window: '窗口',
            review_at: '2026-10-05',
          },
        ],
        reviews: [
          {
            id: 'review-1',
            forecast_id: 'forecast-123',
            trigger_id: 'trigger-1',
            decision: 'KEEP',
            observation: '观察',
            judgment_invalidated: false,
            created_at: '2026-09-30T00:00:00Z',
          },
        ],
      });
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  const forecast = await client.qintianForecast('forecast-123');
  assert.equal(
    calls[0].url,
    '/fusion-api/api/v1/qintianjian/forecasts/forecast-123'
  );
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(forecast.reviewAt, '2026-10-07');
  assert.equal(forecast.methodologyVersion, 'qintianjian-v1');
  assert.equal(forecast.humanSignoffRequired, true);
  assert.equal(forecast.subject.kind, 'DRAFT');
  assert.equal(forecast.scenarios[0].timeWindow, '未来一周');
  assert.equal(forecast.evidenceRefs[0].asOf, '2026-09-01');
  assert.equal(forecast.triggers[0].reviewAt, '2026-10-05');
  assert.equal(forecast.reviews[0].forecastId, 'forecast-123');
  assert.equal(forecast.reviews[0].triggerId, 'trigger-1');
  assert.equal(forecast.reviews[0].judgmentInvalidated, false);
});

test('qintian forecast creation maps the real schema without losing idempotency or evidence', async () => {
  const calls = [];
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        { id: 'forecast-123', status: 'COMPLETED' },
        { status: 201 }
      );
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  const created = await client.createQintianForecast({
    idempotencyKey: 'idem-key-12345678',
    subject: { kind: 'DECREE', id: 'decree-1', title: '诏', content: '正文' },
    question: '若减税，市面如何？',
    evidenceRefs: [
      { id: 'e1', summary: '摘要一', source: '来源一', asOf: '2026-09-01' },
      { id: 'e2', summary: '摘要二', source: '来源二' },
    ],
    reviewAt: '2026-10-15',
  });
  assert.equal(calls[0].url, '/fusion-api/api/v1/qintianjian/forecasts');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    idempotency_key: 'idem-key-12345678',
    subject: { kind: 'DECREE', id: 'decree-1', title: '诏', content: '正文' },
    question: '若减税，市面如何？',
    evidence_refs: [
      { id: 'e1', summary: '摘要一', source: '来源一', as_of: '2026-09-01' },
      { id: 'e2', summary: '摘要二', source: '来源二' },
    ],
    review_at: '2026-10-15',
  });
  assert.equal(created.id, 'forecast-123');
  assert.equal(created.status, 'COMPLETED');
});

test('qintian review maps trigger and invalidation fields to the schema', async () => {
  const calls = [];
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        {
          id: 'review-1',
          forecast_id: 'forecast-123',
          trigger_id: 'trigger-1',
          decision: 'INVALIDATE',
          observation: '观察',
          judgment_invalidated: true,
          created_at: '2026-10-01T00:00:00Z',
        },
        { status: 201 }
      );
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  const review = await client.reviewQintianForecast('forecast-123', {
    decision: 'INVALIDATE',
    triggerId: 'trigger-1',
    observation: '观察',
    judgmentInvalidated: true,
  });
  assert.equal(
    calls[0].url,
    '/fusion-api/api/v1/qintianjian/forecasts/forecast-123/reviews'
  );
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    decision: 'INVALIDATE',
    trigger_id: 'trigger-1',
    observation: '观察',
    judgment_invalidated: true,
  });
  assert.equal(review.forecastId, 'forecast-123');
  assert.equal(review.triggerId, 'trigger-1');
  assert.equal(review.judgmentInvalidated, true);
});

test('qintian consult forwards the original message array and rejects invalid histories', async () => {
  const calls = [];
  const messages = [
    { role: 'user', content: '问' },
    { role: 'assistant', content: '答' },
  ];
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({ status: 'ok', consultant: '钦天监', reply: '回' });
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  const response = await client.qintianConsult(messages);
  assert.equal(calls[0].url, '/fusion-api/api/v1/qintianjian/consult');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { messages });
  assert.equal(response.reply, '回');
  await assert.rejects(async () => client.qintianConsult([]), /消息/);
  await assert.rejects(
    async () => client.qintianConsult([{ role: 'user', content: '' }]),
    /消息/
  );
  assert.equal(calls.length, 1);
});

test('qintian detail and review reject invalid ids before any request', async () => {
  let requests = 0;
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async () => {
      requests++;
      return Response.json({});
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  const input = {
    decision: 'KEEP',
    triggerId: 'trigger-1',
    observation: '观察',
    judgmentInvalidated: false,
  };
  for (const id of ['../other', 'forecast/next', 'forecast?owner=x', '']) {
    await assert.rejects(async () => client.qintianForecast(id), /编号无效/);
    await assert.rejects(
      async () => client.reviewQintianForecast(id, input),
      /编号无效/
    );
  }
  assert.equal(requests, 0);
});

test('qintian lists reject malformed payloads instead of pretending an empty list', async () => {
  for (const body of [{}, { items: 'nope' }, { items: null }, [], 'x']) {
    const client = createAcceptanceChaotangClient(
      qintianNativeSentinels(),
      async () => Response.json(body),
      { getItem: () => 'session', setItem() {}, removeItem() {} }
    );
    await assert.rejects(client.qintianForecasts(), /列表响应无效/);
    await assert.rejects(client.qintianPendingTriggers(), /列表响应无效/);
  }
});

test('qintian 401 clears the session without exposing the upstream body or its codes', async () => {
  let token = 'expired-session';
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async () =>
      Response.json(
        { code: 'SECRET-CODE', message: 'secret-token-value' },
        { status: 401 }
      ),
    {
      getItem: () => token,
      setItem() {},
      removeItem() {
        token = null;
      },
    }
  );
  await assert.rejects(client.qintianForecasts(), (error) => {
    assert.match(error.message, /会话已失效/);
    assert.doesNotMatch(error.message, /SECRET|secret-token/);
    assert.doesNotMatch(JSON.stringify(error), /SECRET|secret-token/);
    return true;
  });
  assert.equal(token, null);
});

test('qintian 503 reports the fixed message without native fallback or retry', async () => {
  const calls = [];
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async (url, options) => {
      calls.push({ url, options });
      return Response.json(
        { message: 'secret-upstream-detail' },
        { status: 503 }
      );
    },
    { getItem: () => 'session', setItem() {}, removeItem() {} }
  );
  await assert.rejects(
    client.createQintianForecast({
      idempotencyKey: 'idem-key-12345678',
      subject: { kind: 'REPLY', id: 'reply-1', title: '批', content: '正文' },
      question: '问题',
      evidenceRefs: [],
      reviewAt: '2026-10-15',
    }),
    (error) => {
      assert.match(error.message, /稍后重试/);
      assert.doesNotMatch(error.message, /secret-upstream|native-only/);
      return true;
    }
  );
  assert.equal(calls.length, 1);
});

test('qintian requests without a session omit the bearer and let the backend decide', async () => {
  const calls = [];
  let token = null;
  const client = createAcceptanceChaotangClient(
    qintianNativeSentinels(),
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({ reason: 'auth_required' }, { status: 401 });
    },
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
  await assert.rejects(client.qintianPendingTriggers(), /会话已失效/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, undefined);
});
