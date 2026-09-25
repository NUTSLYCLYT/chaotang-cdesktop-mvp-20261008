import {
  ArrowRightIcon,
  FingerprintIcon,
  PaintBrushIcon,
  PlugsConnectedIcon,
  CpuIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { useAuditTrail } from '@/shared/hooks/chaotang/useAuditTrail';
import { useChaotangConnectors } from '@/shared/hooks/chaotang/useConnectors';
import { useJinyiweiSummary } from '@/shared/hooks/chaotang/useJinyiwei';
import { useChaotangMcpCatalog } from '@/shared/hooks/chaotang/useMcp';
import { useChaotangSkills } from '@/shared/hooks/chaotang/useSkills';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';

type GovernanceSection =
  | 'zhuanshu'
  | 'jinyiwei'
  | 'skills'
  | 'mcp'
  | 'connectors'
  | 'model-providers'
  | 'audit'
  | 'appearance';

export function GovernanceOverviewWorkspace({
  onNavigate,
}: {
  onNavigate: (section: GovernanceSection) => void;
}) {
  const { user, health } = useChaotangProvider();
  const investigations = useJinyiweiSummary();
  const skills = useChaotangSkills();
  const mcp = useChaotangMcpCatalog();
  const connectors = useChaotangConnectors();
  const audit = useAuditTrail();

  const loading = [investigations, skills, mcp, connectors, audit].some(
    (query) => query.isPending
  );
  const firstError = [investigations, skills, mcp, connectors, audit].find(
    (query) => query.isError
  )?.error;

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请从左下角账户入口登录' : '系统治理服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          治理总览需要账户认证，但不会读取或展示任何凭据。
        </p>
      </ChaotangPanel>
    );
  }
  if (loading) {
    return (
      <div className="h-[560px] animate-pulse border border-brand/15 bg-panel/60" />
    );
  }
  if (
    firstError ||
    !investigations.data ||
    !skills.data ||
    !mcp.data ||
    !connectors.data ||
    !audit.data
  ) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {firstError?.message ?? '治理数据读取失败'}
      </ChaotangPanel>
    );
  }

  const cards = [
    {
      section: 'jinyiwei' as const,
      title: '锦衣卫',
      value: investigations.data.totalInvestigations,
      unit: '份调查',
      description: '只读、失败关闭的独立证据域。',
      icon: ShieldCheckIcon,
    },
    {
      section: 'skills' as const,
      title: 'Skills',
      value: skills.data.enabledCount,
      unit: '项启用',
      description: '后端权威能力注册表，不在页面执行。',
      icon: WrenchIcon,
    },
    {
      section: 'mcp' as const,
      title: 'MCP',
      value: mcp.data.enabledToolCount,
      unit: '项批准工具',
      description: '配置允许不等于已调用或网络健康。',
      icon: PlugsConnectedIcon,
    },
    {
      section: 'connectors' as const,
      title: '数据连接器',
      value: connectors.data.enabledCount,
      unit: '项启用配置',
      description: '按需读取，不在后台擅自同步。',
      icon: PlugsConnectedIcon,
    },
    {
      section: 'model-providers' as const,
      title: '模型服务',
      value: 'GPT / DeepSeek',
      unit: '统一接入',
      description: '配置模型、密钥状态与 Agent 路由。',
      icon: CpuIcon,
    },
    {
      section: 'audit' as const,
      title: '审计记录',
      value: audit.data.length,
      unit: '条可见事件',
      description: '当前账户的调查与成果只读血缘。',
      icon: FingerprintIcon,
    },
    {
      section: 'appearance' as const,
      title: '外观设置',
      value: '本机',
      unit: '独立保存',
      description: '背景、色调与动态效果只保存在客户端。',
      icon: PaintBrushIcon,
    },
  ];

  return (
    <div className="space-y-double">
      <ChaotangPanel className="relative overflow-hidden p-double">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(194,155,76,0.2),transparent_68%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-double">
          <div className="flex items-start gap-base">
            <div className="border border-brand/35 bg-brand/10 p-base text-brand">
              <ShieldCheckIcon className="size-7" weight="duotone" />
            </div>
            <div>
              <p className="text-[9px] tracking-[0.28em] text-brand/60">
                EXTENSIONS · GOVERNANCE
              </p>
              <h1 className="chaotang-title mt-half text-2xl text-high">
                系统治理中心
              </h1>
              <p className="mt-base max-w-2xl text-sm leading-relaxed text-low">
                集中查看受控能力、数据来源和审计边界。目录展示“允许什么”，不代表已经执行、联网或获得业务授权。
              </p>
            </div>
          </div>
          <div className="min-w-[260px] border border-brand/20 bg-primary/35 p-base">
            <div className="flex items-center gap-base">
              <UserCircleIcon className="size-6 text-brand" weight="duotone" />
              <div>
                <p className="text-[9px] text-low">当前账户</p>
                <p className="mt-half text-sm text-high">{user.username}</p>
              </div>
              <span className="ml-auto text-[9px] text-success">已认证</span>
            </div>
            <div className="mt-base border-t border-brand/15 pt-base text-[10px] text-low">
              服务 v{health.version} · 凭据不进入 WebView
            </div>
          </div>
        </div>
      </ChaotangPanel>

      <div className="grid gap-base md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ icon: Icon, ...card }) => (
          <button
            key={card.section}
            type="button"
            onClick={() => onNavigate(card.section)}
            className="group border border-brand/18 bg-secondary/80 p-double text-left transition-colors hover:border-brand/45 hover:bg-secondary"
          >
            <div className="flex items-center justify-between">
              <Icon className="size-5 text-brand" weight="duotone" />
              <span className="text-[9px] text-success">LIVE · READ ONLY</span>
            </div>
            <h2 className="chaotang-title mt-base text-lg text-high">
              {card.title}
            </h2>
            <p className="mt-half text-xs leading-relaxed text-low">
              {card.description}
            </p>
            <div className="mt-double border-t border-brand/15 pt-base">
              <span className="chaotang-title text-2xl text-brand">
                {card.value}
              </span>
              <span className="ml-half text-[9px] text-low">{card.unit}</span>
              <ArrowRightIcon className="float-right mt-half size-4 text-brand transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-double xl:grid-cols-[1.2fr_0.8fr]">
        <section className="border border-[#bda65d]/55 bg-[#e9e2cc] p-1 text-[#272116] shadow-[0_20px_65px_rgba(0,0,0,0.32)]">
          <div className="h-full border border-[#9b8140]/35 bg-[linear-gradient(135deg,#eee9d9,#dcd3bb)] p-double sm:p-8">
            <p className="text-[9px] tracking-[0.22em] text-[#8f6f2a]">
              GOVERNANCE VERDICT
            </p>
            <h2 className="chaotang-title mt-base text-2xl">当前治理判断</h2>
            <p className="mt-double text-sm leading-7 text-[#514735]">
              当前登记 {skills.data.total} 项 RuntimeSkill、
              {mcp.data.serverCount} 个 MCP Server、{connectors.data.total}{' '}
              个数据连接器。所有目录页保持零调用；真正执行仍需进入正式任务并经过权限检查。
            </p>
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="mt-double inline-flex items-center gap-half border border-[#8f6f2a]/45 bg-[#8f6f2a]/10 px-base py-half text-xs text-[#5e491f]"
            >
              查看审计血缘 <ArrowRightIcon className="size-4" />
            </button>
          </div>
        </section>
        <ChaotangPanel className="p-double">
          <h2 className="chaotang-title text-lg text-high">不可混淆</h2>
          <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
            <li>已启用 ≠ 已调用。</li>
            <li>连接器登记 ≠ 凭据有效或已经同步。</li>
            <li>MCP 可见 ≠ 获得业务写入授权。</li>
            <li>审计投影 ≠ 完整跨系统审计账。</li>
            <li>账户状态只在此展示，登录入口仍位于左下角。</li>
          </ul>
          <button
            type="button"
            onClick={() => onNavigate('zhuanshu')}
            className="mt-double border border-brand/25 px-base py-half text-xs text-brand hover:bg-brand/10"
          >
            查看专署目录
          </button>
        </ChaotangPanel>
      </div>
    </div>
  );
}
