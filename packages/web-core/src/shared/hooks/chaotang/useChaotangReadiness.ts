import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export function useChaotangReadiness() {
  const client = useChaotangClient();
  const { health } = useChaotangProvider();

  return useQuery({
    queryKey: ['chaotang', 'readiness', health?.version ?? 'offline'],
    queryFn: () => client.readiness(),
    enabled: Boolean(health),
    staleTime: 30_000,
    retry: 1,
  });
}
