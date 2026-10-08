import { useState } from 'react';
import { ChaotangButton } from './ChaotangPrimitives';
import { ShiguanWorkspace } from './ShiguanWorkspace';

export function ShiguanOperationsWorkspace({
  onReuse,
}: {
  onReuse: (objective: string) => void;
}) {
  const [mode, setMode] = useState<'archives' | 'recall'>('archives');
  return (
    <div className="space-y-double">
      <div
        role="group"
        aria-label="史馆查询方式"
        className="flex flex-wrap gap-base"
      >
        <ChaotangButton
          aria-pressed={mode === 'archives'}
          onClick={() => setMode('archives')}
        >
          我的档案与复盘
        </ChaotangButton>
        <ChaotangButton
          aria-pressed={mode === 'recall'}
          onClick={() => setMode('recall')}
        >
          查找相似旧案
        </ChaotangButton>
      </div>
      <ShiguanWorkspace mode={mode} onReuse={onReuse} />
    </div>
  );
}
