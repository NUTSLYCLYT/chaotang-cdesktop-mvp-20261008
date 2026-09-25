export const ownerQueryKey = (
  owner: string | undefined,
  resource: string,
  id?: string
) => ['chaotang', resource, owner ?? 'anonymous', ...(id ? [id] : [])] as const;

export async function decreeIdempotencyKey(
  owner: string,
  fingerprint: string
): Promise<string> {
  if (!owner.trim() || !fingerprint.trim())
    throw new Error('Missing owner or draft fingerprint');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([owner, fingerprint]))
  );
  return (
    'court-' +
    Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0')
    ).join('')
  );
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('报告格式不合法');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('报告缺少有效文本');
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('报告字段必须是列表');
  return value.map(text);
}
export interface DecreeBureauOpinionProjection {
  bureau: string;
  opinion?: string;
}
export interface DecreeMinistryOpinionProjection {
  department: string;
  bureauOpinions?: DecreeBureauOpinionProjection[];
  opinion?: string;
}
function optionalText(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : text(value);
}
function optionalStrings(value: unknown): string[] | undefined {
  return value === undefined || value === null ? undefined : strings(value);
}

// Adapted from origin/ext-dev c278a4a studyTaskCockpit's acceptance projection.
// Existing native/browser DTOs already expose camelCase; never parse prose to fill gaps.
export type DraftAcceptanceProjection = Partial<
  Omit<ChancellorDraftEdict, 'departments' | 'currentStatus'>
> & {
  departments?: Array<Partial<ChancellorDepartmentRecommendation>>;
};
export function projectDraftAcceptance(
  value: unknown
): DraftAcceptanceProjection | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const raw = value as Record<string, unknown>;
  const safeText = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v : undefined;
  const safeList = (v: unknown) =>
    Array.isArray(v) && v.every((item) => typeof item === 'string')
      ? (v as string[])
      : undefined;
  const projected: DraftAcceptanceProjection = {
    objective: safeText(raw.objective),
  };
  for (const key of [
    'scope',
    'exclusions',
    'inputMaterials',
    'materialGaps',
    'keyQuestions',
    'executionSteps',
    'deliverables',
    'completionCriteria',
    'permissionsAndLimits',
  ] as const)
    projected[key] = safeList(raw[key]);
  if (
    Array.isArray(raw.departments) &&
    raw.departments.every(
      (item) => item && typeof item === 'object' && !Array.isArray(item)
    )
  ) {
    projected.departments = raw.departments.map((item) => ({
      department: safeText(item.department),
      bureaus: safeList(item.bureaus),
      role: safeText(item.role),
      reason: safeText(item.reason),
      responsibility: safeText(item.responsibility),
      expectedOutput: safeText(item.expectedOutput),
    }));
  }
  return projected;
}
export function parseDecreeResult(value: unknown) {
  const result = record(value);
  const recommendations = strings(result.recommendations);
  if (recommendations.length !== 3) throw new Error('报告必须包含三条建议');
  const departments = strings(result.departments);
  if (!departments.length) throw new Error('报告缺少办理部门');
  if (!Array.isArray(result.artifacts)) throw new Error('报告缺少成果清单');
  const artifacts = result.artifacts.map((item) => {
    const artifact = record(item);
    return {
      artifactId: text(artifact.artifact_id),
      displayName: text(artifact.display_name),
      kind: text(artifact.kind),
    };
  });
  const routeType =
    result.route_type === undefined || result.route_type === null
      ? undefined
      : result.route_type;
  if (
    routeType !== undefined &&
    routeType !== 'single' &&
    routeType !== 'multi'
  )
    throw new Error('报告办理路由无效');
  const councilVerdict = optionalText(result.council_verdict);
  if (routeType === 'single' && councilVerdict !== undefined)
    throw new Error('单部门报告不应包含军机处会审结论');
  let ministryOpinions: DecreeMinistryOpinionProjection[] | undefined;
  if (
    result.ministry_opinions !== undefined &&
    result.ministry_opinions !== null
  ) {
    if (!Array.isArray(result.ministry_opinions))
      throw new Error('部门意见必须为列表');
    ministryOpinions = result.ministry_opinions.map((value) => {
      const ministry = record(value);
      let bureauOpinions: DecreeBureauOpinionProjection[] | undefined;
      if (
        ministry.bureau_opinions !== undefined &&
        ministry.bureau_opinions !== null
      ) {
        if (!Array.isArray(ministry.bureau_opinions))
          throw new Error('司级意见必须为列表');
        bureauOpinions = ministry.bureau_opinions.map((value) => {
          const bureau = record(value);
          return {
            bureau: text(bureau.bureau),
            opinion: optionalText(bureau.opinion),
          };
        });
      }
      return {
        department: text(ministry.department),
        bureauOpinions,
        opinion: optionalText(ministry.opinion),
      };
    });
  }
  return {
    routeType,
    rationale: optionalText(result.rationale),
    processingPath: optionalStrings(result.processing_path),
    ministryOpinions,
    councilVerdict,
    final_verdict: text(result.final_verdict),
    recommendations,
    departments,
    artifacts,
  };
}

export function createAuthQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(operation);
      tail = result.catch(() => undefined);
      return result.finally(() => {
        pending -= 1;
      });
    },
    isPending: () => pending > 0,
  };
}

export function usesTechnicalShell(pathname: string) {
  return (
    pathname === '/court-workspace' ||
    pathname === '/learning' ||
    /^\/(workspaces|routines)(\/|$)/.test(pathname) ||
    /^\/hosts\/[^/]+\/workspaces(\/|$)/.test(pathname)
  );
}
import type {
  ChancellorDraftEdict,
  ChancellorDepartmentRecommendation,
} from '@/shared/providers/ChaotangProvider';
