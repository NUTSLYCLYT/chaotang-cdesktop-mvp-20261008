import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export function useChaotangSkills() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'skills', user?.id],
    queryFn: () => client.skillCatalog(),
    enabled: Boolean(user && health),
    staleTime: 60_000,
    retry: 1,
  });
}
