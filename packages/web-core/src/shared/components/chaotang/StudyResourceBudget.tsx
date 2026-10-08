import { useQuery } from '@tanstack/react-query';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';
import { ownerQueryKey } from '@/shared/lib/chaotangFusion';
import { TaskModelConfigurationView } from './FusionCapabilitiesPanel';

/** Read the existing server configuration, never infer budget from model prose. */
export function StudyResourceBudget() {
  const client = useChaotangClient();
  const { user } = useChaotangProvider();
  const supported = Boolean(user && client.fusionCapabilities);
  const query = useQuery({
    queryKey: ownerQueryKey(user?.id, 'fusion-capabilities'),
    queryFn: () => client.fusionCapabilities!(),
    enabled: supported,
    retry: false,
  });
  return (
    <section
      aria-label="本次办理的资源说明"
      className="mt-double border border-brand/15 bg-primary/90 p-base text-sm text-normal"
    >
      <p className="text-brand">资源上限与执行条件</p>
      {!supported ? (
        <p className="mt-base">
          {!user
            ? '请先登录朝堂账户，再读取资源上限。'
            : '当前客户端尚未接入资源配置，请管理员检查服务版本。'}
        </p>
      ) : query.isFetching ? (
        <p role="status" className="mt-base">
          正在读取服务器资源配置…
        </p>
      ) : query.isError ? (
        <p role="alert" className="mt-base">
          资源配置读取失败，不能确认当前上限。
        </p>
      ) : (
        <div className="mt-base">
          <TaskModelConfigurationView value={query.data?.taskModel} />
        </div>
      )}
      <p className="mt-base text-xs leading-relaxed text-low">
        资源额度不是金额报价，也不等于付款或对外操作授权。下旨后的实际额度以任务回执为准，不能从拟旨文字推定。
      </p>
      {supported && (
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className="mt-base border border-brand/30 px-base py-half text-xs text-brand disabled:opacity-50 focus-visible:outline focus-visible:outline-brand"
        >
          {query.isFetching ? '读取中…' : '重新读取资源配置'}
        </button>
      )}
    </section>
  );
}
