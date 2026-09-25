import { useRef } from 'react';
import {
  useDecreeDesktopResources,
  useLinkDecreeWorkspace,
} from '@/shared/hooks/chaotang/useChancellor';
import {
  useChaotangClient,
  type DecreeDesktopResources,
} from '@/shared/providers/ChaotangProvider';
import { desktopResourcesError } from './desktopResourceContract';
import { TaskFilesPanel } from './TaskFilesPanel';
import { TaskSessionHistoryPanel } from './TaskSessionHistoryPanel';
import { TaskDiffPanel } from './TaskDiffPanel';
import { TaskExecutionPanel } from './TaskExecutionPanel';
import { TaskTerminalPanel } from './TaskTerminalPanel';
import { TaskPreviewPanel } from './TaskPreviewPanel';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand';

export function TaskDesktopResources({
  jobId,
  connected,
  businessAttemptId,
}: {
  jobId: string;
  connected: boolean;
  businessAttemptId?: string | null;
}) {
  const client = useChaotangClient();
  const resources = useDecreeDesktopResources(jobId, businessAttemptId);
  const link = useLinkDecreeWorkspace(jobId, businessAttemptId);
  const linking = useRef(false);
  return (
    <div className="space-y-base">
      <DesktopResourcesView
        supported={Boolean(client.decreeDesktopResources)}
        canLink={Boolean(client.linkDecreeWorkspace)}
        connected={connected}
        data={resources.data}
        loading={resources.isLoading}
        error={resources.error}
        linkError={link.error}
        linking={link.isPending}
        onRead={() => {
          link.reset();
          void resources.refetch();
        }}
        onLink={() => {
          if (
            linking.current ||
            !connected ||
            resources.isFetching ||
            desktopResourcesError(resources.error).kind !== 'unlinked'
          )
            return;
          linking.current = true;
          void link
            .mutateAsync()
            .catch(() => {
              /* Mutation exposes the error in the card. */
            })
            .finally(() => {
              linking.current = false;
            });
        }}
      />
      {resources.data && !resources.error && (
        <>
          <TaskExecutionPanel
            resources={resources.data}
            connected={connected}
          />
          <TaskTerminalPanel resources={resources.data} connected={connected} />
          <TaskPreviewPanel resources={resources.data} connected={connected} />
          <TaskSessionHistoryPanel
            resources={resources.data}
            connected={connected}
          />
          <TaskDiffPanel resources={resources.data} connected={connected} />
          <TaskFilesPanel resources={resources.data} connected={connected} />
        </>
      )}
    </div>
  );
}

export function DesktopResourcesView({
  supported,
  canLink = true,
  connected,
  loading,
  data,
  error,
  linkError,
  linking,
  onRead,
  onLink,
}: {
  supported: boolean;
  canLink?: boolean;
  connected: boolean;
  loading?: boolean;
  data?: DecreeDesktopResources;
  error?: unknown;
  linkError?: unknown;
  linking?: boolean;
  onRead: () => void;
  onLink?: () => void;
}) {
  const problem = error ? desktopResourcesError(error) : undefined;
  return (
    <section
      aria-label="技术工作区关联"
      className="space-y-base rounded border p-base"
    >
      <h3 className="text-lg text-high">技术工作区</h3>
      <p className="text-low">
        文件、已发布成果导入、真实会话记录、任务差异、受监督执行、任务终端和安全静态预览已接入。
      </p>
      {!supported ? (
        <p>当前客户端暂不支持技术工作区关联，请使用已配置的桌面客户端。</p>
      ) : loading ? (
        <p role="status">正在读取技术工作区…</p>
      ) : problem ? (
        <>
          <p
            role={problem.kind === 'unlinked' ? 'status' : 'alert'}
            className={problem.kind === 'unlinked' ? 'text-low' : 'text-error'}
          >
            {problem.message}
          </p>
          {problem.kind === 'unlinked' && canLink && onLink && (
            <button
              type="button"
              className={button}
              disabled={!connected || linking}
              onClick={onLink}
            >
              {linking ? '正在关联…' : '关联技术工作区'}
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={!connected || linking}
            onClick={onRead}
          >
            重新读取关联
          </button>
        </>
      ) : data ? (
        <>
          <p role="status">已关联技术工作区</p>
          <dl className="space-y-half break-words">
            <dt className="text-low">工作区</dt>
            <dd>
              {data.workspace.name ?? '未命名工作区'} · {data.workspace.id}
            </dd>
            <dt className="text-low">会话</dt>
            <dd>
              {data.session.name ?? '未命名会话'} · {data.session.id}
            </dd>
            <dt className="text-low">业务执行追踪</dt>
            <dd className="break-all">
              {data.binding.businessAttemptId ?? '当前任务尚未进入业务执行'}
            </dd>
            <dt className="text-low">分支</dt>
            <dd>{data.workspace.branch}</dd>
            <dt className="text-low">工作区状态</dt>
            <dd>
              {data.workspace.archived ? '已归档' : '活动'} ·{' '}
              {data.workspace.useWorktree ? '独立工作树' : '本地目录'}
            </dd>
          </dl>
          <details>
            <summary>关联凭据</summary>
            <p className="break-all">{data.binding.bindingId}</p>
            <p className="break-all">{data.binding.resourceFingerprint}</p>
            <p>{data.binding.createdAt}</p>
          </details>
          <button
            type="button"
            className={button}
            disabled={!connected || linking}
            onClick={onRead}
          >
            重新读取关联
          </button>
        </>
      ) : (
        <p role="status">等待连接后读取关联状态。</p>
      )}
      {Boolean(linkError) && (
        <p role="alert" className="text-error">
          关联未完成：{desktopResourcesError(linkError).message}
        </p>
      )}
    </section>
  );
}
