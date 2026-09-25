import { useState } from 'react';
import {
  CaretLeftIcon,
  CaretRightIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useLocation } from '@tanstack/react-router';
import { getPrimaryModuleForPath } from '@/shared/lib/primaryModules';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';

const ADVICE: Record<string, { title: string; next: string; watch: string[] }> =
  {
    today: {
      title: '先确认今天唯一需要决定的事',
      next: '查看真实奏报与待处理事项',
      watch: ['每日奏报状态', '进行中的旨意任务'],
    },
    forecast: {
      title: '先写清问题和复核时间',
      next: '创建一项可验证的正式推演',
      watch: ['关键假设', '待验证触发器'],
    },
    projects: {
      title: '围绕一个真实任务继续推进',
      next: '从上书房拟旨或查看现有案卷',
      watch: ['当前阻塞', '最终回奏'],
    },
    learning: {
      title: '从真实结果中形成复盘',
      next: '进入史馆查看可追溯档案',
      watch: ['结果证据', '待复盘事项'],
    },
    wealth: {
      title: '先守住现金安全边界',
      next: '形成一份可确认的户部成果',
      watch: ['现金安全', '人工确认'],
    },
    life: {
      title: '生活域尚未连接真实数据',
      next: '先明确数据、隐私与授权边界',
      watch: ['数据位置', '通知权限'],
    },
    more: {
      title: '按实际结果选择能力',
      next: '查看 Skills、MCP 与连接器状态',
      watch: ['启用状态', '权限范围'],
    },
  };

export function ChaotangDecisionRail() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const module = getPrimaryModuleForPath(location.pathname);
  const { health, error, isChecking } = useChaotangProvider();
  const advice = ADVICE[module.id];

  return (
    <aside className="absolute right-0 top-11 z-30 flex h-[calc(100%-2.75rem)] items-start">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-double flex h-12 w-7 items-center justify-center border border-r-0 border-brand/25 bg-secondary/90 text-brand"
        aria-label={open ? '收起决策栏' : '展开决策栏'}
      >
        {open ? <CaretRightIcon /> : <CaretLeftIcon />}
      </button>
      {open && (
        <div className="chaotang-grain h-full w-[300px] overflow-y-auto border-l border-brand/25 bg-secondary/95 p-double pt-6 backdrop-blur-xl">
          <p className="text-[9px] tracking-[0.2em] text-brand/55">
            DECISION & BOUNDARY
          </p>
          <h2 className="chaotang-title mt-half text-xl text-high">
            建议与边界
          </h2>
          <section className="mt-double border border-brand/20 bg-primary/40 p-base">
            <p className="text-[10px] text-brand">当前建议</p>
            <p className="mt-base text-sm leading-7 text-high">
              {advice.title}
            </p>
            <p className="mt-base text-xs leading-relaxed text-low">
              下一步：{advice.next}
            </p>
          </section>
          <section className="mt-base border border-brand/15 bg-primary/35 p-base">
            <p className="text-[10px] text-brand">值得关注</p>
            <ul className="mt-base space-y-base text-xs text-normal">
              {advice.watch.slice(0, 3).map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </section>
          <section className="mt-base border border-brand/15 bg-primary/35 p-base">
            <div className="flex items-center gap-half text-[10px] text-brand">
              <ShieldCheckIcon className="size-4" />
              真实性
            </div>
            <p className="mt-base text-xs text-normal">
              {health ? '后端已连接' : '后端未连接'}
            </p>
            <p className="mt-half text-xs text-low">
              {isChecking
                ? '正在检查服务状态'
                : error
                  ? `异常：${error}`
                  : '业务能力状态以各页面真实接口为准'}
            </p>
          </section>
          <section className="chaotang-custom-only mt-base border border-brand/15 p-base text-xs text-low">
            定制版将继续展示 Provider、权限、版本、日志与能力目录。
          </section>
        </div>
      )}
    </aside>
  );
}
