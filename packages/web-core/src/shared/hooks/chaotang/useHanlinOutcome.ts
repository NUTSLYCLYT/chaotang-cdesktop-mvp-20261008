import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';
import {
  advisoryReadQueryKey,
  decodeHanlinExperiment,
  decodeOutcomeOverview,
  normalizeExperimentId,
  type AdvisoryReadClient,
} from '@/shared/components/chaotang/hanlinOutcomeContract';
import {
  decodeCandidateHistory,
  type CandidateLedgerClient,
} from '@/shared/components/chaotang/hanlinCandidateContract';
import type { HanlinExperiment } from '@/shared/components/chaotang/hanlinOutcomeContract';
import {
  decodeRuntimeRehearsalHistory,
  type RuntimeRehearsalClient,
} from '@/shared/components/chaotang/hanlinRuntimeRehearsalContract';
import type { CandidateHistory } from '@/shared/components/chaotang/hanlinCandidateContract';

export function useHanlinCandidateHistory(experiment: HanlinExperiment) {
  const client = useChaotangClient() as Partial<CandidateLedgerClient>;
  const { user, health, authGeneration } = useChaotangProvider();
  const id = experiment.snapshot.definition.experiment_id;
  const supported = Boolean(client.candidateHistory);
  const query = useQuery({
    queryKey: [
      ...advisoryReadQueryKey(user?.id, authGeneration, 'experiment', id),
      'candidate-events',
      experiment.snapshot.snapshot_digest,
      experiment.evaluation.evaluation_digest,
    ],
    queryFn: async () => {
      if (!client.candidateHistory)
        throw new Error('当前客户端暂不支持候选历史。');
      return decodeCandidateHistory(
        await client.candidateHistory(id),
        experiment
      );
    },
    enabled: Boolean(user && health && supported),
    staleTime: 0,
    retry: false,
  });
  return {
    ...query,
    supported,
    writable: Boolean(client.appendCandidateEvent),
  };
}

export function useHanlinRuntimeRehearsal(
  experiment: HanlinExperiment,
  candidate: CandidateHistory
) {
  const client = useChaotangClient() as Partial<RuntimeRehearsalClient>;
  const { user, health, authGeneration } = useChaotangProvider();
  const id = experiment.snapshot.definition.experiment_id;
  const supported = Boolean(client.runtimeRehearsalHistory);
  const candidateHead = candidate.events.at(-1)?.event_digest ?? 'none';
  const query = useQuery({
    queryKey: [
      ...advisoryReadQueryKey(user?.id, authGeneration, 'experiment', id),
      'runtime-rehearsal-events',
      candidateHead,
    ],
    queryFn: async () => {
      if (!client.runtimeRehearsalHistory)
        throw new Error('当前客户端暂不支持候选进程演练。');
      return decodeRuntimeRehearsalHistory(
        await client.runtimeRehearsalHistory(id),
        id,
        experiment.snapshot.baseline_digest,
        experiment.snapshot.candidate_digest,
        candidate
      );
    },
    enabled: Boolean(user && health && supported),
    staleTime: 0,
    retry: false,
  });
  return {
    ...query,
    supported,
    writable: Boolean(client.appendRuntimeRehearsalEvent),
  };
}

export function useOutcomeOverview() {
  const client = useChaotangClient() as Partial<AdvisoryReadClient>;
  const { user, health, authGeneration } = useChaotangProvider();
  const supported = Boolean(client.shiguanOutcomesOverview);
  const query = useQuery({
    queryKey: advisoryReadQueryKey(user?.id, authGeneration, 'overview'),
    queryFn: async () => {
      if (!client.shiguanOutcomesOverview)
        throw new Error('当前客户端暂不支持 Outcome 总览。');
      return decodeOutcomeOverview(await client.shiguanOutcomesOverview());
    },
    enabled: Boolean(user && health && supported),
    staleTime: 0,
    retry: false,
  });
  return { ...query, supported };
}

export function useHanlinExperiment(experimentId?: string) {
  const client = useChaotangClient() as Partial<AdvisoryReadClient>;
  const { user, health, authGeneration } = useChaotangProvider();
  const supported = Boolean(client.hanlinExperiment);
  const query = useQuery({
    queryKey: advisoryReadQueryKey(
      user?.id,
      authGeneration,
      'experiment',
      experimentId
    ),
    queryFn: async () => {
      if (!client.hanlinExperiment)
        throw new Error('当前客户端暂不支持翰林实验查询。');
      const id = normalizeExperimentId(experimentId ?? '');
      return decodeHanlinExperiment(await client.hanlinExperiment(id), id);
    },
    enabled: Boolean(user && health && supported && experimentId),
    staleTime: 0,
    retry: false,
  });
  return { ...query, supported };
}
