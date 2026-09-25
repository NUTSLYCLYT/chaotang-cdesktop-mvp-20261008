import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export function useChaotangMcpCatalog() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'mcp', user?.id],
    queryFn: () => client.mcpCatalog(),
    enabled: Boolean(user && health),
    staleTime: 60_000,
    retry: 1,
  });
}
