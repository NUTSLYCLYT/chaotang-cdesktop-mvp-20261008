import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { UserCircleIcon } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import {
  getPrimaryModuleForPath,
  PRIMARY_MODULES,
} from '@/shared/lib/primaryModules';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangAccountForm } from './chaotang/ChaotangAccountForm';

export function PrimaryNavigationRail() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeModule = getPrimaryModuleForPath(location.pathname);
  const { health, user, logout } = useChaotangProvider();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAccountOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) {
        setIsAccountOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAccountOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isAccountOpen]);

  const accountInitial = user?.username.trim().slice(0, 1).toUpperCase();

  return (
    <nav
      aria-label="一级功能导航"
      className="chaotang-grain relative z-50 flex h-full w-[72px] shrink-0 flex-col border-r border-brand/25 bg-[#07100c] px-half pb-base pt-[76px] shadow-[8px_0_30px_rgba(0,0,0,0.28)]"
    >
      <div className="flex flex-1 flex-col items-center gap-half">
        {PRIMARY_MODULES.map((module) => {
          const Icon = module.icon;
          const isActive = activeModule.id === module.id;
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => void navigate({ to: module.route })}
              aria-current={isActive ? 'page' : undefined}
              title={module.description}
              className={cn(
                'group relative flex w-full flex-col items-center gap-1 border px-half py-base text-xs tracking-[0.12em] transition-all',
                isActive
                  ? 'chaotang-jade-glow border-brand/60 bg-brand/10 text-brand'
                  : 'border-transparent text-low hover:border-brand/25 hover:bg-brand/5 hover:text-high'
              )}
            >
              <Icon
                className="size-5"
                weight={isActive ? 'duotone' : 'regular'}
              />
              <span className="chaotang-title">{module.label}</span>
              {module.status === 'planned' && (
                <span
                  className="absolute right-1.5 mt-0.5 size-1.5 rounded-full bg-low/50"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      <div
        ref={accountRef}
        className="relative border-t border-brand/20 pt-base"
      >
        <button
          type="button"
          onClick={() => setIsAccountOpen((open) => !open)}
          aria-label={
            user ? `朝堂账户：${user.username}` : '登录或注册朝堂账户'
          }
          aria-expanded={isAccountOpen}
          aria-haspopup="dialog"
          className={cn(
            'flex size-12 w-full items-center justify-center border transition-colors',
            isAccountOpen
              ? 'border-brand/60 bg-brand/10 text-brand'
              : 'border-brand/20 text-low hover:border-brand/45 hover:text-brand'
          )}
        >
          {accountInitial ? (
            <span className="chaotang-title flex size-8 items-center justify-center border border-brand/45 bg-brand/10 text-sm text-brand">
              {accountInitial}
            </span>
          ) : (
            <UserCircleIcon className="size-6" weight="duotone" />
          )}
        </button>

        {isAccountOpen && (
          <section
            role="dialog"
            aria-label="朝堂账户"
            className="chaotang-grain absolute bottom-0 left-[calc(100%+12px)] z-[80] w-[320px] border border-brand/35 bg-secondary/95 p-double shadow-[0_18px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-base border-b border-brand/15 pb-base">
              <div>
                <p className="text-[9px] tracking-[0.22em] text-brand/55">
                  ACCOUNT
                </p>
                <h2 className="chaotang-title mt-half text-xl text-high">
                  朝堂账户
                </h2>
              </div>
              <span
                className={cn(
                  'text-[10px]',
                  health ? 'text-success' : 'text-error'
                )}
              >
                {health ? `已连接 · v${health.version}` : '服务未连接'}
              </span>
            </div>

            {user ? (
              <div className="mt-double space-y-base text-sm">
                <div className="flex items-center gap-base">
                  <span className="chaotang-title flex size-10 items-center justify-center border border-brand/45 bg-brand/10 text-brand">
                    {accountInitial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-high">{user.username}</p>
                    <p className="truncate text-xs text-low">{user.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void logout().catch(() => undefined)}
                  className="w-full border border-brand/25 px-base py-base text-xs text-brand transition-colors hover:bg-brand/10"
                >
                  退出朝堂账户
                </button>
              </div>
            ) : (
              <div className="mt-double">
                <ChaotangAccountForm
                  mode={authMode}
                  onModeChange={setAuthMode}
                />
              </div>
            )}
          </section>
        )}
      </div>
    </nav>
  );
}
