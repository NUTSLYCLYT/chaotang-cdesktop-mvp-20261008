import { useMutation, useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
  type HubuConfirmationDecision,
  type CashSafetyInput,
} from '@/shared/providers/ChaotangProvider';
import { useQueryClient } from '@tanstack/react-query';

export function useHubuWorkProducts() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'hubu', 'work-products', user?.id],
    queryFn: () => client.hubuWorkProducts(),
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useHubuWorkProduct(artifactId?: string) {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'hubu', 'work-product', user?.id, artifactId],
    queryFn: () => client.hubuWorkProduct(artifactId!),
    enabled: Boolean(user && health && artifactId),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useHubuArtifactDownload() {
  const client = useChaotangClient();
  return useMutation({
    mutationFn: (artifactId: string) => client.hubuDownloadArtifact(artifactId),
  });
}

export function useHubuConfirmation() {
  const client = useChaotangClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      artifactId,
      decision,
      structuredReason,
    }: {
      artifactId: string;
      decision: HubuConfirmationDecision;
      structuredReason: string;
    }) => client.hubuConfirmArtifact(artifactId, decision, structuredReason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chaotang', 'hubu'] });
    },
  });
}

export function useCashSafetyEvaluation() {
  const client = useChaotangClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CashSafetyInput) => client.cashSafetyEvaluate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chaotang', 'hubu'] });
    },
  });
}
