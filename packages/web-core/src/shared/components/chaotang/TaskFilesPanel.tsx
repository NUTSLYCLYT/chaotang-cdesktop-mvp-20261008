import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDecreeWorkspace } from '@/shared/hooks/chaotang/useChancellor';
import {
  useChaotangClient,
  useChaotangProvider,
  type DecreeDesktopResources,
  type DecreeWorkspace,
} from '@/shared/providers/ChaotangProvider';
import {
  createTaskFileScopeGate,
  decodeTaskArtifactImport,
  decodeTaskFileList,
  decodeTaskFileRead,
  taskArtifactImportInput,
  taskFileListInput,
  taskFileReadInput,
  taskFilesError,
  type TaskArtifactImport,
  type TaskFileEntry,
  type TaskFileList,
  type TaskFileRead,
  type TaskFileScope,
  type TaskFilesClient,
} from './taskFilesContract';
import { securePreviewDocument } from './TaskPreviewPanel';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand';
type Problem = ReturnType<typeof taskFilesError>;
type Gate = ReturnType<typeof createTaskFileScopeGate>;
type ActiveScope = {
  gate: Gate;
  scope: TaskFileScope;
  key: string;
  path: string;
};
type ImportState = {
  pending?: boolean;
  result?: TaskArtifactImport;
  problem?: Problem;
};
type PublishedArtifact = DecreeWorkspace['artifacts'][number];

export function suggestArtifactPath(displayName: string, artifactId: string) {
  const raw = displayName.trim();
  const extension = raw.match(/(\.[a-zA-Z0-9]{1,10})$/)?.[1] ?? '';
  if (
    !raw ||
    raw === '.' ||
    raw === '..' ||
    /[\\/:\x00-\x1f\x7f<>"|?*]/.test(raw) ||
    /[. ]$/.test(raw) ||
    /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(raw)
  )
    return `${artifactId}${extension || '.bin'}`;
  return raw;
}

export function TaskFilesPanel({
  resources,
  connected,
}: {
  resources: DecreeDesktopResources;
  connected: boolean;
}) {
  const baseClient = useChaotangClient();
  const client = baseClient as typeof baseClient & Partial<TaskFilesClient>;
  const { user, authGeneration } = useChaotangProvider();
  const workspace = useDecreeWorkspace(resources.jobId);
  const supported = Boolean(
    client.listTaskFiles && client.readTaskFile && client.importTaskArtifact
  );
  const scope = useMemo<TaskFileScope | undefined>(
    () =>
      user
        ? {
            ownerId: user.id,
            generation: String(authGeneration),
            bindingId: resources.binding.bindingId,
            jobId: resources.jobId,
            workspaceId: resources.workspace.id,
          }
        : undefined,
    [
      authGeneration,
      resources.binding.bindingId,
      resources.jobId,
      resources.workspace.id,
      user,
    ]
  );
  const scopeKey = scope
    ? [
        scope.ownerId,
        scope.generation,
        scope.bindingId,
        scope.jobId,
        scope.workspaceId,
      ].join('\u0000')
    : '';
  const active = useRef<ActiveScope | null>(null);
  const latest = useRef({ scopeKey, connected });
  latest.current = { scopeKey, connected };
  const isCurrent = useCallback(
    (context: ActiveScope) =>
      active.current === context &&
      latest.current.connected &&
      latest.current.scopeKey === context.key,
    []
  );
  const [directory, setDirectory] = useState<{
    loading?: boolean;
    data?: TaskFileList;
    problem?: Problem;
  }>({});
  const [preview, setPreview] = useState<{
    loading?: boolean;
    data?: TaskFileRead;
    problem?: Problem;
  }>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [imports, setImports] = useState<Record<string, ImportState>>({});
  const artifacts = (workspace.data?.artifacts ?? []).filter(
    (artifact) => artifact.state.toLowerCase() === 'published'
  );

  const loadDirectory = useCallback(
    async (path: string, context = active.current) => {
      if (!context || !isCurrent(context) || !client.listTaskFiles) return;
      const ticket = context.gate.begin('directory');
      // Changing directory invalidates the previous file read as well.
      context.gate.begin('preview');
      context.path = path;
      setDirectory({ loading: true });
      setPreview({});
      const input = taskFileListInput({
        jobId: context.scope.jobId,
        relativePath: path,
      });
      const settled = await context.gate.settle(
        ticket,
        client.listTaskFiles(input),
        (value) => decodeTaskFileList(value, ticket.scope, path)
      );
      if (!isCurrent(context)) return;
      if (settled.status === 'accepted') setDirectory({ data: settled.value });
      if (settled.status === 'error')
        setDirectory({ problem: taskFilesError(settled.error) });
    },
    [client, isCurrent]
  );

  useEffect(() => {
    active.current?.gate.dispose();
    active.current = null;
    setDirectory({});
    setPreview({});
    setImports({});
    if (!scope || !supported || !connected) return;
    const context = {
      gate: createTaskFileScopeGate(scope),
      scope,
      key: scopeKey,
      path: '',
    };
    active.current = context;
    void loadDirectory('', context);
    return () => {
      context.gate.dispose();
      if (active.current === context) active.current = null;
    };
  }, [loadDirectory, scopeKey, supported, connected]);

  useEffect(() => setTargets({}), [scopeKey]);

  useEffect(() => {
    setTargets((current) => {
      const next = { ...current };
      for (const artifact of artifacts)
        next[artifact.id] ??= suggestArtifactPath(
          artifact.displayName,
          artifact.id
        );
      return next;
    });
  }, [workspace.dataUpdatedAt, scopeKey, connected]);

  const openFile = async (entry: TaskFileEntry) => {
    const context = active.current;
    if (!context || !isCurrent(context) || !client.readTaskFile) return;
    const ticket = context.gate.begin('preview');
    setPreview({ loading: true });
    const input = taskFileReadInput({
      jobId: context.scope.jobId,
      relativePath: entry.relativePath,
    });
    const settled = await context.gate.settle(
      ticket,
      client.readTaskFile(input),
      (value) => decodeTaskFileRead(value, ticket.scope, entry.relativePath)
    );
    if (!isCurrent(context)) return;
    if (settled.status === 'accepted') setPreview({ data: settled.value });
    if (settled.status === 'error')
      setPreview({ problem: taskFilesError(settled.error) });
  };

  const importArtifact = async (artifact: PublishedArtifact) => {
    const context = active.current;
    if (!context || !isCurrent(context) || !client.importTaskArtifact) return;
    const target = targets[artifact.id] ?? '';
    let input;
    try {
      input = taskArtifactImportInput({
        jobId: context.scope.jobId,
        artifactId: artifact.id,
        relativePath: target,
      });
    } catch (error) {
      setImports((current) => ({
        ...current,
        [artifact.id]: { problem: taskFilesError(error) },
      }));
      return;
    }
    const ticket = context.gate.begin(`import:${artifact.id}`);
    setImports((current) => ({
      ...current,
      [artifact.id]: { pending: true },
    }));
    const settled = await context.gate.settle(
      ticket,
      client.importTaskArtifact(input),
      (value) => decodeTaskArtifactImport(value, ticket.scope, input)
    );
    if (!isCurrent(context)) return;
    if (settled.status === 'accepted') {
      setImports((current) => ({
        ...current,
        [artifact.id]: { result: settled.value },
      }));
      void loadDirectory(context.path, context);
    }
    if (settled.status === 'error')
      setImports((current) => ({
        ...current,
        [artifact.id]: { problem: taskFilesError(settled.error) },
      }));
  };

  const current = Boolean(
    active.current && isCurrent(active.current) && supported
  );
  return (
    <TaskFilesView
      supported={supported}
      connected={connected && current}
      previewAvailable={resources.previewAvailable}
      loading={current ? directory.loading : undefined}
      problem={current ? directory.problem : undefined}
      path={current ? (directory.data?.relativePath ?? '') : ''}
      entries={current ? (directory.data?.entries ?? []) : []}
      truncated={current ? directory.data?.truncated : undefined}
      previewLoading={current ? preview.loading : undefined}
      preview={current ? preview.data : undefined}
      previewProblem={current ? preview.problem : undefined}
      artifacts={current ? artifacts : []}
      targets={current ? targets : {}}
      imports={current ? imports : {}}
      onOpenDirectory={(entry) => void loadDirectory(entry.relativePath)}
      onOpenFile={(entry) => void openFile(entry)}
      onBack={() => {
        const path = active.current?.path ?? '';
        void loadDirectory(
          path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
        );
      }}
      onReload={() => void loadDirectory(active.current?.path ?? '')}
      onTargetChange={(artifactId, value) =>
        setTargets((current) => ({ ...current, [artifactId]: value }))
      }
      onImport={(artifact) => void importArtifact(artifact)}
    />
  );
}

export function TaskFilesView({
  supported,
  connected,
  previewAvailable = false,
  loading,
  problem,
  path,
  entries,
  truncated,
  previewLoading,
  preview,
  previewProblem,
  artifacts,
  targets,
  imports,
  onOpenDirectory,
  onOpenFile,
  onBack,
  onReload,
  onTargetChange,
  onImport,
}: {
  supported: boolean;
  connected: boolean;
  previewAvailable?: boolean;
  loading?: boolean;
  problem?: Problem;
  path: string;
  entries: TaskFileEntry[];
  truncated?: boolean;
  previewLoading?: boolean;
  preview?: TaskFileRead;
  previewProblem?: Problem;
  artifacts: PublishedArtifact[];
  targets: Record<string, string>;
  imports: Record<string, ImportState>;
  onOpenDirectory: (entry: TaskFileEntry) => void;
  onOpenFile: (entry: TaskFileEntry) => void;
  onBack: () => void;
  onReload: () => void;
  onTargetChange: (artifactId: string, value: string) => void;
  onImport: (artifact: PublishedArtifact) => void;
}) {
  const showPage = Boolean(
    previewAvailable &&
      preview?.kind === 'text' &&
      !preview.truncated &&
      /\.html?$/i.test(preview.entry.relativePath)
  );
  return (
    <section
      aria-label="任务文件"
      className="space-y-base rounded border p-base"
    >
      <h3 className="text-lg text-high">任务文件</h3>
      <p className="text-low">
        只显示本任务工作区内的文件。已发布成果需手动选择路径后导入，不会自动覆盖现有文件。
      </p>
      {!supported ? (
        <p>当前客户端暂不支持任务文件，请使用已配置的桌面客户端。</p>
      ) : loading ? (
        <p role="status">正在读取任务文件…</p>
      ) : problem ? (
        <>
          <p
            role={problem.kind === 'error' ? 'alert' : 'status'}
            className={problem.kind === 'error' ? 'text-error' : 'text-low'}
          >
            {problem.message}
          </p>
          <button
            type="button"
            className={button}
            disabled={!connected}
            onClick={onReload}
          >
            重新读取文件
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-base">
            <p className="break-all text-low">当前位置：{path || '根目录'}</p>
            {path && (
              <button
                type="button"
                className={button}
                disabled={!connected}
                onClick={onBack}
              >
                返回上一级
              </button>
            )}
            <button
              type="button"
              className={button}
              disabled={!connected}
              onClick={onReload}
            >
              刷新目录
            </button>
          </div>
          {entries.length ? (
            <ul className="space-y-half">
              {entries.map((entry) => (
                <li key={entry.relativePath}>
                  <button
                    type="button"
                    className="w-full rounded border p-base text-left hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand"
                    disabled={!connected}
                    onClick={() =>
                      entry.kind === 'directory'
                        ? onOpenDirectory(entry)
                        : onOpenFile(entry)
                    }
                  >
                    <span>
                      {entry.kind === 'directory' ? '目录' : '文件'} ·{' '}
                    </span>
                    <span className="break-all">{entry.name}</span>
                    {entry.bytes !== null && (
                      <span className="text-low"> · {entry.bytes} 字节</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-low">当前目录没有文件。</p>
          )}
          {truncated && (
            <p role="status" className="text-low">
              目录内容过多，当前只显示安全上限内的条目。
            </p>
          )}
        </>
      )}

      <section
        aria-label="文件预览"
        className="space-y-half rounded border p-base"
      >
        <h4 className="text-high">文件预览</h4>
        {previewLoading ? (
          <p role="status">正在读取文件…</p>
        ) : previewProblem ? (
          <p role="alert" className="text-error">
            {previewProblem.message}
          </p>
        ) : preview?.kind === 'text' ? (
          <div
            key={`${preview.entry.relativePath}:${preview.sha256}`}
            className="space-y-base"
          >
            <p className="break-all text-low">{preview.entry.relativePath}</p>
            {showPage && (
              <details
                open
                className="rounded border border-brand/30 bg-panel/75 p-base"
              >
                <summary className="cursor-pointer text-high focus-visible:ring-1 focus-visible:ring-brand">
                  页面效果（只读）
                </summary>
                <p className="my-base text-sm text-low">
                  工部呈上此文件的静态页面。可收起预览继续查看文件；网页脚本和外部资源不会运行，页面显示不代表任务已验收。
                </p>
                <iframe
                  title={`任务静态预览：${preview.entry.relativePath}`}
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={securePreviewDocument(preview.text)}
                  className="h-96 w-full rounded border bg-white"
                />
              </details>
            )}
            <details
              open={!showPage}
              className="rounded border border-brand/15 p-base"
            >
              <summary className="cursor-pointer text-normal focus-visible:ring-1 focus-visible:ring-brand">
                查看文件原文
              </summary>
              <pre className="mt-base max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-secondary p-base">
                {preview.text}
              </pre>
            </details>
            {preview.truncated && (
              <p role="status" className="text-low">
                文件内容仅显示前段，原文件未被修改。
              </p>
            )}
            <details className="text-xs text-low">
              <summary className="cursor-pointer">文件校验信息</summary>
              <p className="break-all">SHA-256：{preview.sha256}</p>
            </details>
          </div>
        ) : preview ? (
          <p className="text-low">
            {preview.reason === 'binary'
              ? '这是二进制文件，当前不提供文字预览。'
              : preview.reason === 'unsupported_encoding'
                ? '该文件的文字编码暂不支持预览。'
                : '文件过大，未读取内容或计算摘要。'}
          </p>
        ) : (
          <p className="text-low">选择文件后在这里查看只读内容。</p>
        )}
      </section>

      <section
        aria-label="导入已发布成果"
        className="space-y-base rounded border p-base"
      >
        <h4 className="text-high">导入已发布成果</h4>
        {artifacts.length ? (
          artifacts.map((artifact) => {
            const state = imports[artifact.id];
            return (
              <div
                key={artifact.id}
                className="space-y-half rounded border p-base"
              >
                <p>{artifact.displayName}</p>
                <label className="block text-low">
                  导入路径
                  <input
                    value={targets[artifact.id] ?? ''}
                    onChange={(event) =>
                      onTargetChange(artifact.id, event.currentTarget.value)
                    }
                    className="mt-half w-full rounded border bg-transparent px-base py-half text-normal"
                  />
                </label>
                <button
                  type="button"
                  className={button}
                  disabled={!connected || state?.pending}
                  onClick={() => onImport(artifact)}
                >
                  {state?.pending ? '正在导入…' : '导入到任务文件'}
                </button>
                {state?.problem && (
                  <p role="alert" className="text-error">
                    导入未完成：{state.problem.message}
                  </p>
                )}
                {state?.result && (
                  <p role="status" className="break-all text-low">
                    {state.result.status === 'imported'
                      ? '导入完成并通过摘要校验。'
                      : '内容已存在且校验一致，未重复写入。'}{' '}
                    SHA-256：{state.result.sha256}
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-low">当前没有可导入的已发布成果。</p>
        )}
      </section>
    </section>
  );
}
