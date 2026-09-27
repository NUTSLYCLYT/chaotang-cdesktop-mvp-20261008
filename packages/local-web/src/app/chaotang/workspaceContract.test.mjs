import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from '../../../../../node_modules/.pnpm/esbuild@0.27.2/node_modules/esbuild/lib/main.js';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('real backend workspace publication contract controls rendered download button', async () => {
  const root = resolve(import.meta.dirname, '../../../../../..');
  const pythonCommand = process.env.CHAOTANG_TEST_PYTHON || 'python';
  const pythonPrefixArgs = process.env.CHAOTANG_TEST_PYTHON_ARGS
    ? JSON.parse(process.env.CHAOTANG_TEST_PYTHON_ARGS)
    : [];
  if (
    !Array.isArray(pythonPrefixArgs) ||
    pythonPrefixArgs.some((value) => typeof value !== 'string')
  ) {
    throw new Error('CHAOTANG_TEST_PYTHON_ARGS must be a JSON string array');
  }
  const pythonPath =
    process.env.CHAOTANG_TEST_PYTHONPATH || resolve(root, 'platform/backend');
  const script = `import json\nfrom types import SimpleNamespace as N\nfrom unittest.mock import patch\nfrom app.fusion.workspace import workspace_snapshot\nfrom app.decree_jobs.models import DecreeJobState\njob=N(job_id='contract-job',owner_user_id='owner',reply_id='contract-job',state=DecreeJobState.SUCCEEDED,result_json=json.dumps({'fusion_artifact_ids':['artifact']}),decree_text='合成资料')\nartifact=N(job_id=job.job_id,reply_id=job.reply_id,artifact_id='artifact',file_name='report.md',kind='md',sha256='a'*64,version=1)\nwith patch('app.api.fusion_artifacts.get_fusion_artifact_store',return_value=N(download=lambda *args:(artifact,None))):\n print(json.dumps(workspace_snapshot(job)))`;
  const payload = JSON.parse(
    execFileSync(pythonCommand, [...pythonPrefixArgs, '-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
        CHAOTANG_FUSION_WORKSPACE_DB: '',
      },
    })
  );
  const entry = `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {WorkspaceCards, CourtWorkspace} from '${resolve(root, 'desktop/packages/web-core/src/shared/components/chaotang/CourtWorkspace.tsx').replaceAll('\\', '/')}'; export const render=(workspace, extra={})=>renderToStaticMarkup(React.createElement(WorkspaceCards,{workspace,result:null,objective:'',hasSelectedJob:true,...extra})); export const renderCourt=()=>renderToStaticMarkup(React.createElement(CourtWorkspace,{selectedJobId:'contract-job',onSelectJob:()=>{}}));`;
  const out = resolve(import.meta.dirname, '.workspace-contract-render.mjs');
  try {
    const compiled = await build({
      stdin: {
        contents: entry,
        resolveDir: import.meta.dirname,
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      jsx: 'automatic',
      external: ['react', 'react-dom/server', 'react/jsx-runtime'],
      plugins: [
        {
          name: 'contract-hooks',
          setup(b) {
            b.onResolve({ filter: /^@\// }, (args) =>
              args.path === '@/shared/lib/chaotangFusion'
                ? {
                    path: resolve(
                      root,
                      'desktop/packages/web-core/src/shared/lib/chaotangFusion.ts'
                    ),
                  }
                : {
                    path: args.path,
                    namespace: 'stub',
                  }
            );
            b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
              contents: args.path.includes('ChaotangProvider')
                ? `export const useChaotangClient=()=>({downloadWorkspaceArtifact:async()=>{}}); export const useChaotangProvider=()=>({user:{id:'owner',username:'test'},health:{status:'ok'}});`
                : args.path.includes('chaotangFusion')
                  ? 'export const parseDecreeResult=()=>{}; export const decreeIdempotencyKey=()=>{};'
                  : args.path.includes('useDecreeJobs')
                    ? `export const useDecreeJobs=()=>({data:{items:[{jobId:'running',title:'办理任务',state:'RUNNING',historyArchived:false},{jobId:'finished',title:'完结任务',state:'SUCCEEDED',historyArchived:true}],total:71,limit:50,offset:0},refetch:()=>{}}); export const useSetDecreeHistoryArchived=()=>({reset:()=>{},mutate:()=>{}});`
                    : `const idle=()=>({reset:()=>{}}); export const useChancellorConsult=idle; export const useChancellorDraft=idle; export const useIssueChancellorDecree=idle; export const useDecreeJob=()=>({data:{jobId:'contract-job',title:'已批准质量检查',decreeText:'检查用户提供资料',approvedDraft:{draft:{objective:'服务端冻结目标',completionCriteria:['服务端冻结验收']}},state:'RUNNING',providerRequestCount:0}}); export const useCancelDecreeJob=idle; export const useRetryDecreeJob=idle; export const useDecreeDesktopResources=()=>({});export const useLinkDecreeWorkspace=()=>({});export const useDecreeWorkspace=()=>({isLoading:true});`,
            }));
            b.onResolve({ filter: /^@phosphor/ }, () => ({
              path: 'icons',
              namespace: 'icons',
            }));
            b.onLoad({ filter: /.*/, namespace: 'icons' }, () => ({
              contents:
                'export const FilesIcon=()=>null;export const UsersThreeIcon=()=>null;export const BookOpenIcon=()=>null;',
            }));
          },
        },
      ],
    });
    await writeFile(out, compiled.outputFiles[0].text);
    const { render, renderCourt } = await import(pathToFileURL(out).href);
    const workspace = {
      jobId: payload.job_id,
      agentsAvailable: false,
      agents: [],
      sources: [],
      artifacts: payload.artifacts.map((a) => ({
        id: a.id,
        displayName: a.display_name,
        kind: a.kind,
        state: a.state,
        downloadPath: a.download_path,
      })),
    };
    assert.equal(payload.artifacts[0].state, 'published');
    const loading = render(undefined, { loading: true });
    assert.match(loading, /正在读取任务成果/);
    assert.doesNotMatch(loading, /尚无已登记|查看全部/);
    const error = render(undefined, {
      error: '任务不存在或当前账户无权查看',
      onRetry: () => {},
    });
    assert.match(error, /重新读取任务面板/);
    assert.doesNotMatch(error, /尚无已登记|查看全部/);
    const court = renderCourt();
    const main = court.match(/<main[\s\S]*?<\/main>/)[0];
    assert.match(main, /已批准质量检查/);
    assert.match(main, /检查用户提供资料/);
    assert.match(main, /服务端冻结验收/);
    assert.match(main, /任务创建时冻结/);
    assert.match(main, /请求取消/);
    assert.doesNotMatch(main, /<textarea/);
    assert.match(court, /搜索本账户任务/);
    assert.match(court, /搜索全部历史/);
    assert.match(court, /共 71 项/);
    assert.match(court, /aria-label="历史分页"/);
    assert.match(court, /不代表史馆正式归档，也不取消办理/);
    assert.match(
      court,
      /<button[^>]*disabled=""[^>]*aria-label="归档历史记录：办理任务"/
    );
    assert.match(
      court,
      /<button(?![^>]*disabled=)[^>]*aria-label="恢复历史记录：完结任务"/
    );
    assert.match(
      render(workspace),
      /<button(?![^>]* disabled=)[^>]*>下载文件<\/button>/
    );
    workspace.artifacts[0].state = 'pending';
    assert.match(
      render(workspace),
      /<button[^>]* disabled=[^>]*>下载文件<\/button>/
    );
    workspace.agentsAvailable = true;
    workspace.agents = [
      {
        id: 'minister',
        name: '工部',
        role: 'minister',
        state: 'waiting',
        taskSummary: '合成任务',
      },
    ];
    assert.match(render(workspace), /等待中/);
    assert.match(render(workspace), /工具调用明细尚未接入/);
    workspace.tools = [];
    assert.match(render(workspace), /暂无已记录的工具调用/);
    workspace.tools = [
      {
        id: 'call',
        agentId: 'minister',
        name: 'subagent',
        state: 'failed',
        sequence: 1,
      },
    ];
    assert.match(render(workspace), /工部 · subagent · 失败/);
  } finally {
    await unlink(out).catch(() => {});
  }
});

test('job mutations invalidate only their owner, and error queries stop polling', async () => {
  const root = resolve(import.meta.dirname, '../../../../../..');
  const compiled = await build({
    entryPoints: [
      resolve(
        root,
        'desktop/packages/web-core/src/shared/hooks/chaotang/useChancellor.ts'
      ),
    ],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'query-boundary',
        setup(b) {
          b.onResolve({ filter: /^@tanstack\/react-query$/ }, () => ({
            path: 'query',
            namespace: 'stub',
          }));
          b.onResolve({ filter: /^@\/shared\/providers/ }, () => ({
            path: 'provider',
            namespace: 'stub',
          }));
          b.onResolve({ filter: /^@\/shared\/lib\/chaotangFusion$/ }, () => ({
            path: resolve(
              root,
              'desktop/packages/web-core/src/shared/lib/chaotangFusion.ts'
            ),
          }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            contents:
              args.path === 'query'
                ? `export const useMutation=o=>o; export const useQuery=o=>o; export const useQueryClient=()=>globalThis.__courtQuery;`
                : `export const useChaotangClient=()=>({decreeWorkspace:async()=>{}}); export const useChaotangProvider=()=>({user:{id:globalThis.__courtOwner}});`,
          }));
        },
      },
    ],
  });
  const hooks = await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  const invalidations = [];
  const writes = [];
  globalThis.__courtQuery = {
    invalidateQueries: async ({ queryKey }) => invalidations.push(queryKey),
    setQueryData: (key) => writes.push(key),
  };
  globalThis.__courtOwner = 'owner-a';
  try {
    const issue = hooks.useIssueChancellorDecree();
    const cancel = hooks.useCancelDecreeJob();
    const retry = hooks.useRetryDecreeJob();
    globalThis.__courtOwner = 'owner-b';
    await issue.onSuccess();
    await cancel.onSuccess({ jobId: 'a' });
    await retry.onSuccess({ jobId: 'a-retry' });
    assert.deepEqual(
      invalidations,
      Array(3).fill(['chaotang', 'decree-jobs', 'owner-a'])
    );
    assert.deepEqual(writes, [
      ['chaotang', 'decree-job', 'owner-a', 'a'],
      ['chaotang', 'decree-job', 'owner-a', 'a-retry'],
    ]);
    const query = hooks.useDecreeJob('b');
    assert.deepEqual(query.queryKey, [
      'chaotang',
      'decree-job',
      'owner-b',
      'b',
    ]);
    assert.equal(query.refetchInterval({ state: { status: 'error' } }), false);
    assert.equal(
      query.refetchInterval({
        state: { status: 'success', data: { state: 'SUCCEEDED' } },
      }),
      false
    );
    assert.equal(
      query.refetchInterval({
        state: { status: 'success', data: { state: 'RUNNING' } },
      }),
      2000
    );
    assert.equal(
      hooks
        .useDecreeWorkspace('b')
        .refetchInterval({ state: { status: 'error' } }),
      false
    );
  } finally {
    delete globalThis.__courtQuery;
    delete globalThis.__courtOwner;
  }
});

test('native save transport sends task and artifact IDs and returns verified receipt', async () => {
  const compiled = await build({
    entryPoints: [resolve(import.meta.dirname, 'tauriChaotangClient.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'native-boundary',
        setup(b) {
          b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({
            path: 'native',
            namespace: 'stub',
          }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: `export const invoke=async(command,args)=>{globalThis.__courtCalls.push([command,args]);return {status:'saved',path:'D:/report.md',sha256:'a'.repeat(64),bytes:4};};`,
          }));
        },
      },
    ],
  });
  const { tauriChaotangClient } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  globalThis.__TAURI_INTERNALS__ = { invoke: () => {} };
  globalThis.__courtCalls = [];
  try {
    const receipt = await tauriChaotangClient.saveWorkspaceArtifact(
      'job',
      'artifact'
    );
    assert.deepEqual(globalThis.__courtCalls, [
      [
        'chaotang_save_workspace_artifact',
        { jobId: 'job', artifactId: 'artifact' },
      ],
    ]);
    assert.equal(receipt.path, 'D:/report.md');
    assert.equal(receipt.bytes, 4);
    await tauriChaotangClient.decreeJobs({
      q: 'literal_%',
      limit: 50,
      offset: 50,
      archived: 'all',
    });
    await tauriChaotangClient.setDecreeHistoryArchived('job', true);
    await tauriChaotangClient.decreeDesktopResources('job');
    await tauriChaotangClient.linkDecreeWorkspace('job');
    assert.deepEqual(globalThis.__courtCalls.slice(1), [
      [
        'chaotang_decree_jobs',
        { input: { q: 'literal_%', limit: 50, offset: 50, archived: 'all' } },
      ],
      [
        'chaotang_set_decree_history_archived',
        { jobId: 'job', archived: true },
      ],
      ['chaotang_decree_desktop_resources', { jobId: 'job' }],
      ['chaotang_link_decree_workspace', { jobId: 'job' }],
    ]);
  } finally {
    delete globalThis.__TAURI_INTERNALS__;
    delete globalThis.__courtCalls;
  }
});

test('history queries separate owners and server criteria; annotation invalidates only its owner', async () => {
  const root = resolve(import.meta.dirname, '../../../../../..');
  const compiled = await build({
    entryPoints: [
      resolve(
        root,
        'desktop/packages/web-core/src/shared/hooks/chaotang/useDecreeJobs.ts'
      ),
    ],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'history-hooks',
        setup(b) {
          b.onResolve({ filter: /^@tanstack\/react-query$/ }, () => ({
            path: 'query',
            namespace: 'stub',
          }));
          b.onResolve({ filter: /^@\/shared\/providers/ }, () => ({
            path: 'provider',
            namespace: 'stub',
          }));
          b.onResolve({ filter: /^@\// }, (args) => ({
            path: resolve(
              root,
              'desktop/packages/web-core/src',
              args.path.slice(2) + '.ts'
            ),
          }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            contents:
              args.path === 'query'
                ? `export const useQuery=o=>o;export const useMutation=o=>o;export const useQueryClient=()=>globalThis.__historyCache;`
                : `export const useChaotangClient=()=>globalThis.__historyClient;export const useChaotangProvider=()=>({user:{id:globalThis.__historyOwner},health:{status:'ok'}});`,
          }));
        },
      },
    ],
  });
  const hooks = await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  const calls = [],
    invalidated = [];
  globalThis.__historyOwner = 'owner-a';
  globalThis.__historyCache = {
    invalidateQueries: async ({ queryKey }) => invalidated.push(queryKey),
  };
  globalThis.__historyClient = {
    decreeJobs: async (input) => {
      calls.push(input);
      return {
        items: [],
        total: 71,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      };
    },
    setDecreeHistoryArchived: async (jobId, archived) => ({
      jobId,
      historyArchived: archived,
      updatedAt: 'now',
    }),
  };
  try {
    const options = { q: 'literal_%', limit: 50, offset: 50, archived: 'all' };
    const query = hooks.useDecreeJobs(options);
    await query.queryFn();
    assert.deepEqual(calls, [options]);
    assert.deepEqual(query.queryKey, [
      'chaotang',
      'decree-jobs',
      'owner-a',
      options,
    ]);
    assert.notDeepEqual(
      query.queryKey,
      hooks.useDecreeJobs({ ...options, offset: 0 }).queryKey
    );
    assert.equal(typeof hooks.useSetDecreeHistoryArchived, 'function');
    const mutation = hooks.useSetDecreeHistoryArchived();
    globalThis.__historyOwner = 'owner-b';
    assert.notDeepEqual(query.queryKey, hooks.useDecreeJobs(options).queryKey);
    const vars = { jobId: 'finished', archived: true };
    const result = await mutation.mutationFn(vars);
    await mutation.onSuccess(result, vars);
    assert.deepEqual(invalidated, [['chaotang', 'decree-jobs', 'owner-a']]);
  } finally {
    delete globalThis.__historyOwner;
    delete globalThis.__historyCache;
    delete globalThis.__historyClient;
  }
});
