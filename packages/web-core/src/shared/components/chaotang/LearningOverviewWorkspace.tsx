import {
  ArrowRightIcon,
  BookOpenTextIcon,
  BrainIcon,
  FlaskIcon,
  GitBranchIcon,
  ScrollIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useChaotangConnectors } from '@/shared/hooks/chaotang/useConnectors';
import { useShiguanStatistics } from '@/shared/hooks/chaotang/useShiguan';
import { useChaotangSkills } from '@/shared/hooks/chaotang/useSkills';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';

type LearningSection =
  | 'archives'
  | 'recall'
  | 'archive-review'
  | 'outcomes'
  | 'hanlin'
  | 'knowledge-sources';

export function LearningOverviewWorkspace({
  onNavigate,
}: {
  onNavigate: (section: LearningSection) => void;
}) {
  const { user, health } = useChaotangProvider();
  const statistics = useShiguanStatistics();
  const skills = useChaotangSkills();
  const connectors = useChaotangConnectors();

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '学习事实源未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          学习总览只读取当前账户的史馆、RuntimeSkill 与受控来源目录。
        </p>
      </ChaotangPanel>
    );
  }

  if (statistics.isPending || skills.isPending || connectors.isPending) {
    return (
      <div className="h-[560px] animate-pulse border border-brand/15 bg-panel/60" />
    );
  }

  if (statistics.isError || skills.isError || connectors.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {statistics.error?.message ??
          skills.error?.message ??
          connectors.error?.message}
      </ChaotangPanel>
    );
  }

  const reviewed = Math.max(
    0,
    statistics.data.total - statistics.data.pendingReview
  );
  const learningPath = [
    {
      title: '史馆留存',
      description: '读取正式奏折、回奏、证据引用与历史结论。',
      value: statistics.data.total,
      unit: '份档案',
      status: 'LIVE',
      icon: ScrollIcon,
      section: 'archives' as const,
    },
    {
      title: '复盘处置',
      description: '把复盘状态、备注和不可变处置决定留痕。',
      value: reviewed,
      unit: '份已复盘',
      status: 'LIVE',
      icon: BookOpenTextIcon,
      section: 'archive-review' as const,
    },
    {
      title: 'Outcome 结果账',
      description: '区分执行、归档、确认与真实结果达成。',
      value: '—',
      unit: '等待权威事件账',
      status: 'PLANNED',
      icon: GitBranchIcon,
      section: 'outcomes' as const,
    },
    {
      title: '翰林评测',
      description: '基于真实 Outcome 评测能力，不自动晋级生产。',
      value: skills.data.enabledCount,
      unit: '项启用能力',
      status: 'PLANNED',
      icon: FlaskIcon,
      section: 'hanlin' as const,
    },
  ];

  return (
    <div className="space-y-double">
      <ChaotangPanel className="relative overflow-hidden p-double">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(194,155,76,0.2),transparent_68%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-double">
          <div className="flex items-start gap-base">
            <div className="border border-brand/35 bg-brand/10 p-base text-brand">
              <BrainIcon className="size-7" weight="duotone" />
            </div>
            <div>
              <p className="text-[9px] tracking-[0.28em] text-brand/60">
                SHIGUAN · HANLIN LEARNING LOOP
              </p>
              <h1 className="chaotang-title mt-half text-2xl text-high">
                学习成长中心
              </h1>
              <p className="mt-base max-w-2xl text-sm leading-relaxed text-low">
                从真实事项中留存经验，经人工复盘、结果验证与能力评测形成可追溯学习；不以浏览量、虚构积分或模型自评代替成长。
              </p>
            </div>
          </div>
          <div className="min-w-[260px] border border-brand/20 bg-primary/35 p-base">
            <div className="flex items-center gap-half text-success">
              <ShieldCheckIcon className="size-4" weight="duotone" />
              <span className="text-xs">当前事实源已连接</span>
            </div>
            <div className="mt-base grid grid-cols-2 gap-base text-xs">
              <p className="text-low">
                史馆档案{' '}
                <span className="float-right text-high">
                  {statistics.data.total}
                </span>
              </p>
              <p className="text-low">
                待复盘{' '}
                <span className="float-right text-brand">
                  {statistics.data.pendingReview}
                </span>
              </p>
              <p className="text-low">
                Skills{' '}
                <span className="float-right text-high">
                  {skills.data.total}
                </span>
              </p>
              <p className="text-low">
                受控来源{' '}
                <span className="float-right text-high">
                  {connectors.data.total}
                </span>
              </p>
            </div>
          </div>
        </div>
      </ChaotangPanel>

      <div className="grid gap-base xl:grid-cols-4">
        {learningPath.map(({ icon: Icon, ...item }, index) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onNavigate(item.section)}
            className="group relative border border-brand/18 bg-secondary/80 p-double text-left transition-colors hover:border-brand/45 hover:bg-secondary"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] tracking-[0.16em] text-brand/55">
                {String(index + 1).padStart(2, '0')} · {item.status}
              </span>
              <Icon className="size-5 text-brand" weight="duotone" />
            </div>
            <h2 className="chaotang-title mt-double text-lg text-high">
              {item.title}
            </h2>
            <p className="mt-base min-h-12 text-xs leading-relaxed text-low">
              {item.description}
            </p>
            <div className="mt-double border-t border-brand/15 pt-base">
              <span className="chaotang-title text-2xl text-brand">
                {item.value}
              </span>
              <span className="ml-half text-[9px] text-low">{item.unit}</span>
              <ArrowRightIcon className="float-right mt-half size-4 text-brand opacity-60 transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-double xl:grid-cols-[1.25fr_0.75fr]">
        <section className="border border-[#bda65d]/55 bg-[#e9e2cc] p-1 text-[#272116] shadow-[0_20px_65px_rgba(0,0,0,0.32)]">
          <div className="h-full border border-[#9b8140]/35 bg-[linear-gradient(135deg,#eee9d9,#dcd3bb)] p-double sm:p-8">
            <p className="text-[9px] tracking-[0.22em] text-[#8f6f2a]">
              TODAY'S LEARNING VERDICT
            </p>
            <h2 className="chaotang-title mt-base text-2xl text-[#272116]">
              今日学习判断
            </h2>
            <p className="mt-double text-sm leading-7 text-[#514735]">
              {statistics.data.pendingReview > 0
                ? `当前有 ${statistics.data.pendingReview} 份档案等待人工复盘。先确认实际结果与所得经验，再进入能力评测。`
                : statistics.data.total > 0
                  ? '当前没有待复盘档案。可从相似旧案召回中检索既有经验，避免重复试错。'
                  : '当前账户尚无正式档案。完成真实事项并形成回奏后，学习闭环才会开始。'}
            </p>
            <div className="mt-double flex flex-wrap gap-half">
              <button
                type="button"
                onClick={() => onNavigate('archive-review')}
                className="border border-[#8f6f2a]/45 bg-[#8f6f2a]/10 px-base py-half text-xs text-[#5e491f]"
              >
                进入复盘
              </button>
              <button
                type="button"
                onClick={() => onNavigate('recall')}
                className="border border-[#8f6f2a]/30 px-base py-half text-xs text-[#5e491f]"
              >
                召回旧案
              </button>
            </div>
          </div>
        </section>

        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-lg text-high">真实性边界</h2>
          <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
            <li>归档不等于 Outcome 已达成。</li>
            <li>用户确认不等于能力已经提升。</li>
            <li>没有权威 Outcome 时，翰林必须显示 NO_DATA。</li>
            <li>连接器存在不代表知识来源已经同步。</li>
            <li>评测只能给建议，不能自动晋级或发布。</li>
          </ul>
          <button
            type="button"
            onClick={() => onNavigate('knowledge-sources')}
            className="mt-double inline-flex items-center gap-half border border-brand/25 px-base py-half text-xs text-brand hover:bg-brand/10"
          >
            查看知识来源治理 <ArrowRightIcon className="size-4" />
          </button>
        </ChaotangPanel>
      </div>
    </div>
  );
}
