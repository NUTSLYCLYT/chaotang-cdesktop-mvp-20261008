import type { CandidateCommand } from '@/shared/components/chaotang/hanlinCandidateContract';
import type { RuntimeRehearsalCommand } from '@/shared/components/chaotang/hanlinRuntimeRehearsalContract';

export function candidateExperimentId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value))
    throw new Error('实验编号无效');

  return value;
}

/** Transport boundary only. The authenticated server owns all state transitions. */

export function candidateCommand(value: unknown): CandidateCommand {
  const fail = (): never => {
    throw new Error('候选账操作参数无效');
  };

  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();

  const allowed = [
    'action',
    'expected_revision',
    'idempotency_key',
    'snapshot_digest',
    'evaluation_digest',
    'reason',
  ];

  const descriptors = Object.getOwnPropertyDescriptors(value);

  if (
    Reflect.ownKeys(value).length !== allowed.length ||
    allowed.some((key) => !descriptors[key] || !('value' in descriptors[key]))
  )
    return fail();

  const v = value as Record<string, unknown>;

  if (
    typeof v.action !== 'string' ||
    ![
      'APPROVE',
      'REJECT',
      'ENABLE',
      'CHECK_HEALTH',
      'DEGRADE',
      'ROLLBACK',
    ].includes(v.action) ||
    typeof v.expected_revision !== 'number' ||
    !Number.isInteger(v.expected_revision) ||
    v.expected_revision < 0 ||
    v.expected_revision > 1000 ||
    typeof v.idempotency_key !== 'string' ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(v.idempotency_key) ||
    typeof v.snapshot_digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(v.snapshot_digest) ||
    typeof v.evaluation_digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(v.evaluation_digest) ||
    typeof v.reason !== 'string' ||
    !v.reason.trim() ||
    Array.from(v.reason).length > 2000
  )
    return fail();

  return {
    action: v.action as CandidateCommand['action'],
    expected_revision: v.expected_revision,
    idempotency_key: v.idempotency_key,
    snapshot_digest: v.snapshot_digest,
    evaluation_digest: v.evaluation_digest,
    reason: v.reason,
  };
}

export function runtimeRehearsalCommand(
  value: unknown
): RuntimeRehearsalCommand {
  const fail = (): never => {
    throw new Error('候选进程演练参数无效');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const allowed = [
    'action',
    'expected_revision',
    'idempotency_key',
    'candidate_event_digest',
    'reason',
  ];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== allowed.length ||
    allowed.some((key) => !descriptors[key] || !('value' in descriptors[key]))
  )
    return fail();
  const v = value as Record<string, unknown>;
  if (
    typeof v.action !== 'string' ||
    !['START', 'PROBE', 'SWITCH_LOCAL_BINDING', 'DEGRADE', 'ROLLBACK'].includes(
      v.action
    ) ||
    typeof v.expected_revision !== 'number' ||
    !Number.isInteger(v.expected_revision) ||
    v.expected_revision < 0 ||
    v.expected_revision > 100 ||
    typeof v.idempotency_key !== 'string' ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(v.idempotency_key) ||
    typeof v.candidate_event_digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(v.candidate_event_digest) ||
    typeof v.reason !== 'string' ||
    !v.reason.trim() ||
    Array.from(v.reason).length > 2000
  )
    return fail();
  return {
    action: v.action as RuntimeRehearsalCommand['action'],
    expected_revision: v.expected_revision,
    idempotency_key: v.idempotency_key,
    candidate_event_digest: v.candidate_event_digest,
    reason: v.reason,
  };
}
