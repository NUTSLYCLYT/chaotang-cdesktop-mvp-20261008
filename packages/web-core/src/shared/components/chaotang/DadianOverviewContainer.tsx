import { useDadianOverview } from '@/shared/hooks/chaotang/useDadianOverview';
import { useChaotangReadiness } from '@/shared/hooks/chaotang/useChaotangReadiness';
import { useDailyMemorialLatest } from '@/shared/hooks/chaotang/useDailyMemorialLatest';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangPanel } from '@/shared/components/chaotang/ChaotangPrimitives';
import { DadianOverviewView } from '@/shared/components/chaotang/DadianOverviewView';

export function DadianOverviewContainer() {
  const { user, health } = useChaotangProvider();
  const query = useDadianOverview();
  const readinessQuery = useChaotangReadiness();
  const dailyMemorialQuery = useDailyMemorialLatest();

  if (!user) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">请先登录朝堂账户</h2>
        <p className="mt-base text-sm text-low">
          登录后才能读取属于你的大殿回奏与待复盘事项。
        </p>
      </ChaotangPanel>
    );
  }

  if (!health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-error">朝堂服务未连接</h2>
        <p className="mt-base text-sm text-low">
          请确认本地 FastAPI 服务已经启动。
        </p>
      </ChaotangPanel>
    );
  }

  if (query.isPending) {
    return (
      <div className="grid animate-pulse gap-double xl:grid-cols-[1.35fr_0.8fr]">
        <div className="h-96 border border-brand/15 bg-panel/60" />
        <div className="h-72 border border-brand/15 bg-panel/60" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-error">大殿总览读取失败</h2>
        <p className="mt-base text-sm text-low">{query.error.message}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-double border border-brand/35 px-base py-base text-xs text-brand hover:bg-brand/10"
        >
          重新读取
        </button>
      </ChaotangPanel>
    );
  }

  return (
    <DadianOverviewView
      overview={query.data}
      readiness={readinessQuery.data}
      dailyMemorial={dailyMemorialQuery.data}
      readinessError={
        readinessQuery.isError ? readinessQuery.error.message : undefined
      }
      dailyMemorialError={
        dailyMemorialQuery.isError
          ? dailyMemorialQuery.error.message
          : undefined
      }
    />
  );
}
