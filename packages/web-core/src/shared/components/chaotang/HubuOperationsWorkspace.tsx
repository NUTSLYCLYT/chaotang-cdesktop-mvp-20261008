import { useState } from 'react';
import { ChaotangButton } from './ChaotangPrimitives';
import { CashSafetyReadinessWorkspace } from './CashSafetyReadinessWorkspace';
import { HubuWorkspace } from './HubuWorkspace';

export type HubuOperationsView =
  | 'create'
  | 'products'
  | 'artifacts'
  | 'confirmations'
  | 'overview'
  | 'reports';

// Deep links use the shell section id; the treasury component keeps the four
// original办理 steps and reuses the already-built HubuWorkspace modes for the
// two summary/report sections. Unknown or cross-department ids fall back to
// the create step so no second entrance or ledger is introduced.
const SECTION_TO_VIEW: Record<string, HubuOperationsView> = {
  'hubu-overview': 'overview',
  'cash-safety': 'create',
  'accounting-reports': 'reports',
  'work-products': 'products',
  artifacts: 'artifacts',
  confirmations: 'confirmations',
};

export function hubuViewFromSection(section?: string): HubuOperationsView {
  if (!section) return 'create';
  return SECTION_TO_VIEW[section] ?? 'create';
}

const views = [
  ['create', '创建分析'],
  ['products', '查看成果'],
  ['artifacts', '下载文件'],
  ['confirmations', '确认归档'],
  ['overview', '户部总览'],
  ['reports', '会计管理报告'],
] as const;

export function HubuOperationsWorkspace({
  initialSection,
}: {
  initialSection?: string;
} = {}) {
  const [view, setView] = useState<HubuOperationsView>(() =>
    hubuViewFromSection(initialSection)
  );
  return (
    <div className="space-y-double">
      <div
        role="group"
        aria-label="户部办理步骤"
        className="flex flex-wrap gap-base"
      >
        {views.map(([value, label]) => (
          <ChaotangButton
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {label}
          </ChaotangButton>
        ))}
      </div>
      <p className="text-sm text-low">
        先创建分析，再查看结论与证据、下载文件。核对无误后，在“确认归档”提交你的决定；已确认的成果可到史馆查看。
      </p>
      {/* Keep unsent input while the user inspects an earlier result. */}
      <div hidden={view !== 'create'}>
        <CashSafetyReadinessWorkspace />
      </div>
      {view !== 'create' && <HubuWorkspace key={view} mode={view} />}
    </div>
  );
}
