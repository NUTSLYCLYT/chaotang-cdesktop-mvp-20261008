import type {
  ChaotangClient,
  DecreeJob,
  DecreeJobPage,
  DecreeJobHistoryQuery,
  DecreeHistoryAnnotation,
  WorkspaceArtifactSave,
} from '@/shared/providers/ChaotangProvider';

export function parseJobSearch(search: Record<string, unknown>): {
  job?: string;
} {
  return typeof search.job === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(search.job)
    ? { job: search.job }
    : {};
}
export function taskTitle(job: Pick<DecreeJob, 'jobId' | 'title'>): string {
  return job.title?.trim() || `未命名任务 · ${job.jobId}`;
}

export function canArchiveHistory(state: string): boolean {
  return ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(state);
}

export function canRetryTask(
  job: Pick<
    DecreeJob,
    | 'state'
    | 'error'
    | 'providerRequestCount'
    | 'cancelRequested'
    | 'result'
    | 'replyId'
  >
): boolean {
  if (
    job.state !== 'FAILED' ||
    job.cancelRequested ||
    job.result ||
    job.replyId
  )
    return false;
  return (
    job.error?.code === 'validation_failed' ||
    (job.error?.code === 'token_budget_transport_unavailable' &&
      job.providerRequestCount === 0)
  );
}

export function validateHistoryPage(
  page: DecreeJobPage,
  input: DecreeJobHistoryQuery
): DecreeJobPage {
  if (
    !page ||
    !Array.isArray(page.items) ||
    !Number.isSafeInteger(page.total) ||
    page.total < page.items.length ||
    page.limit !== (input.limit ?? 50) ||
    page.offset !== (input.offset ?? 0) ||
    page.items.length > page.limit ||
    page.items.some(
      (item) =>
        !item ||
        typeof item.jobId !== 'string' ||
        typeof item.historyArchived !== 'boolean'
    )
  ) {
    throw new Error(
      '历史查询暂不可用：服务端未提供一致的分页与历史标记，请检查版本后重试'
    );
  }
  return page;
}

export function validateHistoryAnnotation(
  result: DecreeHistoryAnnotation,
  jobId: string,
  archived: boolean
): DecreeHistoryAnnotation {
  if (
    !result ||
    result.jobId !== jobId ||
    typeof result.historyArchived !== 'boolean' ||
    result.historyArchived !== archived ||
    (result.updatedAt !== null && typeof result.updatedAt !== 'string')
  ) {
    throw new Error('历史记录更新回执无效，请刷新记录确认实际状态');
  }
  return result;
}
export function filterTaskHistory<
  T extends Pick<DecreeJob, 'jobId' | 'title' | 'state'>,
>(items: T[], query: string, state: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(
    (job) =>
      (state === 'ALL' || job.state === state) &&
      `${taskTitle(job)} ${job.jobId}`.toLocaleLowerCase().includes(needle)
  );
}
export type ArtifactTransferResult =
  | WorkspaceArtifactSave
  | { status: 'handed-off' };
export function createArtifactTransfer() {
  const pending = new Set<string>();
  return async (
    client: Pick<
      ChaotangClient,
      'saveWorkspaceArtifact' | 'downloadWorkspaceArtifact'
    >,
    jobId: string,
    artifact: { id: string; displayName: string; downloadPath?: string | null },
    handoff?: (blob: Blob, name: string) => void
  ): Promise<ArtifactTransferResult | undefined> => {
    const key = JSON.stringify([jobId, artifact.id]);
    if (pending.has(key)) return undefined;
    pending.add(key);
    try {
      if (client.saveWorkspaceArtifact) {
        const result = await client.saveWorkspaceArtifact(jobId, artifact.id);
        if (result.status === 'cancelled') return result;
        if (
          result.status !== 'saved' ||
          !result.path ||
          !/^[a-fA-F0-9]{64}$/.test(result.sha256 ?? '') ||
          !Number.isSafeInteger(result.bytes) ||
          result.bytes! < 0
        )
          throw new Error('文件保存回执不完整，请检查实际文件');
        return result;
      }
      if (
        !client.downloadWorkspaceArtifact ||
        !artifact.downloadPath ||
        !handoff
      )
        throw new Error('当前客户端尚未接入文件下载');
      const blob = await client.downloadWorkspaceArtifact(
        artifact.downloadPath
      );
      handoff(blob, artifact.displayName.replace(/[\\/:*?"<>|]/g, '_'));
      return { status: 'handed-off' };
    } finally {
      pending.delete(key);
    }
  };
}
