import { useState } from 'react';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';

type Destination = 'hubu' | 'cases' | 'jinyiwei' | 'shiguan';

export type OutcomeFilter = 'all' | 'ready' | 'prepare';

export const outcomeFilterOptions: Array<{
  id: OutcomeFilter;
  label: string;
}> = [
  { id: 'all', label: '全部案例' },
  { id: 'ready', label: '现在可办理' },
  { id: 'prepare', label: '先准备需求' },
];

const prepareCases = [
  {
    title: '这个开源项目值得接入吗？',
    team: '丞相统筹 · 相关专业司局 · 锦衣卫查证',
    input: '官方仓库、你希望解决的问题、运行环境和预算限制。',
    output:
      '预期交付：用途、许可证、维护状态、运行要求、接入成本、风险与来源的决策报告。',
    sample:
      '示例结构：结论与理由 → 来源与未核实项 → 接入步骤 → 验收与回退条件。',
    objective:
      '请调研一个开源项目是否适合接入朝堂。官方仓库：待填写。需要解决的问题：待填写。请核实用途、许可证、维护状态、运行要求、接入成本和风险，保留来源与未核实项。未经授权不要安装或上线。',
  },
  {
    title: '把一个产品改进落成可验收任务',
    team: '丞相统筹 · 军机处协调 · 工部承办',
    input: '目标、现有项目、允许修改范围和预期验收方式。',
    output: '预期交付：可审查改动、运行与测试记录、失败说明及回退办法。',
    sample: '示例结构：修改前的问题 → 改动和文件 → 实际验证结果 → 如何回退。',
    objective:
      '请准备一个产品改进任务。目标：待填写。项目与允许修改范围：待填写。验收标准：待填写。实施后需提供真实文件改动、测试证据和回退办法；请先确认执行条件，不要把建议代码当成已执行成果。',
  },
];

function filterCount(filter: OutcomeFilter) {
  if (filter === 'ready') return 1;
  if (filter === 'prepare') return prepareCases.length;
  return 1 + prepareCases.length;
}

export function OutcomeFilterBar({
  value,
  onChange,
}: {
  value: OutcomeFilter;
  onChange: (next: OutcomeFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label="成果案例可用性筛选"
      className="flex flex-wrap gap-base"
    >
      {outcomeFilterOptions.map((option) => (
        <ChaotangButton
          key={option.id}
          variant={option.id === value ? 'primary' : 'secondary'}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </ChaotangButton>
      ))}
    </div>
  );
}

export function OutcomeCaseEmptyState() {
  return (
    <ChaotangPanel className="p-double text-center" role="status">
      <p className="chaotang-title text-base text-high">
        当前筛选下暂无可展示案例
      </p>
      <p className="mx-auto mt-half max-w-xl text-xs leading-relaxed text-low">
        没有匹配的成果案例不代表已经办理或无法办理；请切换到“全部案例”查看完整入口，再按可用边界决定是否带入上书房。
      </p>
    </ChaotangPanel>
  );
}

export function OutcomeCaseList({
  filter,
  onOpen,
  onPrepare,
}: {
  filter: OutcomeFilter;
  onOpen: (destination: Destination) => void;
  onPrepare: (objective: string) => void;
}) {
  const showReady = filter !== 'prepare';
  const showPrepare = filter !== 'ready';
  if (!showReady && !showPrepare) return <OutcomeCaseEmptyState />;
  return (
    <>
      {showReady && (
        <ChaotangPanel className="space-y-base p-double">
          <p className="text-xs text-brand">户部 · 规则计算，登录后可提交</p>
          <h3 className="chaotang-title text-xl text-high">
            我的现金还能支撑多久？
          </h3>
          <p className="text-sm text-normal">
            得到可用现金、资金支撑月数、31 天预测和可下载的
            Excel；核对并确认后归入史馆。
          </p>
          <p className="text-sm text-low">
            请准备：评估日期、现金余额、近三个月现金流、资料来源，以及可选的未来收付款计划。
          </p>
          <details className="border border-brand/20 p-base text-sm text-low">
            <summary className="cursor-pointer text-normal">
              看成果示例结构
            </summary>
            <p className="mt-base">
              以下是格式示例，尚未读取你的数据或生成分析。
            </p>
            <ol className="mt-base list-decimal space-y-half pl-double">
              <li>结论：可用现金、每月净支出与支撑月数。</li>
              <li>依据：输入来源、计算期间、收付款计划与每日预测。</li>
              <li>待确认：资料缺口和建议核对的风险。</li>
              <li>交付：Excel 文件与人工确认记录。</li>
            </ol>
          </details>
          <p className="text-xs text-low">
            不调用模型作财务判断，不执行付款或记账。
          </p>
          <ChaotangButton variant="primary" onClick={() => onOpen('hubu')}>
            填写数据，开始现金分析
          </ChaotangButton>
        </ChaotangPanel>
      )}
      {showPrepare && (
        <div className="grid gap-double md:grid-cols-2">
          {prepareCases.map((item) => (
            <ChaotangPanel key={item.title} className="space-y-base p-double">
              <p className="text-xs text-brand">准备需求 · 真实执行待验收</p>
              <h3 className="chaotang-title text-lg text-high">{item.title}</h3>
              <p className="text-xs text-low">{item.team}</p>
              <p className="text-sm text-normal">{item.output}</p>
              <p className="text-sm text-low">请准备：{item.input}</p>
              <details className="border border-brand/20 p-base text-sm text-low">
                <summary className="cursor-pointer text-normal">
                  看成果示例结构
                </summary>
                <p className="mt-base">{item.sample}</p>
                <p className="mt-half">
                  仅展示交付格式，不代表已有模型执行、证据或验收通过。
                </p>
              </details>
              <p className="text-xs text-low">
                真实办理需要模型、预算及执行器就绪。当前仅带入可编辑草稿，不承诺任务已开始。
              </p>
              <ChaotangButton onClick={() => onPrepare(item.objective)}>
                带入上书房，补充需求
              </ChaotangButton>
            </ChaotangPanel>
          ))}
        </div>
      )}
    </>
  );
}

export function OutcomeRecordsPanel({
  onOpen,
}: {
  onOpen: (destination: Destination) => void;
}) {
  return (
    <ChaotangPanel className="space-y-base p-double">
      <h3 className="chaotang-title text-lg text-high">
        已经办理过？找回过程与成果
      </h3>
      <p className="text-sm text-low">
        这些入口读取当前账户真实记录；新账户没有记录时显示空列表。
      </p>
      <div className="flex flex-wrap gap-base">
        <ChaotangButton onClick={() => onOpen('cases')}>
          军机处：查看任务
        </ChaotangButton>
        <ChaotangButton onClick={() => onOpen('jinyiwei')}>
          锦衣卫：查看来源
        </ChaotangButton>
        <ChaotangButton onClick={() => onOpen('shiguan')}>
          史馆：取回成果
        </ChaotangButton>
      </div>
    </ChaotangPanel>
  );
}

export function OutcomeCatalogWorkspace({
  onOpen,
  onPrepare,
  initialFilter = 'all',
  compact = false,
}: {
  onOpen: (destination: Destination) => void;
  onPrepare: (objective: string) => void;
  initialFilter?: OutcomeFilter;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<OutcomeFilter>(initialFilter);
  const activeLabel =
    outcomeFilterOptions.find((option) => option.id === filter)?.label ??
    '全部案例';
  return (
    <div className="space-y-double">
      {!compact && (
        <p className="text-sm leading-relaxed text-low">
          丞相为你整理办理路径：先选想带走的成果，再补资料。打开入口不会自动执行；部门参与和验收状态以实际回执为准。
        </p>
      )}
      <ChaotangPanel
        className="space-y-base p-double"
        aria-label="成果案例可用性筛选"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-base">
          <h3 className="chaotang-title text-lg text-high">
            按可用性找成果案例
          </h3>
          <p className="text-xs text-low" role="status" aria-live="polite">
            当前显示：{activeLabel} · {filterCount(filter)} 个案例
          </p>
        </div>
        {!compact && (
          <p className="text-sm text-low">
            筛选只影响下方案例卡，不隐藏军机处、锦衣卫和史馆入口；切换筛选不会修改你的资料，也不会自动提交或跳转。
          </p>
        )}
        <OutcomeFilterBar value={filter} onChange={setFilter} />
      </ChaotangPanel>
      <OutcomeCaseList filter={filter} onOpen={onOpen} onPrepare={onPrepare} />
      <OutcomeRecordsPanel onOpen={onOpen} />
    </div>
  );
}
