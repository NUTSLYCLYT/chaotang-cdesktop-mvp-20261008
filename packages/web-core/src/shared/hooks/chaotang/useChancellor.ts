import { ownerQueryKey } from '@/shared/lib/chaotangFusion';
import { validateDesktopResources } from '@/shared/components/chaotang/desktopResourceContract';
import {
  validateDecreeJobReceipt,
  validateRetryReceipt,
} from '@/shared/components/chaotang/decreeJobReceipt';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
  type ChancellorConsultMessage,
  type ChancellorDraftInput,
  type DecreeJob,
  type IssueChancellorDecreeInput,
} from '@/shared/providers/ChaotangProvider';

const TERMINAL_DECREE_JOB_STATES = new Set<DecreeJob['state']>([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|z|[+-]\d{2}:?\d{2})$/;

function timestampMicroseconds(value: string): bigint | null {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  // Date.parse already resolved the UTC instant (including the timezone) and
  // the first three fractional digits; digits four to six carry the remaining
  // microsecond precision that Date.parse drops.
  const fraction = ISO_TIMESTAMP_PATTERN.exec(value)?.[7] ?? '';
  const microseconds = BigInt((fraction.slice(3, 6) + '000').slice(0, 3));
  return BigInt(milliseconds) * 1000n + microseconds;
}

/** Compare receipt timestamps as instants, honoring ISO timezones and the
 * service's microsecond precision so equivalent representations compare equal.
 */
export function compareReceiptTimestamps(left: string, right: string): number {
  const leftMicros = timestampMicroseconds(left);
  const rightMicros = timestampMicroseconds(right);
  if (leftMicros !== null && rightMicros !== null)
    return leftMicros < rightMicros ? -1 : leftMicros > rightMicros ? 1 : 0;
  const leftMillis = Date.parse(left);
  const rightMillis = Date.parse(right);
  if (Number.isFinite(leftMillis) && Number.isFinite(rightMillis))
    return leftMillis < rightMillis ? -1 : leftMillis > rightMillis ? 1 : 0;
  return 0;
}

/** Shared ordering rule for one owner's cached receipt of one job. It is used
 * both by the detail query's structural sharing and by the cancel/retry cache
 * writes so late or conflicting receipts cannot regress task state. It always
 * returns one of the two input snapshots verbatim: it never merges fields from
 * another job and never fabricates a composed receipt.
 */
export function mergeDecreeJobReceipt(
  previous: DecreeJob | undefined,
  next: DecreeJob
): DecreeJob {
  if (!previous) return next;
  if (previous.jobId !== next.jobId) return next;

  const previousTerminal = TERMINAL_DECREE_JOB_STATES.has(previous.state);
  const nextTerminal = TERMINAL_DECREE_JOB_STATES.has(next.state);
  const order = compareReceiptTimestamps(previous.updatedAt, next.updatedAt);

  // A stale receipt never replaces the newer cached snapshot.
  if (order > 0) return previous;

  if (previousTerminal) {
    // A known terminal state is final: only a newer snapshot of the same
    // terminal state may complete its results; anything else keeps the cache,
    // even when it claims to be newer or to carry a registered cancel.
    if (nextTerminal && next.state === previous.state && order < 0) return next;
    return previous;
  }

  // A terminal receipt is more definite than an active one.
  if (nextTerminal) return next;

  // Both active: a genuinely newer snapshot wins.
  if (order < 0) return next;

  // At the same instant prefer the snapshot that already registered a cancel;
  // otherwise keep the existing snapshot.
  if (next.cancelRequested && !previous.cancelRequested) return next;
  return previous;
}

export function useChancellorConsult() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  return useMutation({
    mutationKey: ['chaotang', user?.id],
    mutationFn: (messages: ChancellorConsultMessage[]) =>
      client.chancellorConsult(messages),
  });
}

export function useChancellorDraft() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  return useMutation({
    mutationKey: ['chaotang', user?.id],
    mutationFn: (input: ChancellorDraftInput) => client.chancellorDraft(input),
  });
}

export function useIssueChancellorDecree() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['chaotang', user?.id],
    mutationFn: (input: IssueChancellorDecreeInput) =>
      client.issueChancellorDecree(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ownerQueryKey(user?.id, 'decree-jobs'),
      });
    },
  });
}

export function useDecreeJob(jobId?: string) {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  return useQuery({
    queryKey: ownerQueryKey(user?.id, 'decree-job', jobId),
    queryFn: async () =>
      validateDecreeJobReceipt(await client.decreeJob(jobId!), jobId!),
    structuralSharing: (oldData: unknown, newData: unknown) =>
      mergeDecreeJobReceipt(
        oldData as DecreeJob | undefined,
        newData as DecreeJob
      ),
    enabled: Boolean(user && jobId),
    retry: 1,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const state = query.state.data?.state;
      return state && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(state)
        ? false
        : 2000;
    },
  });
}

export function useCancelDecreeJob() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['chaotang', user?.id],
    mutationFn: async (jobId: string) =>
      validateDecreeJobReceipt(await client.cancelDecreeJob(jobId), jobId),
    onSuccess: async (job) => {
      queryClient.setQueryData(
        ownerQueryKey(user?.id, 'decree-job', job.jobId),
        (previous?: DecreeJob) => mergeDecreeJobReceipt(previous, job)
      );
      await queryClient.invalidateQueries({
        queryKey: ownerQueryKey(user?.id, 'decree-jobs'),
      });
    },
  });
}

export function useRetryDecreeJob() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['chaotang', user?.id, 'retry-decree-job'],
    mutationFn: async (jobId: string) =>
      validateRetryReceipt(await client.retryDecreeJob(jobId), jobId),
    onSuccess: async (job) => {
      queryClient.setQueryData(
        ownerQueryKey(user?.id, 'decree-job', job.jobId),
        (previous?: DecreeJob) => mergeDecreeJobReceipt(previous, job)
      );
      await queryClient.invalidateQueries({
        queryKey: ownerQueryKey(user?.id, 'decree-jobs'),
      });
    },
  });
}

export function useDecreeWorkspace(jobId?: string) {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  return useQuery({
    queryKey: ownerQueryKey(user?.id, 'decree-workspace', jobId),
    queryFn: () => client.decreeWorkspace!(jobId!),
    enabled: Boolean(user && jobId && client.decreeWorkspace),
    refetchInterval: (query) => (query.state.status === 'error' ? false : 5000),
    retry: 1,
  });
}

export function useDecreeDesktopResources(
  jobId: string,
  businessAttemptId?: string | null
) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ownerQueryKey(
      user?.id,
      'decree-desktop-resources',
      JSON.stringify([jobId, businessAttemptId ?? null])
    ),
    queryFn: async () => {
      if (!client.decreeDesktopResources)
        throw new Error('当前客户端暂不支持技术工作区关联。');
      return validateDesktopResources(
        await client.decreeDesktopResources(jobId),
        jobId
      );
    },
    enabled: Boolean(user && health && jobId && client.decreeDesktopResources),
    retry: false,
  });
}

export function useLinkDecreeWorkspace(
  jobId: string,
  businessAttemptId?: string | null
) {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const queryClient = useQueryClient();
  const queryKey = ownerQueryKey(
    user?.id,
    'decree-desktop-resources',
    JSON.stringify([jobId, businessAttemptId ?? null])
  );
  return useMutation({
    mutationKey: [...queryKey, 'link'],
    mutationFn: async () => {
      if (!client.linkDecreeWorkspace)
        throw new Error('当前客户端暂不支持技术工作区关联。');
      return validateDesktopResources(
        await client.linkDecreeWorkspace(jobId),
        jobId
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
}
