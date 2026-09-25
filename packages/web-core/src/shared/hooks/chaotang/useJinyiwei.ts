import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
  type JinyiweiInvestigationStatus,
} from '@/shared/providers/ChaotangProvider';

export function useJinyiweiSummary() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'jinyiwei', 'summary', user?.id],
    queryFn: () => client.jinyiweiSummary(),
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useJinyiweiInvestigations(
  status?: JinyiweiInvestigationStatus
) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'jinyiwei', 'investigations', user?.id, status],
    queryFn: () => client.jinyiweiInvestigations(status),
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useJinyiweiInvestigation(investigationId?: string) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: [
      'chaotang',
      'jinyiwei',
      'investigation',
      user?.id,
      investigationId,
    ],
    queryFn: () => client.jinyiweiInvestigation(investigationId!),
    enabled: Boolean(user && health && investigationId),
    staleTime: 30_000,
    retry: 1,
  });
}
