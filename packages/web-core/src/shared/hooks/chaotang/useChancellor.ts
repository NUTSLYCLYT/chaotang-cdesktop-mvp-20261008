import { ownerQueryKey } from '@/shared/lib/chaotangFusion';
import { validateDesktopResources } from '@/shared/components/chaotang/desktopResourceContract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
  type ChancellorConsultMessage,
  type ChancellorDraftInput,
  type IssueChancellorDecreeInput,
} from '@/shared/providers/ChaotangProvider';

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
    queryFn: () => client.decreeJob(jobId!),
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
    mutationFn: (jobId: string) => client.cancelDecreeJob(jobId),
    onSuccess: async (job) => {
      queryClient.setQueryData(
        ownerQueryKey(user?.id, 'decree-job', job.jobId),
        job
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
    mutationFn: (jobId: string) => client.retryDecreeJob(jobId),
    onSuccess: async (job) => {
      queryClient.setQueryData(
        ownerQueryKey(user?.id, 'decree-job', job.jobId),
        job
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
