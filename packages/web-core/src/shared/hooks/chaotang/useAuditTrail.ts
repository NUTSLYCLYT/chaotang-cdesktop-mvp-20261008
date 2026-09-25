import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';

export type AuditDomain = '锦衣卫' | '户部';

export interface ChaotangAuditEvent {
  id: string;
  domain: AuditDomain;
  actor: string | null;
  action: 'INVESTIGATION_COMPLETED' | 'WORK_PRODUCT_RECORDED';
  objectRef: string;
  receiptRef: string;
  occurredAt: string;
  result: string;
  summary: string;
  evidenceCount: number | null;
}

export function useAuditTrail() {
  const client = useChaotangClient();
  const { user, health } = useChaotangProvider();
  return useQuery({
    queryKey: ['chaotang', 'audit-trail', user?.id],
    queryFn: async (): Promise<ChaotangAuditEvent[]> => {
      const [investigations, workProducts] = await Promise.all([
        client.jinyiweiInvestigations(),
        client.hubuWorkProducts(),
      ]);
      return [
        ...investigations.items.map(
          (item): ChaotangAuditEvent => ({
            id: `jinyiwei:${item.investigationId}`,
            domain: '锦衣卫',
            actor: item.requestingAgent,
            action: 'INVESTIGATION_COMPLETED',
            objectRef: item.investigationId,
            receiptRef: item.requestId,
            occurredAt: item.completedAt,
            result: item.status,
            summary: item.question,
            evidenceCount: item.evidenceCount,
          })
        ),
        ...workProducts.map(
          (item): ChaotangAuditEvent => ({
            id: `hubu:${item.workProductId}`,
            domain: '户部',
            actor: null,
            action: 'WORK_PRODUCT_RECORDED',
            objectRef: item.workProductId,
            receiptRef: item.artifactId,
            occurredAt: item.createdAt,
            result: item.confirmationStatus,
            summary: item.decision,
            evidenceCount: null,
          })
        ),
      ].sort(
        (left, right) =>
          new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime()
      );
    },
    enabled: Boolean(user && health),
    staleTime: 30_000,
    retry: 1,
  });
}
