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
            <p className="text-xs tracking-[0.16em] text-[#9c4038]">你将得到</p>
            <h2 className="mt-base max-w-[330px] font-serif text-2xl font-semibold leading-[1.45] text-[#282116]">
              一项今天可以立即推进的决定
            </h2>
            <div className="my-6 h-px bg-gradient-to-r from-[#9d7c3d]/65 to-transparent" />
            <p className="text-xs tracking-[0.14em] text-[#9c4038]">丞相建议</p>
            <p className="mt-base font-serif text-3xl font-semibold leading-[1.5] text-[#241e15]">
              今天只需要决定一件真正影响结果的事。
            </p>
            <p className="mt-base text-sm leading-relaxed text-[#655943]">
              朝堂会先复述你的目标，再给出唯一行动和必要证据；没有真实材料时不会伪造判断。
            </p>
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="mt-7 flex w-full items-center justify-between border border-[#8e6d2f] bg-[#302718] px-base py-base text-sm text-[#ead79d] transition-colors hover:bg-[#40331f]"
            >
              <span>丞相复述今日主问题</span>
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
          <p className="text-[9px] tracking-[0.2em] text-brand/55">今日朝报</p>
          <h3 className="chaotang-title mt-half text-xl text-high">值得关注</h3>
          <div className="mt-base border-l-2 border-brand/55 bg-primary/40 p-base">
            <p className="text-[10px] text-brand">丞相建议</p>
            <p className="mt-half text-sm font-medium leading-relaxed text-high">
              今天只需要决定一件真正影响结果的事。
            </p>
          </div>
          <div className="mt-base divide-y divide-brand/10 border border-brand/15">
            {[
              '项目 · 等待老板方向',
              '预测 · 条件发生变化',
              '情报 · 原料尚未核验',
            ].map((item) => (
              <button
                key={item}
                type="button"
                className="flex w-full items-center justify-between px-base py-base text-left text-xs text-normal hover:bg-brand/5 hover:text-brand"
              >
                {item}
                <ArrowRightIcon className="size-3 text-brand" />
              </button>
            ))}
          </div>
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
            className="flex w-10 items-center justify-center border border-brand/25 text-brand hover:bg-brand/10"
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
              className="px-base text-low hover:text-brand"
            >
              <PaperclipIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label="语音输入"
              className="px-base text-low hover:text-brand"
            >
              <MicrophoneIcon className="size-4" />
            </button>
          </div>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={() => {
              if (!value.trim()) return;
              sessionStorage.setItem('chaotang.pending-intent', value.trim());
              void navigate({ to: '/workspaces' });
            }}
            title={
              value.trim() ? '进入项目中枢选择工作目录并办理' : '请输入内容'
            }
            className={cn(
              'w-20 border text-sm transition-colors',
              value.trim()
                ? 'border-brand/50 bg-brand/10 text-brand hover:bg-brand/20'
                : 'border-brand/15 text-low/50'
            )}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
