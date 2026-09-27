import { ownerQueryKey } from '@/shared/lib/chaotangFusion';
import { validateDecreeJobItems } from '@/shared/components/chaotang/decreeJobReceipt';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  validateHistoryAnnotation,
  validateHistoryPage,
} from '@/shared/components/chaotang/taskWorkspaceState';
import {
  useChaotangClient,
  useChaotangProvider,
  type DecreeJobHistoryQuery,
} from '@/shared/providers/ChaotangProvider';

export function useDecreeJobs(input: DecreeJobHistoryQuery = {}) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  const criteria = {
    q: input.q ?? '',
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
    archived: input.archived ?? 'active',
  };
  return useQuery({
    queryKey: [...ownerQueryKey(user?.id, 'decree-jobs'), criteria],
    queryFn: async () => {
      const page = validateHistoryPage(
        await client.decreeJobs(criteria),
        criteria
      );
      validateDecreeJobItems(page.items);
      return page;
    },
    enabled: Boolean(user && health),
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.status !== 'error' &&
      query.state.data?.items.some((job) =>
        ['QUEUED', 'RUNNING'].includes(job.state)
      )
        ? 5_000
        : false,
    retry: 1,
  });
}

export function useSetDecreeHistoryArchived() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['chaotang', user?.id, 'history-annotation'],
    mutationFn: async ({
      jobId,
      archived,
    }: {
      jobId: string;
      archived: boolean;
    }) => {
      if (!client.setDecreeHistoryArchived)
        throw new Error('当前客户端暂不支持历史记录归档，请更新后重试');
      return validateHistoryAnnotation(
        await client.setDecreeHistoryArchived(jobId, archived),
        jobId,
        archived
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ownerQueryKey(user?.id, 'decree-jobs'),
      });
    },
  });
}
