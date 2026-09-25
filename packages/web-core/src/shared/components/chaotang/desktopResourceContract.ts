import type { DecreeDesktopResources } from '@/shared/providers/ChaotangProvider';

export function validateDesktopResources(
  value: unknown,
  jobId: string
): DecreeDesktopResources {
  const fail = (): never => {
    throw new Error('技术工作区回执无效或任务关联不一致，请重新读取。');
  };
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : fail();
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0;
  const v = record(value),
    binding = record(v.binding),
    workspace = record(v.workspace),
    session = record(v.session);
  for (const [object, keys] of [
    [
      binding,
      [
        'bindingId',
        'jobId',
        'installationId',
        'workspaceId',
        'sessionId',
        'resourceFingerprint',
        'createdAt',
      ],
    ],
    [workspace, ['id', 'branch', 'createdAt', 'updatedAt']],
    [session, ['id', 'workspaceId', 'createdAt', 'updatedAt']],
  ] as const) {
    if (keys.some((key) => !text(object[key]))) fail();
  }
  if (
    !text(jobId) ||
    v.jobId !== jobId ||
    binding.jobId !== jobId ||
    binding.workspaceId !== workspace.id ||
    binding.sessionId !== session.id ||
    session.workspaceId !== workspace.id ||
    v.filesAvailable !== true ||
    v.executionAvailable !== true ||
    v.terminalAvailable !== true ||
    v.previewAvailable !== true ||
    typeof workspace.archived !== 'boolean' ||
    typeof workspace.useWorktree !== 'boolean'
  )
    fail();
  if (
    !Object.hasOwn(binding, 'businessAttemptId') ||
    (binding.businessAttemptId !== null &&
      (typeof binding.businessAttemptId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(binding.businessAttemptId)))
  )
    fail();
  for (const value of [workspace.name, session.name, session.executor])
    if (value !== null && typeof value !== 'string') fail();
  return v as unknown as DecreeDesktopResources;
}

export function desktopResourcesError(error: unknown): {
  kind: 'unlinked' | 'unavailable' | 'error';
  message: string;
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '技术工作区读取失败，请重试。';
  if (message === 'OWNER_BINDING_NOT_FOUND')
    return { kind: 'unlinked', message: '技术工作区尚未关联。' };
  if (message === 'OWNER_RUNTIME_UNAVAILABLE')
    return {
      kind: 'unavailable',
      message: '专用技术运行时尚未配置，当前无法关联或读取工作区。',
    };
  return { kind: 'error', message };
}
