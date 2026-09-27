/** Transfer editable user input only; never create or approve a task here. */
export function courtBusinessHandoff(value: unknown, owner?: string) {
  if (!value || typeof value !== 'object') return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === 'chaotang:action') {
    if (message.action === 'study' || message.action === 'cases')
      return { panel: message.action } as const;
    return undefined;
  }
  if (message.type !== 'chaotang:prepare-decree') return undefined;
  if (typeof message.prompt !== 'string') return undefined;
  const objective = message.prompt.trim();
  if (!objective || objective.length > 4000) return undefined;
  if (!owner) return { panel: 'account' } as const;
  return { panel: 'study', owner, objective } as const;
}

export function courtPanelFromRoute(pathname: string, hash: string) {
  if (pathname !== '/court') return undefined;
  if (hash.replace(/^#/, '') === 'study') return 'study' as const;
  if (hash.replace(/^#/, '') === 'junjichu') return 'cases' as const;
  return undefined;
}
