import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useChaotangClient,
  useChaotangProvider,
  type DecreeDesktopResources,
} from '@/shared/providers/ChaotangProvider';
import {
  decodeTaskFileRead,
  taskFileReadInput,
  taskFilesError,
  type TaskFileRead,
  type TaskFileScope,
  type TaskFilesClient,
} from './taskFilesContract';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand';
const PREVIEW_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";

export function securePreviewDocument(html: string) {
  const body = html.replace(/^\s*<!doctype[^>]*>/i, '');
  return `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">${body}`;
}

export function acceptTaskHtmlPreview(
  value: unknown,
  scope: TaskFileScope,
  relativePath: string
) {
  if (!/\.html?$/i.test(relativePath))
    throw new Error('仅支持任务内的 .html 或 .htm 文件。');
  const file = decodeTaskFileRead(value, scope, relativePath);
  if (file.kind !== 'text')
    throw new Error('该文件不是完整的 UTF-8 文本，不能安全预览。');
  if (file.truncated) throw new Error('该 HTML 文件已被截断，不能安全预览。');
  return {
    document: securePreviewDocument(file.text),
    sha256: file.sha256,
  };
}

export function TaskPreviewPanel({
  resources,
  connected,
}: {
  resources: DecreeDesktopResources;
  connected: boolean;
}) {
  const baseClient = useChaotangClient();
  const client = baseClient as typeof baseClient & Partial<TaskFilesClient>;
  const { user, authGeneration } = useChaotangProvider();
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    document: string;
    sha256: string;
    openedPath: string;
  }>();
  const [problem, setProblem] = useState<string>();
  const request = useRef(0);
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

  useEffect(() => {
    request.current += 1;
    setPath('');
    setBusy(false);
    setPreview(undefined);
    setProblem(undefined);
  }, [scopeKey]);

  const open = async () => {
    if (!scope || !client.readTaskFile) return;
    const current = ++request.current;
    setBusy(true);
    setPreview(undefined);
    setProblem(undefined);
    try {
      const input = taskFileReadInput({
        jobId: scope.jobId,
        relativePath: path.trim(),
      });
      if (!/\.html?$/i.test(input.relativePath))
        throw new Error('仅支持任务内的 .html 或 .htm 文件。');
      const value: TaskFileRead = await client.readTaskFile(input);
      const accepted = acceptTaskHtmlPreview(value, scope, input.relativePath);
      if (request.current === current)
        setPreview({ ...accepted, openedPath: input.relativePath });
    } catch (error) {
      if (request.current === current)
        setProblem(
          error instanceof Error && !('code' in error)
            ? error.message
            : taskFilesError(error).message
        );
    } finally {
      if (request.current === current) setBusy(false);
    }
  };

  return (
    <TaskPreviewView
      supported={Boolean(client.readTaskFile && resources.previewAvailable)}
      connected={connected && Boolean(scope)}
      path={path}
      busy={busy}
      document={preview?.document}
      sha256={preview?.sha256}
      openedPath={preview?.openedPath}
      problem={problem}
      onPathChange={setPath}
      onOpen={() => void open()}
      onClose={() => {
        request.current += 1;
        setPreview(undefined);
        setProblem(undefined);
        setBusy(false);
      }}
    />
  );
}

export function TaskPreviewView({
  supported,
  connected,
  path,
  busy,
  document,
  sha256,
  openedPath,
  problem,
  onPathChange,
  onOpen,
  onClose,
}: {
  supported: boolean;
  connected: boolean;
  path: string;
  busy: boolean;
  document?: string;
  sha256?: string;
  openedPath?: string;
  problem?: string;
  onPathChange: (path: string) => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="任务安全静态预览"
      className="space-y-base rounded border p-base"
    >
      <h3 className="text-lg text-high">任务安全静态预览</h3>
      <p className="text-low">
        输入任务内 HTML 文件路径。预览会禁用脚本、网络、表单、子页面和同源权限。
      </p>
      {!supported ? (
        <p>当前客户端暂不支持任务预览。</p>
      ) : (
        <>
          <label className="block space-y-half">
            <span>HTML 文件路径</span>
            <input
              className="w-full rounded border bg-primary px-base py-half"
              value={path}
              placeholder="输入任务内 HTML 文件路径，例如 reports/result.html"
              disabled={!connected || busy}
              onChange={(event) => onPathChange(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-half">
            <button
              type="button"
              className={button}
              disabled={!connected || busy || !path.trim()}
              onClick={onOpen}
            >
              {busy ? '正在读取…' : '打开安全预览'}
            </button>
            {document && (
              <button type="button" className={button} onClick={onClose}>
                关闭预览
              </button>
            )}
          </div>
        </>
      )}
      {problem && (
        <p role="alert" className="text-error">
          {problem}
        </p>
      )}
      {document && (
        <div className="space-y-half">
          <p className="break-all text-low">
            {openedPath} · SHA-256 {sha256}
          </p>
          <iframe
            title={`任务静态预览：${openedPath}`}
            sandbox=""
            srcDoc={document}
            className="h-96 w-full rounded border bg-white"
          />
        </div>
      )}
    </section>
  );
}
