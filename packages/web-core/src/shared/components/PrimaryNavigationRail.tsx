import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { UserCircleIcon } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import {
  getPrimaryModuleForPath,
  PRIMARY_MODULES,
} from '@/shared/lib/primaryModules';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';

export function PrimaryNavigationRail() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeModule = getPrimaryModuleForPath(location.pathname);
  const { health, user, authError, login, register, logout } =
    useChaotangProvider();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
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
                  onClick={() => void logout()}
                  className="w-full border border-brand/25 px-base py-base text-xs text-brand transition-colors hover:bg-brand/10"
                >
                  退出朝堂账户
                </button>
              </div>
            ) : (
              <form
                className="mt-double space-y-base"
                onSubmit={(event) => {
                  event.preventDefault();
                  setIsAuthenticating(true);
                  const action =
                    authMode === 'login'
                      ? login(identifier, password)
                      : register(username, email, password);
                  void action
                    .catch(() => undefined)
                    .finally(() => {
                      setIsAuthenticating(false);
                      setPassword('');
                    });
                }}
              >
                <div className="flex gap-half">
                  {(['login', 'register'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAuthMode(mode)}
                      className={cn(
                        'border px-base py-half text-xs',
                        authMode === mode
                          ? 'border-brand/45 bg-brand/10 text-brand'
                          : 'border-brand/15 text-low'
                      )}
                    >
                      {mode === 'login' ? '登录' : '注册'}
                    </button>
                  ))}
                </div>
                {authMode === 'login' ? (
                  <input
                    required
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="用户名或邮箱"
                    autoComplete="username"
                    className="w-full border border-brand/20 bg-primary/65 px-base py-base text-sm text-normal outline-none placeholder:text-low focus:border-brand/50"
                  />
                ) : (
                  <>
                    <input
                      required
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="用户名"
                      autoComplete="username"
                      className="w-full border border-brand/20 bg-primary/65 px-base py-base text-sm text-normal outline-none placeholder:text-low focus:border-brand/50"
                    />
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="邮箱"
                      autoComplete="email"
                      className="w-full border border-brand/20 bg-primary/65 px-base py-base text-sm text-normal outline-none placeholder:text-low focus:border-brand/50"
                    />
                  </>
                )}
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="密码"
                  autoComplete={
                    authMode === 'login' ? 'current-password' : 'new-password'
                  }
                  className="w-full border border-brand/20 bg-primary/65 px-base py-base text-sm text-normal outline-none placeholder:text-low focus:border-brand/50"
                />
                {authError && (
                  <p className="text-xs leading-relaxed text-error">
                    {authError}
                  </p>
                )}
                <button
                  disabled={isAuthenticating || !health}
                  className="w-full border border-brand/40 bg-brand/10 px-base py-base text-xs text-brand transition-colors hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isAuthenticating
                    ? '处理中…'
                    : authMode === 'login'
                      ? '登录朝堂'
                      : '创建账户'}
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </nav>
  );
}
