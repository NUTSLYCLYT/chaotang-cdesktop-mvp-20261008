import { useState } from 'react';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangButton } from './ChaotangPrimitives';
import { CourtWorkspace } from './CourtWorkspace';
import { JunjichuCasesWorkspace } from './JunjichuCasesWorkspace';

/** One task ledger, shared by the council and engineering entrances. */
function TaskSession({
  scrollPresentation = false,
}: {
  scrollPresentation?: boolean;
}) {
  const [selectedJobId, setSelectedJobId] = useState<string>();
  return (
    <CourtWorkspace
      embedded
      scrollPresentation={scrollPresentation}
      selectedJobId={selectedJobId}
      onSelectJob={setSelectedJobId}
    />
  );
}

export function GongbuTaskWorkspace() {
  const { user, authGeneration } = useChaotangProvider();
  if (!user)
    return <p className="text-sm text-low">登录后查看本账户技术任务与成果。</p>;
  return (
    <div className="space-y-base">
      <p className="text-sm text-low">
        这里使用朝堂统一任务记录。可查看任务进度、部门贡献、文件与验收状态；只有真实事件记录的工作才归于工部。
        开发执行器需要桌面运行环境及有效授权，未连接时会说明原因。
      </p>
      <TaskSession
        scrollPresentation
        key={`${user?.id ?? 'anonymous'}:${authGeneration}`}
      />
    </div>
  );
}

export function JunjichuOperationsWorkspace() {
  const { user, authGeneration } = useChaotangProvider();
  const [view, setView] = useState<'tasks' | 'council'>('tasks');
  if (!user)
    return <p className="text-sm text-low">登录后查看办理任务和会审案卷。</p>;
  return (
    <div className="space-y-base">
      <div
        role="group"
        aria-label="军机处查看范围"
        className="flex flex-wrap gap-base"
      >
        <ChaotangButton
          aria-pressed={view === 'tasks'}
          onClick={() => setView('tasks')}
        >
          办理任务
        </ChaotangButton>
        <ChaotangButton
          aria-pressed={view === 'council'}
          onClick={() => setView('council')}
        >
          会审案卷
        </ChaotangButton>
      </div>
      <p className="text-sm text-low">
        {view === 'tasks'
          ? '查看当前账户任务、进度、阻塞和成果。选中任务后可按实际状态取消或修复后重试。'
          : '查看真实多部门会审记录及已归档回奏。没有会审时保持空白，不生成示例意见。'}
      </p>
      {view === 'tasks' ? (
        <TaskSession
          scrollPresentation
          key={`${user?.id ?? 'anonymous'}:${authGeneration}`}
        />
      ) : (
        <JunjichuCasesWorkspace
          key={`${user?.id ?? 'anonymous'}:${authGeneration}`}
        />
      )}
    </div>
  );
}
