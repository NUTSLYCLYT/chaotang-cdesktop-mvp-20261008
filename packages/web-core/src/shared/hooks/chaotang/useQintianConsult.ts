import { useMutation } from '@tanstack/react-query';
import {
  useChaotangClient,
  type QintianConsultMessage,
} from '@/shared/providers/ChaotangProvider';

export function useQintianConsult() {
  const client = useChaotangClient();
  return useMutation({
    mutationFn: (messages: QintianConsultMessage[]) =>
      client.qintianConsult(messages),
  });
}
