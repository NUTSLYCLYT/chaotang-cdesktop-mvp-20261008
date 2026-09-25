import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export function useDailyMemorialLatest() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();

  return useQuery({
    queryKey: ['chaotang', 'daily-memorial-latest', user?.id],
    queryFn: () => client.dailyMemorialLatest(),
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useConfirmDailyMemorial() {
  const client = useChaotangClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: client.confirmDailyMemorial,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['chaotang', 'daily-memorial-latest'],
      }),
  });
}
