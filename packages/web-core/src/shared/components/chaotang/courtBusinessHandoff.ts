import { CHAOTANG_MODULE_SHELLS } from '@/shared/lib/chaotangShell';

/**
 * Transfer editable user input only; never create or approve a task here.
 * The Qintian and Hanlin pages are now part of the single court shell, so their
 * bridge actions open the migrated content instead of a second layout.
 */
export function courtBusinessHandoff(value: unknown, owner?: string) {
  if (!value || typeof value !== 'object') return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === 'chaotang:action') {
    if (
      message.action === 'results' ||
      message.action === 'study' ||
      message.action === 'cases' ||
      message.action === 'hubu' ||
      message.action === 'jinyiwei' ||
      message.action === 'shiguan' ||
      message.action === 'gongbu' ||
      message.action === 'forecast' ||
      message.action === 'learning' ||
      message.action === 'life'
    )
      return { panel: message.action } as const;
    return undefined;
  }
  if (message.type !== 'chaotang:prepare-decree') return undefined;
  if (typeof message.prompt !== 'string') return undefined;
  const objective = message.prompt.trim();
  if (!objective || objective.length > 4000) return undefined;
  if (!owner) return { panel: 'account', pendingObjective: objective } as const;
  return { panel: 'study', owner, objective } as const;
}

export function courtPanelFromRoute(pathname: string, hash: string) {
  const target = hash.replace(/^#/, '');
  // /wealth and /life are their own top-level routes in the single shell, so
  // they always open the real treasury or local life panel. #hubu keeps the
  // existing court entry, and #life adds the matching local entry.
  if (pathname === '/wealth') return 'hubu' as const;
  if (pathname === '/life') return 'life' as const;
  // The migrated Qintian and Hanlin pages keep their own routes so the single
  // shell can open them directly instead of the retired technical layout.
  if (pathname === '/forecast') return 'forecast' as const;
  if (pathname === '/learning') return 'learning' as const;
  if (pathname !== '/court') return undefined;
  if (target === 'models') return 'models' as const;
  if (target === 'results') return 'results' as const;
  if (target === 'study') return 'study' as const;
  if (target === 'junjichu') return 'cases' as const;
  if (target === 'hubu') return 'hubu' as const;
  if (target === 'jinyiwei') return 'jinyiwei' as const;
  if (target === 'shiguan') return 'shiguan' as const;
  if (target === 'gongbu') return 'gongbu' as const;
  if (target === 'forecast') return 'forecast' as const;
  if (target === 'learning') return 'learning' as const;
  if (target === 'life') return 'life' as const;
  return undefined;
}

/**
 * Each department panel only accepts a hash that names one of its own shell
 * sections. A hash that belongs to another department is ignored so no two
 * migrated departments cross-open each other's content.
 */
function departmentSections(panel: string) {
  if (panel === 'forecast' || panel === 'learning')
    return CHAOTANG_MODULE_SHELLS[panel].sections;
  if (panel === 'hubu') return CHAOTANG_MODULE_SHELLS.wealth.sections;
  if (panel === 'life') return CHAOTANG_MODULE_SHELLS.life.sections;
  return undefined;
}

export function courtPanelSection(
  pathname: string,
  hash: string
): string | undefined {
  const panel = courtPanelFromRoute(pathname, hash);
  if (!panel) return undefined;
  const sections = departmentSections(panel);
  if (!sections) return undefined;
  const requested = hash.replace(/^#/, '');
  return sections.some((section) => section.id === requested)
    ? requested
    : undefined;
}
