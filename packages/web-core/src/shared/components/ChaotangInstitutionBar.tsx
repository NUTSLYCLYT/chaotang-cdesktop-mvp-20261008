import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { BellIcon, SealCheckIcon } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';

type DisplayMode = 'smart' | 'custom';

const INSTITUTIONS = [
  { label: '大殿', route: '/today', hash: '' },
  { label: '上书房', route: '/court', hash: 'study' },
  { label: '军机处', route: '/court', hash: 'junjichu' },
  { label: '六部各司', route: '/court', hash: 'liubu' },
  { label: '锦衣卫', route: '/more', hash: 'jinyiwei' },
  { label: '钦天监', route: '/forecast', hash: '' },
  { label: '史馆', route: '/learning', hash: '' },
  { label: '更多', route: '/more', hash: 'governance-overview' },
] as const;

const STORAGE_KEY = 'chaotang.display-mode.v1';

export function ChaotangInstitutionBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { health, user } = useChaotangProvider();
  const [mode, setMode] = useState<DisplayMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'custom' ? 'custom' : 'smart';
  });

  useEffect(() => {
    document.documentElement.dataset.chaotangMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    return () => {
      delete document.documentElement.dataset.chaotangMode;
    };
  }, [mode]);

  return (
    <header
      data-tauri-drag-region
      className="chaotang-institution-bar absolute inset-x-0 top-0 z-40 flex h-[72px] items-start border-b border-brand/25 bg-[#070b09]/95 px-base pl-20 backdrop-blur-xl"
    >
      {/* Keep a stable, dedicated drag target. Tauri only starts a native
          window drag from the exact element carrying this attribute, so the
          title and its children must all opt in while navigation stays out. */}
      <div
        data-tauri-drag-region
        className="flex h-11 shrink-0 cursor-default select-none items-center gap-base pr-double"
        style={{ width: 'clamp(230px, 19vw, 320px)' }}
      >
        <span
          data-tauri-drag-region
          className="chaotang-title flex size-7 items-center justify-center border border-[#e4c477]/70 bg-[#96372f] text-sm text-[#f3d892] shadow-[inset_0_0_0_2px_rgba(255,223,147,0.12)]"
        >
          朝
        </span>
        <span data-tauri-drag-region className="min-w-0">
          <strong
            data-tauri-drag-region
            className="chaotang-title block truncate text-sm tracking-[0.14em] text-high"
          >
            朝堂 AI OS
          </strong>
          <small
            data-tauri-drag-region
            className="block truncate text-[8px] tracking-[0.08em] text-low"
          >
            一位总负责人 · 一个真实任务
          </small>
        </span>
        <span
          data-tauri-drag-region
          className={cn(
            'size-1.5 rounded-full',
            health ? 'bg-success' : 'bg-error'
          )}
        />
      </div>

      <nav
        className="no-drag flex h-11 min-w-0 shrink overflow-x-auto"
        aria-label="朝堂机构导航"
      >
        {INSTITUTIONS.map((item) => {
          const currentHash = location.hash.replace(/^#/, '');
          const active =
            location.pathname.startsWith(item.route) &&
            (item.hash
              ? currentHash === item.hash
              : !currentHash ||
                !INSTITUTIONS.some(
                  (candidate) =>
                    candidate.route === item.route &&
                    candidate.hash === currentHash
                ));
          return (
            <button
              key={item.label}
              type="button"
              onClick={() =>
                void navigate({
                  to: item.route,
                  hash: item.hash,
                })
              }
              className={cn(
                'relative flex h-full shrink-0 items-center px-base text-xs text-low transition-colors hover:text-high',
                active &&
                  'text-brand after:absolute after:inset-x-base after:bottom-0 after:h-px after:bg-brand'
              )}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div
        data-tauri-drag-region
        className="h-11 min-w-12 flex-1"
        aria-hidden="true"
      />

      <div className="no-drag ml-base flex h-11 shrink-0 items-center gap-half">
        <div className="flex border border-brand/20 bg-primary/45 p-[2px]">
          {(['smart', 'custom'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={cn(
                'px-base py-half text-[10px]',
                mode === value
                  ? 'bg-[#d6c17d] text-[#211d13]'
                  : 'text-low hover:text-high'
              )}
            >
              {value === 'smart' ? '智能版' : '定制版'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: '/forecast', hash: 'triggers' })}
          className="hidden h-7 items-center gap-half border border-brand/20 px-base text-[10px] text-low hover:border-brand/45 hover:text-brand xl:flex"
          aria-label="预警"
          title="演示入口 · 真实预警接入后开放"
        >
          <BellIcon className="size-3.5 text-error" />
          预警 <b className="text-brand">2</b>
        </button>
        <button
          type="button"
          onClick={() =>
            void navigate({ to: '/today', hash: 'pending-review' })
          }
          className="hidden h-7 items-center border border-brand/20 px-base text-[10px] text-low hover:border-brand/45 hover:text-brand 2xl:flex"
          title="演示入口 · 真实待处理事项接入后开放"
        >
          待处理 <b className="ml-half text-brand">3</b>
        </button>
        <button
          type="button"
          onClick={() =>
            void navigate({ to: '/learning', hash: 'learning-overview' })
          }
          className="hidden h-7 items-center border border-brand/20 px-base text-[10px] text-low hover:border-brand/45 hover:text-brand 2xl:flex"
          title="演示等级"
        >
          升级
        </button>
        <button
          type="button"
          onClick={() =>
            void navigate({ to: '/wealth', hash: 'hubu-overview' })
          }
          className="hidden h-7 items-center border border-brand/20 px-base text-[10px] text-low hover:border-brand/45 hover:text-brand 2xl:flex"
          title="演示算筹 · 未连接真实账户"
        >
          算筹
        </button>
        <span className="hidden items-center gap-half border border-brand/20 px-base py-half text-[10px] text-low 2xl:flex">
          <SealCheckIcon className="size-3 text-brand" />
          {user ? user.username : '未登录'}
        </span>
      </div>

      <div
        data-tauri-drag-region
        className="absolute inset-x-0 bottom-0 flex h-7 items-center gap-base border-t border-brand/15 bg-[#07100c]/80 px-double text-[9px] text-low"
      >
        <span className="border border-brand/35 px-base py-[3px] tracking-[0.14em] text-brand">
          LIVE SHELL · 真实功能接入中
        </span>
        <span className="min-w-0 flex-1 truncate">
          <b className="font-medium text-brand/80">朝报：</b>
          当前页面沿用真实客户端能力；未接入的数据会明确标记，不伪造执行结果。
        </span>
        <button
          type="button"
          onClick={() =>
            void navigate({ to: '/today', hash: 'daily-memorial' })
          }
          className="no-drag text-brand/70 hover:text-brand"
        >
          展开今日朝报
        </button>
      </div>
    </header>
  );
}
