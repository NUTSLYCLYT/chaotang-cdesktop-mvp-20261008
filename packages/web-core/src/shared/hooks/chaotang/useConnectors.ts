import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export function useChaotangConnectors() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'connectors', user?.id],
    queryFn: () => client.connectorCatalog(),
    enabled: Boolean(user && health),
    staleTime: 60_000,
    retry: 1,
  });
}
