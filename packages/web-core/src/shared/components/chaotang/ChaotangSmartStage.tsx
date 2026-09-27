import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRightIcon,
  ChatCircleTextIcon,
  MicrophoneIcon,
  PaperclipIcon,
  PlusIcon,
  ScrollIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import {
  OUTCOME_CASE_DESTINATION,
  PENDING_OUTCOME_INTENT_KEY,
} from './outcomeCaseHandoff';

interface ChaotangSmartStageProps {
  isAuthenticated: boolean;
  realContent?: ReactNode;
}

interface ChaotangDepartmentHeroProps {
  department: string;
  section: string;
  description: string;
  primaryAction?: string;
  fields: string[];
  isLive: boolean;
}

export function ChaotangDepartmentHero({
  department,
  section,
  description,
  primaryAction,
  fields,
  isLive,
}: ChaotangDepartmentHeroProps) {
  return (
    <div className="mb-double grid gap-base xl:grid-cols-[minmax(0,1fr)_230px]">
      <article className="relative border-x-[10px] border-[#8b6b31] bg-[#eee8d5] px-8 py-7 text-[#282116] shadow-[0_22px_60px_rgba(0,0,0,0.42)]">
        <div className="flex items-center justify-between text-[10px] tracking-[0.14em] text-[#8f6e31]">
          <span>
            {department} · {section}
          </span>
          <span>{isLive ? 'LIVE' : 'PREVIEW'}</span>
        </div>
        <p className="mt-base text-[10px] tracking-[0.14em] text-[#9c4038]">
          一句御断
        </p>
        <h2 className="mt-half font-serif text-2xl font-semibold leading-relaxed">
          {description}
        </h2>
        <div className="mt-double grid gap-px border border-[#a99162]/55 bg-[#a99162]/55 sm:grid-cols-3">
          {fields.slice(0, 3).map((field, index) => (
            <div key={field} className="bg-[#f4efdf] p-base">
              <p className="text-[9px] text-[#9c4038]">
                {index === 0
                  ? '发生了什么'
                  : index === 1
                    ? '与你的关系'
                    : '现在做什么'}
              </p>
              <p className="mt-half text-xs font-medium">{field}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            document
              .getElementById('chaotang-real-workspace')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          className="mx-auto mt-double flex min-w-[260px] items-center justify-center gap-base border border-[#8e6d2f] bg-[#dbc176] px-double py-base text-sm font-semibold text-[#2c2416] hover:bg-[#e6cf8c]"
        >
          {primaryAction ?? `进入${section}`}
          <ArrowRightIcon className="size-4" />
        </button>
      </article>
      <aside className="chaotang-panel p-base">
        <p className="text-[9px] tracking-[0.18em] text-brand/55">结果与边界</p>
        <h3 className="chaotang-title mt-half text-lg text-high">本页交付</h3>
        <ul className="mt-base space-y-base text-xs leading-relaxed text-low">
          {fields.slice(0, 3).map((field) => (
            <li key={field} className="border-b border-brand/10 pb-base">
              {field}
            </li>
          ))}
        </ul>
        <p className="mt-base text-[10px] leading-relaxed text-brand/70">
          {isLive ? '已连接真实领域数据。' : '尚未接入的数据明确保持 PREVIEW。'}
        </p>
      </aside>
    </div>
  );
}

export function ChaotangSmartStage({
  isAuthenticated,
  realContent,
}: ChaotangSmartStageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const startOutcomeCase = (intent: string) => {
    sessionStorage.setItem(PENDING_OUTCOME_INTENT_KEY, intent);
    void navigate(OUTCOME_CASE_DESTINATION);
  };

  return (
    <div className="grid min-h-[470px] gap-base xl:grid-cols-[minmax(0,1fr)_250px]">
      <div className="relative flex min-h-[470px] items-center justify-center overflow-hidden border border-brand/20 bg-primary/10 px-6 py-8">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand/55 to-transparent" />
        <div className="relative w-full max-w-[520px]">
          <div className="mb-base flex items-center justify-between border border-brand/25 bg-[#07100c]/92 px-base py-half text-[10px] text-brand shadow-xl">
            <span className="flex items-center gap-half">
              <ScrollIcon className="size-3.5" /> 御屏 · 当前御断
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded((value) => !value)}
              className="border border-brand/25 px-base py-half text-[9px] text-low hover:text-brand"
            >
              {isExpanded ? '合卷' : '展开'}
            </button>
          </div>

          <article className="chaotang-imperial-scroll relative min-h-[360px] border-x-[10px] border-[#8b6b31] bg-[#eee8d5] px-10 py-9 text-[#252017] shadow-[0_25px_70px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-y-0 left-0 w-px bg-[#b8493e]/45" />
            <p className="text-xs tracking-[0.16em] text-[#9c4038]">
              朝堂如何办事
            </p>
            <h2 className="mt-base max-w-[330px] font-serif text-2xl font-semibold leading-[1.45] text-[#282116]">
              先选结果，再由丞相组织朝臣办理
            </h2>
            <div className="my-6 h-px bg-gradient-to-r from-[#9d7c3d]/65 to-transparent" />
            <p className="text-xs tracking-[0.14em] text-[#9c4038]">办事准则</p>
            <p className="mt-base font-serif text-3xl font-semibold leading-[1.5] text-[#241e15]">
              先把目标讲清，再按授权一步步办成。
            </p>
            <p className="mt-base text-sm leading-relaxed text-[#655943]">
              选择下方案例，会把可编辑的办事提纲带到上书房。丞相先复述确认；未经你正式下旨，不会创建真实任务。
            </p>
            <button
              type="button"
              onClick={() =>
                startOutcomeCase(
                  '请帮我把一个想法整理成可执行方案：先向我确认目标、范围和限制，再列出负责部门、交付物、风险与验收标准。此处是可编辑草稿，请先商议，不要直接下旨。'
                )
              }
              className="mt-7 flex w-full items-center justify-between border border-[#8e6d2f] bg-[#302718] px-base py-base text-sm text-[#ead79d] transition-colors hover:bg-[#40331f]"
            >
              <span>从上书房开始商议</span>
              <ArrowRightIcon className="size-4" />
            </button>
          </article>

          {isExpanded && (
            <div className="mt-base border border-brand/25 bg-[#07100c]/95 p-base shadow-2xl">
              {isAuthenticated && realContent ? (
                realContent
              ) : (
                <div className="flex items-start gap-base text-sm leading-relaxed text-low">
                  <SparkleIcon className="mt-half size-4 shrink-0 text-brand" />
                  <p>
                    当前尚未登录。你仍可浏览完整界面；需要读取个人回奏或创建真实任务时，再从左下角账户入口登录。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-base">
        <div className="chaotang-panel p-base">
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            成果案例 · 草稿
          </p>
          <h3 className="chaotang-title mt-half text-xl text-high">
            先看能办成什么
          </h3>
          <div className="mt-base border-l-2 border-brand/55 bg-primary/40 p-base">
            <p className="text-[10px] text-brand">丞相办事原则</p>
            <p className="mt-half text-sm font-medium leading-relaxed text-high">
              案例只提供起步提纲；真实任务由你确认下旨后才会创建。
            </p>
          </div>
          <div className="mt-base space-y-half">
            {[
              {
                title: '开源项目接入评估',
                detail: '得到来源、许可证、维护与接入风险清单',
                intent:
                  '请评估这个开源项目是否值得接入朝堂。我会提供项目链接。请核实来源、许可证、维护状态、运行要求、接入成本与风险，并说明哪些信息尚未核实。先商议并确认方案，不要直接下旨。',
              },
              {
                title: '预算与方案比较',
                detail: '得到假设透明的成本比较和建议',
                intent:
                  '请根据我提供的预算或成本资料，比较方案、列明计算口径与假设、指出数据缺口和风险，并给出建议。资料不足时先询问，不要编造数字。先商议并确认方案，不要直接下旨。',
              },
              {
                title: '产品想法变实施计划',
                detail: '得到阶段、负责人、验收标准和回退方案',
                intent:
                  '请把我的产品想法整理为可执行计划，先确认用户和目标，再提出阶段、负责部门、交付物、验收标准、风险与回退方案。先商议并确认方案，不要直接下旨。',
              },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => startOutcomeCase(item.intent)}
                className="flex w-full items-center justify-between gap-base border border-brand/15 bg-primary/20 px-base py-base text-left hover:border-brand/35 hover:bg-brand/5"
              >
                <span>
                  <span className="block text-xs font-medium text-normal">
                    {item.title}
                  </span>
                  <span className="mt-half block text-[10px] leading-relaxed text-low">
                    {item.detail}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-brand">
                  开始商议 →
                </span>
              </button>
            ))}
          </div>
          <p className="mt-base text-[10px] leading-relaxed text-low">
            案例是可编辑的需求提纲，不代表已有调查、分析或部门执行结果。
          </p>
        </div>
        <div className="chaotang-panel p-base">
          <p className="text-[9px] tracking-[0.2em] text-brand/55">数据边界</p>
          <p className="mt-base text-xs leading-relaxed text-low">
            当前界面已接入客户端壳；账户与领域数据按真实连接状态展示，未接入内容保持
            PREVIEW。
          </p>
        </div>
      </aside>
    </div>
  );
}

export function ChaotangConversationDock() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  return (
    <div className="chaotang-conversation-dock absolute bottom-0 left-0 right-0 z-30 border-t border-brand/30 bg-[#050a08]/96 px-double pb-base pt-base shadow-[0_-20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="mx-auto max-w-[1380px]">
        <div className="mb-half flex items-center justify-between text-[10px] text-low">
          <span className="flex items-center gap-half text-normal">
            <ChatCircleTextIcon className="size-3.5 text-brand" />
            正在与丞相商议 · 跟随页面推荐
          </span>
          <span>任务护照 · 当前议题</span>
        </div>
        <div className="flex items-stretch gap-half">
          <button
            type="button"
            aria-label="更多能力"
            title="更多能力入口暂未开放"
            disabled
            className="flex w-10 cursor-not-allowed items-center justify-center border border-brand/15 text-low/50"
          >
            <PlusIcon className="size-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center border border-brand/30 bg-primary/75">
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="告诉朝堂你想得到什么结果、最担心什么……"
              className="min-w-0 flex-1 bg-transparent px-base py-base text-sm text-normal outline-none placeholder:text-low"
            />
            <button
              type="button"
              aria-label="添加材料"
              title="材料上传暂未接入"
              disabled
              className="cursor-not-allowed px-base text-low/45"
            >
              <PaperclipIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label="语音输入"
              title="语音输入暂未接入"
              disabled
              className="cursor-not-allowed px-base text-low/45"
            >
              <MicrophoneIcon className="size-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => {
              if (!value.trim()) return;
              sessionStorage.setItem(PENDING_OUTCOME_INTENT_KEY, value.trim());
              void navigate(OUTCOME_CASE_DESTINATION);
            }}
            title={
              value.trim()
                ? '把议题带到上书房，与丞相商议'
                : '请输入想办成的结果'
            }
            className={cn(
              'w-20 border text-sm transition-colors',
              value.trim()
                ? 'border-brand/50 bg-brand/10 text-brand hover:bg-brand/20'
                : 'border-brand/15 text-low/50'
            )}
          >
            去上书房
          </button>
        </div>
      </div>
    </div>
  );
}
