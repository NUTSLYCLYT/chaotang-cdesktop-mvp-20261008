import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { cn } from '@/shared/lib/utils';
import { getPrimaryModuleForPath } from '@/shared/lib/primaryModules';
import type { PrimaryModuleId } from '@/shared/lib/primaryModules';
import todayScene from '@/assets/chaotang/dadian-final-v2.png';
import forecastScene from '@/assets/chaotang/qintianjian-final-v2.png';
import projectScene from '@/assets/chaotang/junjichu-final-v2.png';
import learningScene from '@/assets/chaotang/hanlinyuan-final-v2.png';
import wealthScene from '@/assets/chaotang/hubu-finance-final-v2.png';
import lifeScene from '@/assets/chaotang/taiyiyuan-final-v2.png';
import moreScene from '@/assets/chaotang/capability-directory-final-v1.png';
import { useChaotangAppearance } from '@/shared/hooks/chaotang/useChaotangAppearance';

const PRIMARY_SCENES: Record<PrimaryModuleId, string> = {
  today: todayScene,
  forecast: forecastScene,
  projects: projectScene,
  learning: learningScene,
  wealth: wealthScene,
  life: lifeScene,
  more: moreScene,
};

export function PrimarySceneLayer() {
  const location = useLocation();
  const module = getPrimaryModuleForPath(location.pathname);
  const isProjectWorkView =
    module.id === 'projects' &&
    !location.pathname.endsWith('/workspaces') &&
    !location.pathname.includes('/new') &&
    !location.pathname.startsWith('/routines');
  const { settings } = useChaotangAppearance();
  const activeOpacity =
    (settings.backgroundIntensity / 100) * (isProjectWorkView ? 0.62 : 1);
  const toneFilter = {
    ink: 'brightness(0.86) saturate(0.72)',
    balanced: 'brightness(1.05) saturate(0.95)',
    vivid: 'brightness(1.15) saturate(1.15)',
  }[settings.sceneTone];

  useEffect(() => {
    document.documentElement.toggleAttribute(
      'data-chaotang-reduced-motion',
      settings.reducedMotion
    );
    return () => {
      document.documentElement.removeAttribute('data-chaotang-reduced-motion');
    };
  }, [settings.reducedMotion]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden bg-primary"
      aria-hidden="true"
    >
      {Object.entries(PRIMARY_SCENES).map(([id, scene]) => {
        const isActive = id === module.id;
        return (
          <div
            key={id}
            className={cn(
              'absolute inset-0 bg-cover bg-center transition-opacity duration-700',
              settings.reducedMotion && 'transition-none'
            )}
            style={{
              backgroundImage: `url(${scene})`,
              filter: toneFilter,
              opacity: isActive ? activeOpacity : 0,
            }}
          />
        );
      })}
      <div
        className={cn(
          'absolute inset-0',
          settings.immersiveMode
            ? 'bg-[linear-gradient(90deg,hsl(var(--bg-primary)/0.58)_0%,hsl(var(--bg-primary)/0.1)_48%,hsl(var(--bg-primary)/0.36)_100%)]'
            : 'bg-[linear-gradient(90deg,hsl(var(--bg-primary)/0.82)_0%,hsl(var(--bg-primary)/0.48)_48%,hsl(var(--bg-primary)/0.68)_100%)]'
        )}
      />
      <div
        className={cn(
          'absolute inset-0',
          settings.immersiveMode
            ? 'bg-[radial-gradient(ellipse_at_50%_38%,transparent_0%,hsl(var(--bg-primary)/0.06)_62%,hsl(var(--bg-primary)/0.4)_100%)]'
            : 'bg-[radial-gradient(ellipse_at_50%_38%,transparent_0%,hsl(var(--bg-primary)/0.2)_58%,hsl(var(--bg-primary)/0.62)_100%)]'
        )}
      />
      <div
        className="chaotang-grain absolute inset-0"
        style={{ opacity: settings.immersiveMode ? 0.22 : 0.12 }}
      />
    </div>
  );
}
