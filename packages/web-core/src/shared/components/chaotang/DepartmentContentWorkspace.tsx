import { useState } from 'react';
import { CHAOTANG_MODULE_SHELLS } from '@/shared/lib/chaotangShell';
import type { ShellCapabilityStatus } from '@/shared/lib/chaotangShell';
import { cn } from '@/shared/lib/utils';
import {
  ChaotangButton,
  ChaotangPanel,
  ChaotangSectionTitle,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { QintianWorkspace } from './QintianWorkspace';
import { QintianConsultWorkspace } from './QintianConsultWorkspace';
import { CalibrationWorkspace } from './CalibrationWorkspace';
import { LearningOverviewWorkspace } from './LearningOverviewWorkspace';
import { ShiguanWorkspace } from './ShiguanWorkspace';
import { ReviewDispositionWorkspace } from './ReviewDispositionWorkspace';
import { OutcomeReadinessWorkspace } from './OutcomeReadinessWorkspace';
import { HanlinReadinessWorkspace } from './HanlinReadinessWorkspace';
import { KnowledgeSourcesReadinessWorkspace } from './KnowledgeSourcesReadinessWorkspace';
import { LifeWorkspace } from './LifeWorkspace';

export type DepartmentModuleId = 'forecast' | 'learning' | 'life';

interface DepartmentContentWorkspaceProps {
  moduleId: DepartmentModuleId;
  initialSection?: string;
  /**
   * The court scroll already owns the page frame, title and outer description,
   * so the migrated content drops its own hero and presents compact section
   * entries instead of a second standalone workbench. The default (false) keeps
   * the original non-scroll layout untouched.
   */
  scrollPresentation?: boolean;
}

// These labels describe the page's declared design state only. They must never
// read as "the product model or data are live right now"; real connectivity is
// reported by the migrated business components' own queries.
const STATUS_LABEL: Record<ShellCapabilityStatus, string> = {
  live: '功能已接入',
  preview: '案例说明',
  planned: '待接入',
  unavailable: '未开放',
};

const STATUS_CLASS: Record<ShellCapabilityStatus, string> = {
  live: 'border-brand/35 bg-brand/10 text-brand',
  preview: 'border-brand/20 bg-primary/40 text-normal',
  planned: 'border-low/25 bg-secondary/70 text-low',
  unavailable: 'border-error/25 bg-error/5 text-error',
};

// The shell keeps a long technical title for life. This migrated component owns
// the user-facing copy instead: plain local wording, and a "local only" status
// that never claims a live model, cloud sync or a connected domain.
const LIFE_DISPLAY = {
  title: '生活',
  description: '在本机管理日程、提醒和笔记；不自动发送给模型。',
  statusLabel: '仅本机',
} as const;

/**
 * Migrates the real Qintian/Hanlin business components into the single court
 * shell. Only the content moves: the retired sidebar, department hero and
 * conversation dock stay out, and the shell section definitions provide the
 * unified section buttons and short descriptions.
 */
function renderSectionBody(
  moduleId: DepartmentModuleId,
  sectionId: string,
  onNavigate: (sectionId: string) => void,
  scrollPresentation: boolean
) {
  if (moduleId === 'forecast') {
    switch (sectionId) {
      case 'forecast-overview':
        return <QintianWorkspace mode="overview" />;
      case 'consult':
        return <QintianConsultWorkspace />;
      case 'forecasts':
        return <QintianWorkspace mode="forecasts" />;
      case 'triggers':
        return <QintianWorkspace mode="triggers" />;
      case 'reviews':
        return <QintianWorkspace mode="reviews" />;
      case 'calibration':
        return <CalibrationWorkspace />;
      default:
        return null;
    }
  }
  if (moduleId === 'life') {
    switch (sectionId) {
      case 'life-today':
        return <LifeWorkspace mode="today" />;
      case 'calendar':
        return <LifeWorkspace mode="calendar" />;
      case 'reminders':
        return <LifeWorkspace mode="reminders" />;
      case 'notes':
        return <LifeWorkspace mode="notes" />;
      case 'privacy':
        return <LifeWorkspace mode="privacy" />;
      default:
        return null;
    }
  }
  switch (sectionId) {
    case 'learning-overview':
      return (
        <LearningOverviewWorkspace
          onNavigate={onNavigate}
          scrollPresentation={scrollPresentation}
        />
      );
    case 'archives':
      return <ShiguanWorkspace mode="archives" />;
    case 'recall':
      return <ShiguanWorkspace mode="recall" />;
    case 'archive-review':
      return <ReviewDispositionWorkspace />;
    case 'outcomes':
      return <OutcomeReadinessWorkspace />;
    case 'hanlin':
      return <HanlinReadinessWorkspace />;
    case 'knowledge-sources':
      return <KnowledgeSourcesReadinessWorkspace />;
    default:
      return null;
  }
}

export function DepartmentContentWorkspace({
  moduleId,
  initialSection,
  scrollPresentation = false,
}: DepartmentContentWorkspaceProps) {
  const shell = CHAOTANG_MODULE_SHELLS[moduleId];
  const fallbackSection = shell.sections[0]!;
  const [activeSectionId, setActiveSectionId] = useState(() =>
    initialSection &&
    shell.sections.some((section) => section.id === initialSection)
      ? initialSection
      : fallbackSection.id
  );
  const activeSection =
    shell.sections.find((section) => section.id === activeSectionId) ??
    fallbackSection;
  const isLife = moduleId === 'life';
  const displayName = isLife ? LIFE_DISPLAY.title : shell.officialDomainName;
  const description = isLife ? LIFE_DISPLAY.description : shell.description;

  const sectionNav = (
    <nav
      aria-label={`${displayName}栏目`}
      className={cn(
        'flex flex-wrap',
        scrollPresentation ? 'gap-half' : 'gap-base'
      )}
    >
      {shell.sections.map((section) => {
        const active = section.id === activeSection.id;
        return (
          <ChaotangButton
            key={section.id}
            variant={active ? 'primary' : 'secondary'}
            aria-pressed={active}
            data-status={section.status}
            onClick={() => setActiveSectionId(section.id)}
          >
            {section.label}
          </ChaotangButton>
        );
      })}
    </nav>
  );

  const statusBadge = (
    <span
      data-status-badge={activeSection.status}
      className={cn(
        'inline-flex shrink-0 items-center border px-base py-half text-[9px] tracking-[0.14em]',
        isLife
          ? 'border-brand/35 bg-brand/10 text-brand'
          : STATUS_CLASS[activeSection.status]
      )}
    >
      {isLife ? LIFE_DISPLAY.statusLabel : STATUS_LABEL[activeSection.status]}
    </span>
  );

  if (scrollPresentation) {
    // The original 御屏 owns the frame; only the section choices and the single
    // active section render, so the paper never has to fit a second hero, a
    // duplicated workbench or two sections at once.
    return (
      <div
        className="department-scroll-workspace"
        data-court-scroll-presentation="true"
      >
        {sectionNav}
        <section className="department-scroll-section">
          <div className="flex flex-wrap items-center justify-between gap-base border-b border-brand/15 pb-base">
            <h2 className="chaotang-title text-lg text-high">
              {activeSection.label}
            </h2>
            {statusBadge}
          </div>
          <p className="mt-half text-xs leading-relaxed text-low">
            {activeSection.description}
          </p>
          <div className="mt-base">
            {renderSectionBody(
              moduleId,
              activeSection.id,
              setActiveSectionId,
              true
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-double">
      <ChaotangSectionTitle eyebrow={shell.eyebrow}>
        {displayName}
      </ChaotangSectionTitle>
      <p className="max-w-3xl text-sm leading-relaxed text-low">
        {description}
      </p>
      {sectionNav}
      <ChaotangPanel className="p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-base">
          <div className="min-w-0">
            <h2 className="chaotang-title text-xl text-high">
              {activeSection.label}
            </h2>
            <p className="mt-half text-sm leading-relaxed text-low">
              {activeSection.description}
            </p>
          </div>
          {statusBadge}
        </div>
        <div className="mt-double">
          {renderSectionBody(
            moduleId,
            activeSection.id,
            setActiveSectionId,
            false
          )}
        </div>
      </ChaotangPanel>
    </div>
  );
}
