import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export function useDadianOverview(department?: string) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();

  return useQuery({
    queryKey: ['chaotang', 'dadian-overview', user?.id, department ?? 'all'],
    queryFn: () => client.dadianOverview(department),
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}
