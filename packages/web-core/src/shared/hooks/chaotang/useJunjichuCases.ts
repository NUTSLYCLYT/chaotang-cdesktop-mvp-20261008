import { ownerQueryKey } from '@/shared/lib/chaotangFusion';
import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export function useJunjichuCases() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'junjichu-cases', user?.id],
    queryFn: () => client.junjichuCases(),
    enabled: Boolean(user && health),
    refetchInterval: (query) =>
      query.state.data?.some((item) =>
        [
          'MINISTRY_REVIEWING',
          'COUNCIL_REVIEWING',
          'CHANCELLOR_FINALIZING',
        ].includes(item.status)
      )
        ? 5000
        : false,
  });
}

export function useJunjichuCase(caseId?: string) {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  return useQuery({
    queryKey: ownerQueryKey(user?.id, 'junjichu-case', caseId),
    queryFn: () => client.junjichuCase(caseId!),
    enabled: Boolean(user && caseId),
  });
}

export function useCaseReply(replyId?: string | null) {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  return useQuery({
    queryKey: ownerQueryKey(user?.id, 'case-reply', replyId ?? undefined),
    queryFn: () => client.shiguanArchive(replyId!),
    enabled: Boolean(user && replyId),
  });
}
