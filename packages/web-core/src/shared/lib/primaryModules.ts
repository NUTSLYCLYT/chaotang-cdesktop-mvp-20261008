import {
  BookOpenIcon,
  CalendarIcon,
  ChartLineUpIcon,
  FolderIcon,
  HeartIcon,
  SquaresFourIcon,
  WalletIcon,
  type Icon,
} from '@phosphor-icons/react';

export type PrimaryModuleId =
  | 'today'
  | 'forecast'
  | 'projects'
  | 'learning'
  | 'wealth'
  | 'life'
  | 'more';

export interface PrimaryModuleDefinition {
  id: PrimaryModuleId;
  label: string;
  route: string;
  icon: Icon;
  status: 'available' | 'partial' | 'planned';
  description: string;
}

export const PRIMARY_MODULES: PrimaryModuleDefinition[] = [
  {
    id: 'today',
    label: '今日',
    route: '/today',
    icon: CalendarIcon,
    status: 'partial',
    description: '聚合今天需要关注、处理和复盘的事项。',
  },
  {
    id: 'forecast',
    label: '预测',
    route: '/forecast',
    icon: ChartLineUpIcon,
    status: 'planned',
    description: '承载钦天监预测、触发器、证据和人工复核。',
  },
  {
    id: 'projects',
    label: '项目',
    route: '/workspaces',
    icon: FolderIcon,
    status: 'available',
    description: 'Codex 会话、代码、Git、终端和定时任务。',
  },
  {
    id: 'learning',
    label: '学习',
    route: '/learning',
    icon: BookOpenIcon,
    status: 'planned',
    description: '承载史馆档案、翰林评测、知识和可追溯记忆。',
  },
  {
    id: 'wealth',
    label: '财富',
    route: '/wealth',
    icon: WalletIcon,
    status: 'planned',
    description: '承载户部、会计报告、成果文件和成本分析。',
  },
  {
    id: 'life',
    label: '生活',
    route: '/life',
    icon: HeartIcon,
    status: 'planned',
    description: '个人日程、提醒、笔记和生活 Agent 的扩展入口。',
  },
  {
    id: 'more',
    label: '更多',
    route: '/more',
    icon: SquaresFourIcon,
    status: 'partial',
    description: '插件、Skills、MCP、连接器、账户和设置。',
  },
];

export function getPrimaryModuleForPath(
  pathname: string
): PrimaryModuleDefinition {
  if (
    pathname.startsWith('/workspaces') ||
    pathname.startsWith('/court') ||
    pathname.startsWith('/routines') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/hosts')
  ) {
    return PRIMARY_MODULES.find((module) => module.id === 'projects')!;
  }

  return (
    PRIMARY_MODULES.find(
      (module) => module.id !== 'projects' && pathname.startsWith(module.route)
    ) ?? PRIMARY_MODULES[0]
  );
}
