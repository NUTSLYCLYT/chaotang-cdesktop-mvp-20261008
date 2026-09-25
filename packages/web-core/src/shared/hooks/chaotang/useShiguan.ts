import { useMutation, useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
  type ShiguanArchiveType,
  type ShiguanRecallInput,
  type ShiguanArchiveDecisionValue,
  type ShiguanReviewStatusValue,
} from '@/shared/providers/ChaotangProvider';
import { useQueryClient } from '@tanstack/react-query';

export function useShiguanArchives(archiveType?: ShiguanArchiveType) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: [
      'chaotang',
      'shiguan',
      'archives',
      user?.id,
      archiveType ?? 'all',
    ],
    queryFn: () => client.shiguanArchives(archiveType, 50),
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useShiguanArchive(archiveId?: string) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'shiguan', 'archive', user?.id, archiveId],
    queryFn: () => client.shiguanArchive(archiveId!),
    enabled: Boolean(user && health && archiveId),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useShiguanStatistics() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'shiguan', 'statistics', user?.id],
    queryFn: () => client.shiguanStatistics(),
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useShiguanRecall() {
  const client = useChaotangClient();
  return useMutation({
    mutationFn: (input: ShiguanRecallInput) => client.shiguanRecall(input),
  });
}

export function useShiguanReview() {
  const client = useChaotangClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      archiveId,
      status,
      note,
    }: {
      archiveId: string;
      status: ShiguanReviewStatusValue;
      note?: string;
    }) =>
      client.shiguanReview(archiveId, {
        status,
        reviewedAt: new Date().toISOString(),
        note,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['chaotang', 'shiguan'],
      });
    },
  });
}

export function useShiguanDecision() {
  const client = useChaotangClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      archiveId,
      decision,
    }: {
      archiveId: string;
      decision: ShiguanArchiveDecisionValue;
    }) => client.shiguanDecision(archiveId, decision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['chaotang', 'shiguan'],
      });
    },
  });
}
