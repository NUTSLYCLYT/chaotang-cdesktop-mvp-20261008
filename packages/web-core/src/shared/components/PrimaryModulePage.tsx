import { useEffect, useMemo, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import {
  CaretRightIcon,
  DatabaseIcon,
  MagnifyingGlassIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import type { PrimaryModuleId } from '@/shared/lib/primaryModules';
import { PRIMARY_MODULES } from '@/shared/lib/primaryModules';
import {
  CHAOTANG_MODULE_SHELLS,
  type ChaotangShellSection,
  type ShellCapabilityStatus,
} from '@/shared/lib/chaotangShell';
import {
  ChaotangButton,
  ChaotangEmptyState,
  ChaotangPanel,
  ChaotangSectionTitle,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { DadianOverviewContainer } from '@/shared/components/chaotang/DadianOverviewContainer';
import { ShiguanWorkspace } from '@/shared/components/chaotang/ShiguanWorkspace';
import { QintianWorkspace } from '@/shared/components/chaotang/QintianWorkspace';
import { HubuWorkspace } from '@/shared/components/chaotang/HubuWorkspace';
import { JinyiweiWorkspace } from '@/shared/components/chaotang/JinyiweiWorkspace';
import { AuditWorkspace } from '@/shared/components/chaotang/AuditWorkspace';
import { SkillsWorkspace } from '@/shared/components/chaotang/SkillsWorkspace';
import { McpWorkspace } from '@/shared/components/chaotang/McpWorkspace';
import { ConnectorsWorkspace } from '@/shared/components/chaotang/ConnectorsWorkspace';
import { AppearanceWorkspace } from '@/shared/components/chaotang/AppearanceWorkspace';
import { ZhuanshuWorkspace } from '@/shared/components/chaotang/ZhuanshuWorkspace';
import { ReadinessWorkspace } from '@/shared/components/chaotang/ReadinessWorkspace';
import { DailyMemorialWorkspace } from '@/shared/components/chaotang/DailyMemorialWorkspace';
import { PendingReviewWorkspace } from '@/shared/components/chaotang/PendingReviewWorkspace';
import { DecreeJobsWorkspace } from '@/shared/components/chaotang/DecreeJobsWorkspace';
import { QintianConsultWorkspace } from '@/shared/components/chaotang/QintianConsultWorkspace';
import { CalibrationWorkspace } from '@/shared/components/chaotang/CalibrationWorkspace';
import { ReviewDispositionWorkspace } from '@/shared/components/chaotang/ReviewDispositionWorkspace';
import { OutcomeReadinessWorkspace } from '@/shared/components/chaotang/OutcomeReadinessWorkspace';
import { HanlinReadinessWorkspace } from '@/shared/components/chaotang/HanlinReadinessWorkspace';
import { KnowledgeSourcesReadinessWorkspace } from '@/shared/components/chaotang/KnowledgeSourcesReadinessWorkspace';
import { CashSafetyReadinessWorkspace } from '@/shared/components/chaotang/CashSafetyReadinessWorkspace';
import { LearningOverviewWorkspace } from '@/shared/components/chaotang/LearningOverviewWorkspace';
import { LifeWorkspace } from '@/shared/components/chaotang/LifeWorkspace';
import { GovernanceOverviewWorkspace } from '@/shared/components/chaotang/GovernanceOverviewWorkspace';
import { ModelProvidersWorkspace } from '@/shared/components/chaotang/ModelProvidersWorkspace';
import {
  ChaotangConversationDock,
  ChaotangDepartmentHero,
  ChaotangSmartStage,
} from '@/shared/components/chaotang/ChaotangSmartStage';

interface PrimaryModulePageProps {
  moduleId: Exclude<PrimaryModuleId, 'projects'>;
}

function DadianContextSidebar({
  onNavigate,
}: {
  onNavigate: (sectionId: string) => void;
}) {
  return (
    <div className="flex h-full flex-col px-base">
      <div className="flex items-center justify-between border-b border-brand/25 pb-base">
        <div>
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            当前上下文
          </p>
          <h1 className="chaotang-title mt-half text-xl text-high">
            今日与你有关
          </h1>
        </div>
        <span className="border border-brand/25 px-base py-half text-xs text-brand">
          ‹
        </span>
      </div>

      <div className="mt-base border-t-2 border-brand/70 bg-primary/45 p-base">
        <p className="text-[10px] text-brand">丞相 · 一句话认识这里</p>
        <p className="mt-half text-sm font-medium leading-relaxed text-high">
          每天替你汇总六域变化，只留下今天最值得决定的一件事。
        </p>
        <p className="mt-half text-xs leading-relaxed text-low">
          你会获得今日信息、丞相建议、唯一行动和可继续商议的完整上下文。
        </p>
      </div>

      <div className="mt-base border border-brand/20 bg-primary/35 p-base">
        <div className="flex items-start justify-between gap-base">
          <div>
            <p className="text-[10px] text-brand">现在最值得做</p>
            <p className="mt-half text-sm font-medium text-high">
              先确认本日唯一主攻
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('decree-jobs')}
            className="shrink-0 border border-brand/35 px-base py-half text-[10px] text-brand hover:bg-brand/10"
          >
            继续上次任务 →
          </button>
        </div>
        <p className="mt-half text-xs text-low">分散注意力会推迟关键验证。</p>
      </div>

      <div className="mt-base border border-brand/20 bg-primary/35 p-base">
        <p className="text-[10px] text-brand">建议找他聊</p>
        <div className="mt-base flex items-center gap-base">
          <span className="chaotang-title flex size-10 items-center justify-center border border-brand/45 bg-brand/10 text-brand">
            丞
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-high">丞相</p>
            <p className="text-xs text-low">AI Agent · 替你解释并形成下一步</p>
          </div>
          <button
            type="button"
            className="border border-brand/35 px-base py-half text-xs text-brand hover:bg-brand/10"
          >
            召见
          </button>
        </div>
      </div>

      <div className="mt-base border border-brand/15 bg-primary/25 p-base">
        <p className="text-[10px] text-brand">你可以得到</p>
        <ul className="mt-base space-y-half text-xs text-low">
          <li>· 一句今日御断</li>
          <li>· 一项唯一行动</li>
          <li>· 一份可继续推进的任务护照</li>
        </ul>
      </div>

      <p className="mt-auto border-t border-brand/15 pt-base text-[10px] leading-relaxed text-low">
        PREVIEW 表示页面结构已完成；真实领域数据按连接状态逐项开放。
      </p>
    </div>
  );
}

const STATUS_META: Record<
  ShellCapabilityStatus,
  { label: string; className: string }
> = {
  live: {
    label: 'LIVE · 已接真实数据',
    className: 'border-success/35 bg-success/10 text-success',
  },
  preview: {
    label: 'PREVIEW · 未接真实数据',
    className: 'border-brand/35 bg-brand/10 text-brand',
  },
  planned: {
    label: 'PLANNED · 接口预留',
    className: 'border-low/25 bg-secondary/70 text-low',
  },
  unavailable: {
    label: 'UNAVAILABLE · 未开放',
    className: 'border-error/25 bg-error/5 text-error',
  },
};

export function ShellStatusBadge({
  status,
}: {
  status: ShellCapabilityStatus;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center border px-base py-half text-[9px] tracking-[0.14em]',
        meta.className
      )}
    >
      {meta.label}
    </span>
  );
}

export function SectionWorkspace({
  section,
}: {
  section: ChaotangShellSection;
}) {
  const { health, error, isChecking, refresh } = useChaotangProvider();
  const [viewState, setViewState] = useState<
    'preview' | 'empty' | 'loading' | 'error' | 'restricted'
  >('preview');

  const stateOptions = [
    ['preview', '预览'],
    ['empty', '空状态'],
    ['loading', '加载'],
    ['error', '错误'],
    ['restricted', '未授权'],
  ] as const;

  return (
    <div className="grid gap-double xl:grid-cols-[1.35fr_0.8fr]">
      <ChaotangPanel className="min-h-[320px] p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-brand/55">
              FUNCTION SHELL
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              {section.label}
            </h2>
            {section.documentName && (
              <p className="mt-half font-mono text-xs text-brand/55">
                {section.documentName}
              </p>
            )}
          </div>
          <ShellStatusBadge status={section.status} />
        </div>

        <p className="mt-double max-w-3xl text-sm leading-relaxed text-normal">
          {section.description}
        </p>

        <div
          className="mt-double flex flex-wrap gap-half"
          aria-label="界面状态预览"
        >
          {stateOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setViewState(value)}
              className={cn(
                'border px-base py-half text-[10px] transition-colors',
                viewState === value
                  ? 'border-brand/45 bg-brand/10 text-brand'
                  : 'border-brand/15 text-low hover:border-brand/30 hover:text-normal'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {viewState === 'preview' && (
          <div className="mt-double">
            <p className="mb-base text-xs tracking-[0.18em] text-brand/65">
              数据字段壳
            </p>
            <div className="grid gap-base sm:grid-cols-2">
              {section.fields.map((field) => (
                <div
                  key={field}
                  className="flex min-h-11 items-center gap-base border border-brand/15 bg-primary/45 px-base text-sm text-normal"
                >
                  <DatabaseIcon className="size-4 shrink-0 text-brand/55" />
                  <span>{field}</span>
                  <span className="ml-auto text-[9px] text-low">待接入</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {viewState === 'loading' && (
          <div className="mt-double grid animate-pulse gap-base sm:grid-cols-2">
            {section.fields.slice(0, 4).map((field) => (
              <div
                key={field}
                className="h-11 border border-brand/10 bg-brand/5"
              />
            ))}
          </div>
        )}

        {viewState !== 'preview' && viewState !== 'loading' && (
          <ChaotangEmptyState
            className="mt-double"
            title={
              viewState === 'empty'
                ? '当前没有可展示的记录'
                : viewState === 'error'
                  ? '领域 Provider 连接失败'
                  : '当前身份无权访问'
            }
            description={
              viewState === 'empty'
                ? '真实数据源接入后，此处将区分“确实为空”和“尚未连接”。'
                : viewState === 'error'
                  ? '保留错误编号、重试入口和诊断信息位置，不伪造业务结果。'
                  : '权限将由 authority 与领域接口共同判定，壳层不自行放行。'
            }
          />
        )}

        <div className="mt-double flex flex-wrap gap-base border-t border-brand/15 pt-double">
          {section.actions.map((action, index) => (
            <ChaotangButton
              key={action}
              variant={index === 0 ? 'primary' : 'secondary'}
              disabled
              title="真实 Provider 接入后开放"
            >
              {action}
            </ChaotangButton>
          ))}
        </div>
      </ChaotangPanel>

      <div className="flex flex-col gap-double">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <ShieldCheckIcon className="size-5 text-success" weight="duotone" />
            <p className="chaotang-title text-lg text-high">真实性边界</p>
          </div>
          <ul className="mt-double space-y-base text-sm leading-relaxed text-low">
            <li>领域页当前仍是页面、导航、字段和交互位置壳。</li>
            <li>当前仅接入 FastAPI 健康与账户接口，业务数据尚未接入。</li>
            <li>PREVIEW 不得升级为 LIVE，也不产生外部副作用。</li>
          </ul>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <PlugsConnectedIcon
              className="size-5 text-brand"
              weight="duotone"
            />
            <p className="chaotang-title text-lg text-high">Provider 接口</p>
          </div>
          <div className="mt-double space-y-base text-sm">
            <div className="flex justify-between border-b border-brand/10 pb-base">
              <span className="text-low">当前来源</span>
              <span className={health ? 'text-success' : 'text-brand'}>
                {health ? 'ChaotangProvider' : 'ShellProvider'}
              </span>
            </div>
            <div className="flex justify-between border-b border-brand/10 pb-base">
              <span className="text-low">后端状态</span>
              <span className={health ? 'text-success' : 'text-low'}>
                {isChecking
                  ? '检查中…'
                  : health
                    ? `已连接 · v${health.version}`
                    : '未连接'}
              </span>
            </div>
            <div className="flex justify-between border-b border-brand/10 pb-base">
              <span className="text-low">服务地址</span>
              <span className="max-w-48 truncate font-mono text-xs text-low">
                {health?.baseUrl ?? '由 Tauri 原生层持有'}
              </span>
            </div>
            <div className="flex justify-between border-b border-brand/10 pb-base">
              <span className="text-low">写入操作</span>
              <span className="text-low">禁用</span>
            </div>
            {error && !isChecking && (
              <p className="text-xs leading-relaxed text-error">{error}</p>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isChecking}
              className="border border-brand/25 px-base py-half text-xs text-brand transition-colors hover:bg-brand/10 disabled:opacity-50"
            >
              {isChecking ? '正在检查' : '重新检查连接'}
            </button>
          </div>
        </ChaotangPanel>
      </div>
    </div>
  );
}

export function PrimaryModulePage({ moduleId }: PrimaryModulePageProps) {
  const location = useLocation();
  const module = PRIMARY_MODULES.find((item) => item.id === moduleId)!;
  const shell = CHAOTANG_MODULE_SHELLS[moduleId];
  const Icon = module.icon;
  const [activeSectionId, setActiveSectionId] = useState(shell.sections[0]!.id);
  const [query, setQuery] = useState('');
  const { health, user } = useChaotangProvider();

  useEffect(() => {
    const requestedSection = location.hash.replace(/^#/, '');
    if (shell.sections.some((section) => section.id === requestedSection)) {
      setActiveSectionId(requestedSection);
    }
  }, [location.hash, shell.sections]);

  const visibleSections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return shell.sections;
    return shell.sections.filter((section) =>
      [
        section.label,
        section.description,
        ...section.fields,
        ...section.actions,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized)
    );
  }, [query, shell.sections]);

  const activeSection =
    shell.sections.find((section) => section.id === activeSectionId) ??
    shell.sections[0]!;
  const isLiveSection =
    (moduleId === 'more' &&
      ['appearance', 'model-providers'].includes(activeSection.id)) ||
    (moduleId === 'life' &&
      ['life-today', 'calendar', 'reminders', 'notes', 'privacy'].includes(
        activeSection.id
      )) ||
    (Boolean(health) &&
      moduleId === 'today' &&
      activeSection.id === 'readiness') ||
    (Boolean(health && user) &&
      ((moduleId === 'today' && activeSection.id === 'dadian-overview') ||
        (moduleId === 'today' && activeSection.id === 'decree-jobs') ||
        (moduleId === 'today' && activeSection.id === 'daily-memorial') ||
        (moduleId === 'today' && activeSection.id === 'pending-review') ||
        (moduleId === 'learning' &&
          [
            'learning-overview',
            'archives',
            'recall',
            'archive-review',
            'outcomes',
            'hanlin',
          ].includes(activeSection.id)) ||
        (moduleId === 'forecast' &&
          [
            'forecast-overview',
            'consult',
            'forecasts',
            'triggers',
            'reviews',
          ].includes(activeSection.id)) ||
        (moduleId === 'wealth' &&
          [
            'hubu-overview',
            'accounting-reports',
            'work-products',
            'artifacts',
            'confirmations',
          ].includes(activeSection.id)) ||
        (moduleId === 'more' &&
          [
            'governance-overview',
            'zhuanshu',
            'jinyiwei',
            'skills',
            'mcp',
            'connectors',
            'audit',
          ].includes(activeSection.id))));
  const isDadianHome =
    moduleId === 'today' && activeSection.id === 'dadian-overview';

  return (
    <div className="chaotang-module-layout chaotang-grain relative flex h-full min-h-0 bg-primary/[0.12]">
      <aside className="chaotang-module-sidebar flex w-[300px] shrink-0 flex-col border-r border-brand/25 bg-[#07100c]/95 pb-double pt-20 backdrop-blur-xl">
        {isDadianHome ? (
          <DadianContextSidebar onNavigate={setActiveSectionId} />
        ) : (
          <>
            <div className="px-double">
              <div className="mb-double flex items-center gap-base">
                <div className="flex size-10 items-center justify-center border border-brand/35 bg-brand/5 text-brand">
                  <Icon className="size-5" weight="duotone" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[9px] tracking-[0.24em] text-brand/50">
                    {shell.eyebrow}
                  </p>
                  <h1 className="chaotang-title truncate text-xl font-semibold text-high">
                    {shell.officialDomainName}
                  </h1>
                </div>
              </div>

              <label className="mb-base flex items-center gap-base border border-brand/20 bg-primary/45 px-base py-base text-low focus-within:border-brand/55">
                <MagnifyingGlassIcon className="size-4 shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索功能…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-normal outline-none placeholder:text-low"
                />
              </label>
            </div>

            <nav
              aria-label={`${shell.officialDomainName}二级导航`}
              className="min-h-0 flex-1 overflow-y-auto px-base"
            >
              <div className="flex flex-col gap-half">
                {visibleSections.map((section) => {
                  const isActive = section.id === activeSection.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSectionId(section.id)}
                      className={cn(
                        'group flex min-h-12 items-center gap-base border px-base py-base text-left text-sm transition-all',
                        isActive
                          ? 'border-brand/45 bg-brand/10 text-brand'
                          : 'border-transparent text-normal hover:border-brand/20 hover:bg-brand/5 hover:text-high'
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {section.label}
                      </span>
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          section.status === 'live'
                            ? 'bg-success'
                            : section.status === 'preview'
                              ? 'bg-brand'
                              : section.status === 'planned'
                                ? 'bg-low/55'
                                : 'bg-error'
                        )}
                      />
                      <CaretRightIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                    </button>
                  );
                })}
              </div>
              {visibleSections.length === 0 && (
                <p className="px-base py-double text-center text-sm text-low">
                  没有匹配的功能
                </p>
              )}
            </nav>

            <div className="mx-double mt-base border-t border-brand/15 pt-base text-xs leading-relaxed text-low">
              {isLiveSection ? (
                <>
                  <span className="text-success">LIVE</span>{' '}
                  表示当前页面已连接真实领域数据。
                </>
              ) : (
                <>
                  <span className="text-brand">PREVIEW</span>{' '}
                  表示产品壳已完成，尚未连接真实领域服务。
                </>
              )}
            </div>
          </>
        )}
      </aside>

      <main className="chaotang-module-main relative min-w-0 flex-1 overflow-y-auto bg-primary/[0.08] px-8 pb-40 pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,hsl(var(--brand)/0.08),transparent_68%)]" />
        <div className="relative mx-auto max-w-[1540px]">
          <ChaotangSectionTitle eyebrow={shell.eyebrow}>
            {shell.officialDomainName}
          </ChaotangSectionTitle>
          <div className="mb-double mt-base flex flex-wrap items-center justify-between gap-base">
            <p className="max-w-3xl text-sm leading-relaxed text-low">
              {shell.description}
            </p>
            <ShellStatusBadge status={isLiveSection ? 'live' : 'preview'} />
          </div>
          <div
            className={cn(
              'chaotang-final-stage grid items-start gap-double',
              !(
                moduleId === 'today' && activeSection.id === 'dadian-overview'
              ) && '2xl:grid-cols-[minmax(0,1fr)_276px]'
            )}
          >
            <section className="chaotang-corner-frame min-w-0 border border-brand/20 bg-[#07100c]/72 p-base shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
              {!isDadianHome && (
                <ChaotangDepartmentHero
                  department={shell.officialDomainName}
                  section={activeSection.label}
                  description={activeSection.description}
                  primaryAction={activeSection.actions[0]}
                  fields={activeSection.fields}
                  isLive={isLiveSection}
                />
              )}
              <div id="chaotang-real-workspace" className="scroll-mt-24">
                {moduleId === 'today' &&
                activeSection.id === 'dadian-overview' ? (
                  <ChaotangSmartStage
                    isAuthenticated={Boolean(user)}
                    realContent={<DadianOverviewContainer />}
                  />
                ) : moduleId === 'today' &&
                  activeSection.id === 'decree-jobs' ? (
                  <DecreeJobsWorkspace />
                ) : moduleId === 'today' &&
                  activeSection.id === 'daily-memorial' ? (
                  <DailyMemorialWorkspace />
                ) : moduleId === 'today' &&
                  activeSection.id === 'pending-review' ? (
                  <PendingReviewWorkspace />
                ) : moduleId === 'today' && activeSection.id === 'readiness' ? (
                  <ReadinessWorkspace />
                ) : moduleId === 'forecast' &&
                  activeSection.id === 'forecast-overview' ? (
                  <QintianWorkspace mode="overview" />
                ) : moduleId === 'forecast' &&
                  activeSection.id === 'consult' ? (
                  <QintianConsultWorkspace />
                ) : moduleId === 'forecast' &&
                  activeSection.id === 'forecasts' ? (
                  <QintianWorkspace mode="forecasts" />
                ) : moduleId === 'forecast' &&
                  activeSection.id === 'triggers' ? (
                  <QintianWorkspace mode="triggers" />
                ) : moduleId === 'forecast' &&
                  activeSection.id === 'reviews' ? (
                  <QintianWorkspace mode="reviews" />
                ) : moduleId === 'forecast' &&
                  activeSection.id === 'calibration' ? (
                  <CalibrationWorkspace />
                ) : moduleId === 'wealth' &&
                  activeSection.id === 'hubu-overview' ? (
                  <HubuWorkspace mode="overview" />
                ) : moduleId === 'wealth' &&
                  activeSection.id === 'cash-safety' ? (
                  <CashSafetyReadinessWorkspace />
                ) : moduleId === 'wealth' &&
                  activeSection.id === 'accounting-reports' ? (
                  <HubuWorkspace mode="reports" />
                ) : moduleId === 'wealth' &&
                  activeSection.id === 'work-products' ? (
                  <HubuWorkspace mode="products" />
                ) : moduleId === 'wealth' &&
                  activeSection.id === 'artifacts' ? (
                  <HubuWorkspace mode="artifacts" />
                ) : moduleId === 'wealth' &&
                  activeSection.id === 'confirmations' ? (
                  <HubuWorkspace mode="confirmations" />
                ) : moduleId === 'learning' &&
                  activeSection.id === 'learning-overview' ? (
                  <LearningOverviewWorkspace onNavigate={setActiveSectionId} />
                ) : moduleId === 'learning' &&
                  activeSection.id === 'archives' ? (
                  <ShiguanWorkspace mode="archives" />
                ) : moduleId === 'learning' && activeSection.id === 'recall' ? (
                  <ShiguanWorkspace mode="recall" />
                ) : moduleId === 'learning' &&
                  activeSection.id === 'archive-review' ? (
                  <ReviewDispositionWorkspace />
                ) : moduleId === 'learning' &&
                  activeSection.id === 'outcomes' ? (
                  <OutcomeReadinessWorkspace />
                ) : moduleId === 'learning' && activeSection.id === 'hanlin' ? (
                  <HanlinReadinessWorkspace />
                ) : moduleId === 'learning' &&
                  activeSection.id === 'knowledge-sources' ? (
                  <KnowledgeSourcesReadinessWorkspace />
                ) : moduleId === 'life' && activeSection.id === 'life-today' ? (
                  <LifeWorkspace mode="today" />
                ) : moduleId === 'life' && activeSection.id === 'calendar' ? (
                  <LifeWorkspace mode="calendar" />
                ) : moduleId === 'life' && activeSection.id === 'reminders' ? (
                  <LifeWorkspace mode="reminders" />
                ) : moduleId === 'life' && activeSection.id === 'notes' ? (
                  <LifeWorkspace mode="notes" />
                ) : moduleId === 'life' && activeSection.id === 'privacy' ? (
                  <LifeWorkspace mode="privacy" />
                ) : moduleId === 'more' && activeSection.id === 'zhuanshu' ? (
                  <ZhuanshuWorkspace
                    onOpenJinyiwei={() => setActiveSectionId('jinyiwei')}
                  />
                ) : moduleId === 'more' &&
                  activeSection.id === 'governance-overview' ? (
                  <GovernanceOverviewWorkspace
                    onNavigate={setActiveSectionId}
                  />
                ) : moduleId === 'more' && activeSection.id === 'jinyiwei' ? (
                  <JinyiweiWorkspace />
                ) : moduleId === 'more' && activeSection.id === 'audit' ? (
                  <AuditWorkspace />
                ) : moduleId === 'more' && activeSection.id === 'skills' ? (
                  <SkillsWorkspace />
                ) : moduleId === 'more' && activeSection.id === 'mcp' ? (
                  <McpWorkspace />
                ) : moduleId === 'more' && activeSection.id === 'connectors' ? (
                  <ConnectorsWorkspace />
                ) : moduleId === 'more' &&
                  activeSection.id === 'model-providers' ? (
                  <ModelProvidersWorkspace />
                ) : moduleId === 'more' && activeSection.id === 'appearance' ? (
                  <AppearanceWorkspace />
                ) : (
                  <SectionWorkspace section={activeSection} />
                )}
              </div>
            </section>

            <aside
              className={cn(
                'hidden space-y-base 2xl:block',
                moduleId === 'today' &&
                  activeSection.id === 'dadian-overview' &&
                  '2xl:hidden'
              )}
              aria-label="当前功能研判"
            >
              <ChaotangPanel className="p-double">
                <p className="text-[9px] tracking-[0.24em] text-brand/55">
                  CURRENT MEMORIAL
                </p>
                <h2 className="chaotang-title mt-half text-xl text-high">
                  当前研判
                </h2>
                <div className="mt-double border-l border-brand/35 pl-base">
                  <p className="text-sm font-medium text-high">
                    {activeSection.label}
                  </p>
                  <p className="mt-half text-xs leading-relaxed text-low">
                    {activeSection.description}
                  </p>
                </div>
                <div className="mt-double grid grid-cols-2 gap-half">
                  <div className="border border-brand/15 bg-primary/45 p-base">
                    <p className="text-[9px] text-low">数据状态</p>
                    <p
                      className={cn(
                        'mt-half text-xs',
                        isLiveSection ? 'text-success' : 'text-brand'
                      )}
                    >
                      {isLiveSection ? '真实接入' : '接口预留'}
                    </p>
                  </div>
                  <div className="border border-brand/15 bg-primary/45 p-base">
                    <p className="text-[9px] text-low">字段数量</p>
                    <p className="mt-half text-xs text-brand">
                      {activeSection.fields.length} 项
                    </p>
                  </div>
                </div>
              </ChaotangPanel>

              <ChaotangPanel className="p-double">
                <div className="flex items-center justify-between">
                  <p className="chaotang-title text-base text-high">
                    结果与边界
                  </p>
                  <ShieldCheckIcon
                    className="size-4 text-success"
                    weight="duotone"
                  />
                </div>
                <ul className="mt-base space-y-base text-xs leading-relaxed text-low">
                  <li>页面壳、导航与真实客户端功能已保留。</li>
                  <li>未接入字段继续标记为 PREVIEW，不伪造结果。</li>
                  <li>写入动作仍受账户、权限与 Provider 状态控制。</li>
                </ul>
                <div className="mt-double border-t border-brand/15 pt-base">
                  <p className="text-[9px] tracking-[0.16em] text-brand/55">
                    PROVIDER
                  </p>
                  <div className="mt-half flex items-center justify-between text-xs">
                    <span className="text-low">朝堂领域服务</span>
                    <span className={health ? 'text-success' : 'text-brand'}>
                      {health ? '已连接' : '待连接'}
                    </span>
                  </div>
                </div>
              </ChaotangPanel>
            </aside>
          </div>
        </div>
      </main>
      <div className="absolute bottom-0 left-[300px] right-0 z-30">
        <ChaotangConversationDock />
      </div>
    </div>
  );
}
