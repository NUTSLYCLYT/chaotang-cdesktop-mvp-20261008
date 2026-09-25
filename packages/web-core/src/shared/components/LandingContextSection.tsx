import { useMemo } from 'react';
import {
  CaretRightIcon,
  CodeIcon,
  BugIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import {
  useWorkspaces,
  type SidebarWorkspace,
} from '@/shared/hooks/useWorkspaces';
import { formatRelativeTimeShort } from '@/shared/lib/date';

const RECENT_LIMIT = 8;

type StatusTag = {
  label: string;
  textClass: string;
  dotClass: string;
};

function getStatusTag(
  workspace: SidebarWorkspace,
  t: (key: string) => string
): StatusTag | null {
  if (workspace.hasPendingApproval) {
    return {
      label: t('createMode.landing.status.awaitingInput'),
      textClass: 'text-amber-400',
      dotClass: 'bg-amber-400',
    };
  }
  if (workspace.isRunning) {
    return {
      label: t('createMode.landing.status.running'),
      textClass: 'text-blue-400',
      dotClass: 'bg-blue-400',
    };
  }
  if (
    workspace.latestProcessStatus === 'failed' ||
    workspace.latestProcessStatus === 'killed'
  ) {
    return {
      label: t('createMode.landing.status.failed'),
      textClass: 'text-error',
      dotClass: 'bg-error',
    };
  }
  return null;
}

interface LandingContextSectionProps {
  onPromptSelect?: (prompt: string) => void;
}

const QUICK_STARTS = [
  {
    icon: CodeIcon,
    key: 'analyze',
  },
  {
    icon: BugIcon,
    key: 'fix',
  },
  {
    icon: SparkleIcon,
    key: 'build',
  },
] as const;

export function LandingContextSection({
  onPromptSelect,
}: LandingContextSectionProps) {
  const { t } = useTranslation('common');
  const appNavigation = useAppNavigation();
  const { workspaces } = useWorkspaces();

  const recentWorkspaces = useMemo(
    () =>
      workspaces
        .filter((w) => !w.isArchived)
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT_LIMIT),
    [workspaces]
  );

  const attentionCount = useMemo(
    () => recentWorkspaces.filter((w) => w.hasUnseenActivity).length,
    [recentWorkspaces]
  );

  const hasRecent = recentWorkspaces.length > 0;

  const subhead =
    attentionCount === 0
      ? t('createMode.landing.recentSessions')
      : t('createMode.landing.sessionsAwaitingInput', {
          count: attentionCount,
        });

  return (
    <div className="flex flex-col gap-base">
      <header className="mb-8 flex items-end justify-between gap-double border-b border-brand/20 pb-double">
        <div>
          <p className="mb-base text-[9px] tracking-[0.28em] text-brand/65">
            PROJECT EXECUTION CENTER
          </p>
          <h1 className="chaotang-title text-3xl font-medium tracking-[0.12em] text-high">
            项目执行中枢
          </h1>
          <p className="mt-base text-sm text-low">
            选择既有项目继续执行，或从御案发起一项新任务。
          </p>
        </div>
        <div className="chaotang-jade-glow hidden size-12 items-center justify-center border border-brand/45 bg-brand/10 text-brand sm:flex">
          <SparkleIcon className="size-6" weight="duotone" />
        </div>
      </header>
      {hasRecent ? (
        <>
          <div className="flex items-center gap-base">
            <span className="h-px w-8 bg-brand/45" />
            <p className="chaotang-title text-sm tracking-wider text-normal">
              {subhead}
            </p>
          </div>
          <ul className="flex flex-col gap-[0.375rem]">
            {recentWorkspaces.map((workspace) => {
              const status = getStatusTag(workspace, t);
              return (
                <li key={workspace.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => appNavigation.goToWorkspace(workspace.id)}
                    className="group flex w-full min-w-0 items-center gap-base overflow-hidden border border-brand/15 bg-secondary/80 px-double py-base text-left text-sm text-normal backdrop-blur-sm transition-all hover:border-brand/45 hover:bg-brand/10"
                  >
                    {status && (
                      <span className="flex shrink-0 items-center gap-1">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${status.dotClass}`}
                          aria-hidden
                        />
                        <span
                          className={`text-xs font-medium ${status.textClass}`}
                        >
                          {status.label}
                        </span>
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {workspace.name}
                    </span>
                    {workspace.branch && (
                      <span className="min-w-0 max-w-[10ch] truncate text-xs text-neutral-500">
                        {workspace.branch}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-neutral-500">
                      {formatRelativeTimeShort(workspace.updatedAt, t)}
                    </span>
                    <CaretRightIcon
                      className="size-icon-xs shrink-0 text-brand/35 group-hover:text-brand"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="grid gap-base xl:grid-cols-[minmax(0,1fr)_240px]">
          <article className="relative border-x-[10px] border-[#9a7736] bg-[#eee8d5] px-8 py-7 text-[#282116] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="flex justify-between text-[10px] tracking-[0.14em] text-[#8f6e31]">
              <span>阶段 · 推进</span>
              <span>半卷</span>
            </div>
            <p className="mt-base text-[10px] tracking-[0.14em] text-[#9c4038]">
              一句御断
            </p>
            <h2 className="mt-half font-serif text-2xl font-semibold leading-relaxed">
              项目没有慢在执行，而是需要先确认目标、边界和唯一下一步。
            </h2>
            <div className="mt-double grid gap-px border border-[#a99162]/55 bg-[#a99162]/55 sm:grid-cols-3">
              {['选择工作目录', '说明想要的结果', '确认后开始执行'].map(
                (label, index) => (
                  <div key={label} className="bg-[#f4efdf] p-base">
                    <p className="text-[9px] text-[#9c4038]">
                      {index === 0
                        ? '发生了什么'
                        : index === 1
                          ? '与你的关系'
                          : '现在做什么'}
                    </p>
                    <p className="mt-half text-xs font-medium">{label}</p>
                  </div>
                )
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                onPromptSelect?.(
                  t('createMode.landing.quickStarts.analyze.prompt')
                )
              }
              className="mx-auto mt-double flex min-w-[280px] items-center justify-center gap-base border border-[#8e6d2f] bg-[#dbc176] px-double py-base text-sm font-semibold text-[#2c2416] hover:bg-[#e6cf8c]"
            >
              军机处 · 处理当前阻塞
              <CaretRightIcon className="size-4" />
            </button>
          </article>

          <aside className="border border-brand/25 bg-[#07100c]/92 p-base">
            <p className="text-[9px] tracking-[0.2em] text-brand/55">
              责任与交付
            </p>
            <h3 className="chaotang-title mt-half text-lg text-high">
              项目队列
            </h3>
            <div className="mt-base space-y-half">
              {['待你确认', '正在办理', '当前成果'].map((label, index) => (
                <div
                  key={label}
                  className="flex items-center justify-between border border-brand/15 px-base py-base text-xs text-normal"
                >
                  <span>{label}</span>
                  <span className="text-brand">
                    {index === 0 ? '1项' : index === 1 ? '0项' : '待接'}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-base text-[10px] leading-relaxed text-low">
              当前没有真实项目事件；创建后才显示执行状态与成果。
            </p>
          </aside>

          <div className="xl:col-span-2">
            <p className="mb-base chaotang-title text-sm tracking-wider text-normal">
              {t('createMode.landing.whatToWorkOn')}
            </p>
            <div className="grid grid-cols-1 gap-half sm:grid-cols-3">
              {QUICK_STARTS.map((item) => {
                const Icon = item.icon;
                const label = t(
                  `createMode.landing.quickStarts.${item.key}.label`
                );
                const prompt = t(
                  `createMode.landing.quickStarts.${item.key}.prompt`
                );
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onPromptSelect?.(prompt)}
                    className="flex items-center gap-base border border-brand/20 bg-secondary/80 px-base py-base text-left text-sm text-normal backdrop-blur-sm transition-all hover:border-brand/55 hover:bg-brand/10 hover:text-high"
                  >
                    <Icon className="size-icon-sm shrink-0 text-brand/70" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
