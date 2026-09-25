import type { PrimaryModuleId } from '@/shared/lib/primaryModules';

export type ShellCapabilityStatus =
  | 'live'
  | 'preview'
  | 'planned'
  | 'unavailable';

export interface ChaotangShellSection {
  id: string;
  label: string;
  documentName?: string;
  description: string;
  status: ShellCapabilityStatus;
  fields: string[];
  actions: string[];
}

export interface ChaotangModuleShell {
  moduleId: Exclude<PrimaryModuleId, 'projects'>;
  officialDomainName: string;
  eyebrow: string;
  description: string;
  sections: ChaotangShellSection[];
}

export const CHAOTANG_MODULE_SHELLS: Record<
  ChaotangModuleShell['moduleId'],
  ChaotangModuleShell
> = {
  today: {
    moduleId: 'today',
    officialDomainName: '大殿',
    eyebrow: 'DADIAN OVERVIEW',
    description: '汇总今日要务、真实回奏、待复盘事项与系统状态。',
    sections: [
      {
        id: 'dadian-overview',
        label: '大殿总览',
        documentName: '/dadian',
        description: '史馆事实在今日总控中的只读投影。',
        status: 'live',
        fields: ['今日要务', '回奏指标', '部门参与', '最近回奏'],
        actions: ['查看回奏', '进入史馆'],
      },
      {
        id: 'decree-jobs',
        label: '旨意任务',
        description: '展示正式下旨后的持久化异步任务状态。',
        status: 'live',
        fields: ['Job ID', 'state', 'stage', 'attempt count', '时间'],
        actions: ['查看任务', '请求取消'],
      },
      {
        id: 'daily-memorial',
        label: '每日奏报',
        description: '显示最新待审草稿、事实快照与用户确认记录。',
        status: 'live',
        fields: ['事实快照', '草稿状态', '生成时间', '确认状态'],
        actions: ['审阅草稿', '确认奏报'],
      },
      {
        id: 'pending-review',
        label: '待复盘',
        description: '需要用户复盘、备注或处置的史馆档案。',
        status: 'live',
        fields: ['档案类型', '来源状态', '复盘状态', '处置决定'],
        actions: ['开始复盘', '记录处置'],
      },
      {
        id: 'readiness',
        label: '系统就绪状态',
        documentName: '/readyz',
        description: '投影数据布局、配置、后台 worker 与连接器健康。',
        status: 'live',
        fields: ['服务健康', '数据布局', 'Worker', 'Provider', 'MCP'],
        actions: ['重新检查', '查看诊断'],
      },
    ],
  },
  forecast: {
    moduleId: 'forecast',
    officialDomainName: '钦天监',
    eyebrow: 'QINTIANJIAN',
    description: '提供即时问策、正式推演、触发验证和人工复核。',
    sections: [
      {
        id: 'forecast-overview',
        label: '钦天监总览',
        description: '汇总正式推演、待验证触发器和近期人工复核。',
        status: 'live',
        fields: ['推演数量', '待验证触发器', '待复核', '最近结算'],
        actions: ['创建正式推演', '进入即时问策'],
      },
      {
        id: 'consult',
        label: '即时问策',
        description: '非持久化的决策辅助，不产生旨意或外部动作。',
        status: 'live',
        fields: ['问题', '上下文', '即时分析', '非持久化标记'],
        actions: ['发起问策'],
      },
      {
        id: 'forecasts',
        label: '正式推演',
        description: '围绕 DECREE、DRAFT 或 REPLY 保存三情景推演。',
        status: 'live',
        fields: ['乐观情景', '基准情景', '悲观情景', '假设', '证据引用'],
        actions: ['创建推演', '查看详情'],
      },
      {
        id: 'triggers',
        label: '待验证触发器',
        description: '展示可证伪条件、复核时间与当前验证状态。',
        status: 'live',
        fields: ['触发条件', 'review_at', '证据', '验证状态'],
        actions: ['开始验证'],
      },
      {
        id: 'reviews',
        label: '人工复核',
        description: '保留 KEEP、INVALIDATE、REQUEST_RERUN 与升级丞相。',
        status: 'live',
        fields: ['复核人', '复核决定', '理由', '时间'],
        actions: ['提交复核'],
      },
      {
        id: 'calibration',
        label: '回测与校准',
        description: '基于 Outcome 的结算、Brier Score 与校准记录。',
        status: 'planned',
        fields: ['冻结信息集', 'Outcome', 'Brier Score', '校准版本'],
        actions: ['查看回测'],
      },
    ],
  },
  learning: {
    moduleId: 'learning',
    officialDomainName: '史馆与翰林院',
    eyebrow: 'SHIGUAN · HANLIN',
    description: '保存唯一回奏、证据、复盘、Outcome 与评测投影。',
    sections: [
      {
        id: 'learning-overview',
        label: '学习总览',
        description: '汇总史馆留存、复盘、Outcome 与翰林评测的真实进度。',
        status: 'live',
        fields: ['史馆档案', '待复盘', 'RuntimeSkill', '受控知识来源'],
        actions: ['进入复盘', '召回旧案'],
      },
      {
        id: 'archives',
        label: '史馆档案',
        description: '只包含 MEMORIAL 与 REPLY 两类正式档案。',
        status: 'live',
        fields: ['档案类型', 'source_text', '来源状态', '证据引用'],
        actions: ['查看档案', '筛选档案'],
      },
      {
        id: 'recall',
        label: '相似旧案召回',
        description: '按当前 owner 召回相似历史档案，作为只读上下文。',
        status: 'live',
        fields: ['相似度', '旧案摘要', '来源', '召回时间'],
        actions: ['发起召回'],
      },
      {
        id: 'archive-review',
        label: '复盘与处置',
        description: '记录 review 状态、备注和档案处置决定。',
        status: 'live',
        fields: ['复盘状态', '复盘备注', '处置决定', '操作时间'],
        actions: ['记录复盘', '更新处置'],
      },
      {
        id: 'outcomes',
        label: 'Outcome 结果账',
        description: '区分执行完成、归档、用户确认和实际结果达成。',
        status: 'live',
        fields: ['OBSERVING', 'ACHIEVED', 'NOT_ACHIEVED', 'PARTIAL'],
        actions: ['记录 Outcome', '查看时间线'],
      },
      {
        id: 'hanlin',
        label: '翰林评测',
        description: '展示 overview、experiments 与只读评测结果。',
        status: 'live',
        fields: ['实验', '评测状态', '能力表现', '证据'],
        actions: ['查看实验'],
      },
      {
        id: 'knowledge-sources',
        label: '知识来源',
        description: '采用 Source → Version → Chunk → Span → Citation。',
        status: 'planned',
        fields: ['Source', 'Version', 'Chunk', 'Citation', '撤回状态'],
        actions: ['查看来源', '撤回来源'],
      },
    ],
  },
  wealth: {
    moduleId: 'wealth',
    officialDomainName: '户部',
    eyebrow: 'HUBU',
    description: '承载现金安全、会计管理报告、WorkProduct 与成果确认。',
    sections: [
      {
        id: 'hubu-overview',
        label: '户部总览',
        description: '汇总受控财务能力、成果状态与人工确认。',
        status: 'live',
        fields: ['成果数量', '待确认', '退修', '数据缺口'],
        actions: ['查看成果'],
      },
      {
        id: 'cash-safety',
        label: '现金安全',
        description: '31 天预测与风险建议，明确不付款、不入账。',
        status: 'planned',
        fields: ['风险等级', 'runway', '31 天预测', '证据缺口'],
        actions: ['创建分析'],
      },
      {
        id: 'accounting-reports',
        label: '会计管理报告',
        description: '确定性计算并生成固定七个工作表。',
        status: 'live',
        fields: ['期间', '控制总额', '勾稽结果', '异常分析'],
        actions: ['查看报告', '下载成果'],
      },
      {
        id: 'work-products',
        label: 'WorkProduct',
        description: '冻结事实、假设、建议、证据、风险与成果 manifest。',
        status: 'live',
        fields: ['事实', '假设', '证据', 'risk register', 'content digest'],
        actions: ['查看 WorkProduct'],
      },
      {
        id: 'artifacts',
        label: '成果文件',
        description: '展示与 owner、run、reply 和 digest 绑定的正式成果。',
        status: 'live',
        fields: ['文件格式', 'digest', '发布状态', 'reply_id'],
        actions: ['下载 XLSX', '下载 PDF'],
      },
      {
        id: 'confirmations',
        label: '成果确认',
        description: '追加保存 CONFIRMED、REVISION_REQUIRED 或 ESCALATED。',
        status: 'live',
        fields: ['确认状态', '确认意见', 'receipt', '确认时间'],
        actions: ['确认成果', '要求退修', '升级处理'],
      },
    ],
  },
  life: {
    moduleId: 'life',
    officialDomainName: '生活（客户端扩展领域）',
    eyebrow: 'LOCAL PERSONAL DOMAIN',
    description:
      '三份技术文档未定义该业务域；当前提供与朝堂业务数据隔离的本机日程、提醒、笔记和隐私管理。',
    sections: [
      {
        id: 'life-today',
        label: '今日生活',
        description: '汇总当前客户端中明确创建的本地日程与提醒。',
        status: 'live',
        fields: ['本地日程', '提醒', '习惯', '隐私状态'],
        actions: ['添加事项'],
      },
      {
        id: 'calendar',
        label: '日程',
        description: '创建和管理仅保存在当前客户端的日程。',
        status: 'live',
        fields: ['日期', '时间', '事项', '提醒'],
        actions: ['新建日程'],
      },
      {
        id: 'reminders',
        label: '提醒',
        description: '记录应用内提醒；当前不申请系统通知权限。',
        status: 'live',
        fields: ['提醒时间', '重复规则', '通知状态'],
        actions: ['新建提醒'],
      },
      {
        id: 'notes',
        label: '笔记',
        description: '只保存用户明确创建的个人笔记。',
        status: 'live',
        fields: ['标题', '正文', '标签', '更新时间'],
        actions: ['新建笔记'],
      },
      {
        id: 'privacy',
        label: '隐私设置',
        description: '查看本地存储边界并按需清除生活数据。',
        status: 'live',
        fields: ['数据位置', '保留期限', '连接权限', '清除记录'],
        actions: ['查看隐私设置'],
      },
    ],
  },
  more: {
    moduleId: 'more',
    officialDomainName: '专署与系统设置',
    eyebrow: 'EXTENSIONS · GOVERNANCE',
    description: '集中管理锦衣卫、Skills、MCP、连接器和系统治理。',
    sections: [
      {
        id: 'governance-overview',
        label: '治理总览',
        description: '汇总受控能力、数据来源、审计与本机设置状态。',
        status: 'live',
        fields: ['当前账户', 'Skills', 'MCP', '连接器', '审计事件'],
        actions: ['查看审计', '查看专署'],
      },
      {
        id: 'zhuanshu',
        label: '专署',
        description:
          '技术文档中的专署目录，目前只有锦衣卫具备真实定义并已开放。',
        status: 'live',
        fields: ['专署名称', '开放状态', '能力边界', '数据来源'],
        actions: ['查看专署'],
      },
      {
        id: 'jinyiwei',
        label: '锦衣卫',
        description: '只读、失败关闭的调查、来源尝试与证据域。',
        status: 'live',
        fields: ['调查', '事实槽位', '来源尝试', '证据包', '冲突'],
        actions: ['查看调查', '查看证据'],
      },
      {
        id: 'skills',
        label: 'Skills',
        description: '管理 Agent 可用技能，不作为第二业务 Runtime。',
        status: 'live',
        fields: ['技能名称', '来源', '状态', '权限'],
        actions: ['管理 Skills'],
      },
      {
        id: 'mcp',
        label: 'MCP',
        description: '管理受控工具连接；启用连接不等于授权业务调用。',
        status: 'live',
        fields: ['Server', 'Transport', '工具', '审批版本', '健康状态'],
        actions: ['管理 MCP'],
      },
      {
        id: 'connectors',
        label: '数据连接器',
        description: '配置只读数据来源、作用域和撤回机制。',
        status: 'live',
        fields: ['来源', '作用域', '凭据状态', '最近同步'],
        actions: ['添加连接器'],
      },
      {
        id: 'model-providers',
        label: '模型服务',
        description: '配置 OpenAI GPT、DeepSeek 及其可用模型与 Agent 路由。',
        status: 'live',
        fields: ['服务商', 'API 密钥状态', '模型', 'Agent 路由'],
        actions: ['配置模型服务', '验证模型列表'],
      },
      {
        id: 'audit',
        label: '审计记录',
        description: '查看任务、权限、证据、成果和人工确认血缘。',
        status: 'live',
        fields: ['actor', 'action', 'object', 'receipt', '时间'],
        actions: ['筛选审计'],
      },
      {
        id: 'appearance',
        label: '外观设置',
        description: '管理场景背景、强度、低性能和 reduced motion。',
        status: 'live',
        fields: ['主题', '背景强度', '沉浸模式', '降低动态效果'],
        actions: ['调整外观'],
      },
    ],
  },
};
