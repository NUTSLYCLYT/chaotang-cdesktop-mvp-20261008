import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  CaretRightIcon,
  ScrollIcon,
} from '@phosphor-icons/react';
import {
  SectionWorkspace,
  ShellStatusBadge,
} from '@/shared/components/PrimaryModulePage';
import { ChaotangSectionTitle } from '@/shared/components/chaotang/ChaotangPrimitives';
import type { ChaotangShellSection } from '@/shared/lib/chaotangShell';
import { cn } from '@/shared/lib/utils';
import { ChancellorStudyWorkspace } from '@/shared/components/chaotang/ChancellorStudyWorkspace';
import { DecreeJobsWorkspace } from '@/shared/components/chaotang/DecreeJobsWorkspace';
import { JunjichuCasesWorkspace } from '@/shared/components/chaotang/JunjichuCasesWorkspace';

const COURT_TASK_SECTIONS: ChaotangShellSection[] = [
  {
    id: 'study',
    label: '上书房',
    documentName: '/study',
    description: '提出目标、咨询丞相、形成拟旨并正式下旨的核心入口。',
    status: 'live',
    fields: ['目标', 'DraftEdict', '材料缺口', '路由建议', 'authority'],
    actions: ['咨询丞相', '形成拟旨', '正式下旨'],
  },
  {
    id: 'decree-jobs',
    label: '旨意任务',
    description: '查看持久化异步任务的真实 state、stage 与结果。',
    status: 'live',
    fields: ['Job ID', 'QUEUED', 'RUNNING', 'ARCHIVING', 'SUCCEEDED'],
    actions: ['查看任务', '请求取消'],
  },
  {
    id: 'junjichu',
    label: '军机处',
    documentName: '/junjichu',
    description: '只处理 multi 路径，按批准顺序串行召集多个部门。',
    status: 'live',
    fields: ['参与部门', '审议顺序', '部议引用', '会审结论', '待丞相裁决'],
    actions: ['查看案卷', '查看会审'],
  },
  {
    id: 'liubu',
    label: '六部',
    documentName: '/liubu',
    description: '吏部、户部、礼部、兵部、刑部、工部及其 39 司目录。',
    status: 'preview',
    fields: ['部门', '司局', '职责', 'RuntimeSkill', '开放状态'],
    actions: ['查看六部', '查看司局'],
  },
  {
    id: 'bureau-reports',
    label: '司议与部议',
    description: '严格分离 BureauReport 与 MinistryReport 的阅读界面。',
    status: 'preview',
    fields: ['专业发现', '风险', '证据请求', '部议立场', '未决事项'],
    actions: ['查看司议', '查看部议'],
  },
  {
    id: 'zhuanshu',
    label: '专署',
    documentName: '/zhuanshu',
    description: '专署能力目录；当前技术文档仅定义锦衣卫开放。',
    status: 'preview',
    fields: ['专署', '开放状态', '权限边界', '事实来源'],
    actions: ['查看专署'],
  },
  {
    id: 'jinyiwei',
    label: '锦衣卫',
    documentName: '/zhuanshu/jinyiwei',
    description: '由司级节点请求的受控、只读、失败关闭证据调查。',
    status: 'preview',
    fields: ['调查', '事实槽位', '来源尝试', '证据包', '采用状态'],
    actions: ['查看调查', '查看证据'],
  },
  {
    id: 'reply',
    label: '最终回奏',
    description: '展示唯一 REPLY、丞相总结与恰好三条建议。',
    status: 'preview',
    fields: ['办理路径', '司议', '部议', '军机处结论', '三条建议'],
    actions: ['阅读回奏', '进入史馆'],
  },
];

export function CourtTaskShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedSection = location.hash.replace(/^#/, '');
  const initialSection = COURT_TASK_SECTIONS.some(
    (section) => section.id === requestedSection
  )
    ? requestedSection
    : COURT_TASK_SECTIONS[0]!.id;
  const [activeId, setActiveId] = useState(initialSection);

  useEffect(() => {
    if (
      requestedSection &&
      COURT_TASK_SECTIONS.some((section) => section.id === requestedSection)
    ) {
      setActiveId(requestedSection);
    }
  }, [requestedSection]);
  const activeSection =
    COURT_TASK_SECTIONS.find((section) => section.id === activeId) ??
    COURT_TASK_SECTIONS[0]!;

  return (
    <div className="chaotang-grain flex h-full min-h-0 bg-primary/[0.12]">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-brand/20 bg-secondary/90 pb-double pt-12 backdrop-blur-xl">
        <div className="px-double">
          <button
            type="button"
            onClick={() => void navigate({ to: '/workspaces' })}
            className="mb-double flex items-center gap-half text-xs text-low hover:text-brand"
          >
            <ArrowLeftIcon className="size-3" />
            返回技术工作区
          </button>
          <div className="mb-double flex items-center gap-base">
            <div className="flex size-10 items-center justify-center border border-brand/40 bg-brand/10 text-brand">
              <ScrollIcon className="size-5" weight="duotone" />
            </div>
            <div>
              <p className="text-[9px] tracking-[0.24em] text-brand/50">
                DECREE WORKFLOW
              </p>
              <h1 className="chaotang-title text-xl text-high">朝堂任务</h1>
            </div>
          </div>
        </div>

        <nav
          className="min-h-0 flex-1 overflow-y-auto px-base"
          aria-label="朝堂任务二级导航"
        >
          {COURT_TASK_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                setActiveId(section.id);
                void navigate({ to: '/court', hash: section.id });
              }}
              className={cn(
                'group mb-half flex min-h-12 w-full items-center gap-base border px-base py-base text-left text-sm transition-all',
                section.id === activeSection.id
                  ? 'border-brand/45 bg-brand/10 text-brand'
                  : 'border-transparent text-normal hover:border-brand/20 hover:bg-brand/5 hover:text-high'
              )}
            >
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              <CaretRightIcon className="size-3 opacity-0 group-hover:opacity-70" />
            </button>
          ))}
        </nav>
        <div className="mx-double border-t border-brand/15 pt-base text-xs leading-relaxed text-low">
          LIVE 已覆盖上书房、旨意任务与军机处案卷；其余区域仍为 PREVIEW。
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-primary/[0.12] px-8 pb-10 pt-12">
        <div className="mx-auto max-w-6xl">
          <ChaotangSectionTitle eyebrow="STUDY · DECREE · COUNCIL">
            朝堂任务
          </ChaotangSectionTitle>
          <div className="mb-double mt-base flex items-center justify-between gap-base">
            <p className="text-sm text-low">
              遵循“上书房 → 六部/军机处 → 丞相 → 史馆唯一回奏”的文档主链。
            </p>
            <ShellStatusBadge status={activeSection.status} />
          </div>
          {activeSection.id === 'study' ? (
            <ChancellorStudyWorkspace />
          ) : activeSection.id === 'decree-jobs' ? (
            <DecreeJobsWorkspace />
          ) : activeSection.id === 'junjichu' ? (
            <JunjichuCasesWorkspace />
          ) : (
            <SectionWorkspace section={activeSection} />
          )}
        </div>
      </main>
    </div>
  );
}
