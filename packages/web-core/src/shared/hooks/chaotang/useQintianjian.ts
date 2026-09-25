import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

function useQintianEnabled() {
  const { user, health } = useChaotangProvider();
  return { userId: user?.id, enabled: Boolean(user && health) };
}

export function useCreateQintianForecast() {
  const client = useChaotangClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: client.createQintianForecast,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['chaotang', 'qintianjian'] }),
  });
}

export function useReviewQintianForecast() {
  const client = useChaotangClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      forecastId,
      input,
    }: {
      forecastId: string;
      input: import('@/shared/providers/ChaotangProvider').QintianReviewInput;
    }) => client.reviewQintianForecast(forecastId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['chaotang', 'qintianjian'] }),
  });
}

export function useQintianForecasts() {
  const client = useChaotangClient();
  const { userId, enabled } = useQintianEnabled();
  return useQuery({
    queryKey: ['chaotang', 'qintianjian', 'forecasts', userId],
    queryFn: () => client.qintianForecasts(),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useQintianForecast(forecastId?: string) {
  const client = useChaotangClient();
  const { userId, enabled } = useQintianEnabled();
  return useQuery({
    queryKey: ['chaotang', 'qintianjian', 'forecast', userId, forecastId],
    queryFn: () => client.qintianForecast(forecastId!),
    enabled: enabled && Boolean(forecastId),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useQintianPendingTriggers() {
  const client = useChaotangClient();
  const { userId, enabled } = useQintianEnabled();
  return useQuery({
    queryKey: ['chaotang', 'qintianjian', 'pending-triggers', userId],
    queryFn: () => client.qintianPendingTriggers(),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}
