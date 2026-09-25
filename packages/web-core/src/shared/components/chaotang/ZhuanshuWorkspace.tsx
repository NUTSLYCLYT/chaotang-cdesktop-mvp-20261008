import {
  ArrowRightIcon,
  BuildingsIcon,
  DatabaseIcon,
  LockKeyIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useJinyiweiSummary } from '@/shared/hooks/chaotang/useJinyiwei';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';

interface ZhuanshuWorkspaceProps {
  onOpenJinyiwei: () => void;
}

const UNAVAILABLE_OFFICES = ['太医院', '内务府', '宗人府'] as const;

export function ZhuanshuWorkspace({ onOpenJinyiwei }: ZhuanshuWorkspaceProps) {
  const { health, user } = useChaotangProvider();
  const summary = useJinyiweiSummary();
  const isConnected = Boolean(health && user);

  return (
    <div className="grid gap-double xl:grid-cols-[1.35fr_0.8fr]">
      <div className="flex flex-col gap-double">
        <ChaotangPanel className="p-double">
          <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
            <div>
              <p className="text-[9px] tracking-[0.24em] text-brand/55">
                SPECIAL OFFICES DIRECTORY
              </p>
              <h2 className="chaotang-title mt-half text-2xl text-high">
                专署目录
              </h2>
              <p className="mt-base max-w-2xl text-sm leading-relaxed text-low">
                专署是独立于六部常规执行链的受控能力域。当前技术文档只定义并开放锦衣卫。
              </p>
            </div>
            <span className="border border-success/35 bg-success/10 px-base py-half text-[9px] tracking-[0.14em] text-success">
              1 个已开放专署
            </span>
          </div>

          <div className="mt-double grid gap-base sm:grid-cols-3">
            <Metric
              label="调查档案"
              value={summary.data?.totalInvestigations}
              pending={summary.isPending && isConnected}
            />
            <Metric
              label="独立证据"
              value={summary.data?.distinctEvidenceCount}
              pending={summary.isPending && isConnected}
            />
            <Metric
              label="已解决调查"
              value={summary.data?.resolvedCount}
              pending={summary.isPending && isConnected}
            />
          </div>

          <article className="mt-double border border-brand/35 bg-primary/55 p-double">
            <div className="flex flex-wrap items-start justify-between gap-base">
              <div className="flex items-center gap-base">
                <div className="flex size-11 items-center justify-center border border-brand/40 bg-brand/10 text-brand">
                  <ShieldCheckIcon className="size-6" weight="duotone" />
                </div>
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-brand/55">
                    INDEPENDENT EVIDENCE DOMAIN
                  </p>
                  <h3 className="chaotang-title mt-half text-xl text-high">
                    锦衣卫
                  </h3>
                </div>
              </div>
              <span className="border border-success/35 bg-success/10 px-base py-half text-[9px] tracking-[0.14em] text-success">
                LIVE · 已开放
              </span>
            </div>

            <p className="mt-double text-sm leading-relaxed text-normal">
              独立、只读优先、失败关闭的调查与证据域；保存调查、事实槽位、来源尝试、证据包和冲突记录。
            </p>

            <div className="mt-double grid gap-base sm:grid-cols-2">
              <Boundary label="数据来源" value="/api/v1/jinyiwei/*" />
              <Boundary label="访问范围" value="按当前账户隔离" />
              <Boundary label="调查发起" value="仅局级节点可申请" />
              <Boundary label="外部网络" value="目录页不会触发" />
            </div>

            {summary.isError && isConnected && (
              <p className="mt-base border border-error/25 bg-error/5 px-base py-base text-xs text-error">
                锦衣卫实时汇总读取失败；目录仍保持失败关闭，不显示推测数据。
              </p>
            )}

            {!isConnected && (
              <p className="mt-base border border-brand/20 bg-brand/5 px-base py-base text-xs leading-relaxed text-low">
                登录且领域服务连接成功后，才会读取当前账户的锦衣卫统计。
              </p>
            )}

            <div className="mt-double border-t border-brand/15 pt-double">
              <ChaotangButton
                variant="primary"
                onClick={onOpenJinyiwei}
                disabled={!isConnected}
              >
                进入锦衣卫
                <ArrowRightIcon className="size-4" />
              </ChaotangButton>
            </div>
          </article>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <LockKeyIcon className="size-5 text-low" weight="duotone" />
            <div>
              <p className="chaotang-title text-lg text-high">未开放专署</p>
              <p className="mt-half text-xs text-low">
                以下名称来自技术文档的未开放示例，不代表已排期或已预留真实服务。
              </p>
            </div>
          </div>
          <div className="mt-double grid gap-base sm:grid-cols-3">
            {UNAVAILABLE_OFFICES.map((office) => (
              <div
                key={office}
                className="border border-brand/12 bg-primary/35 p-base"
              >
                <div className="flex items-center gap-base">
                  <BuildingsIcon className="size-5 text-low" />
                  <span className="chaotang-title text-base text-normal">
                    {office}
                  </span>
                </div>
                <p className="mt-base text-[9px] tracking-[0.14em] text-error/80">
                  UNAVAILABLE · 文档明确未开放
                </p>
              </div>
            ))}
          </div>
        </ChaotangPanel>
      </div>

      <div className="flex flex-col gap-double">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <ShieldCheckIcon className="size-5 text-success" weight="duotone" />
            <p className="chaotang-title text-lg text-high">真实性边界</p>
          </div>
          <ul className="mt-double space-y-base text-sm leading-relaxed text-low">
            <li>专署目录不是通用搜索，也不接受用户网址抓取。</li>
            <li>目录仅投影专署状态，不执行旨意、六部任务或审批。</li>
            <li>未开放专署没有可点击入口、模拟统计或隐藏写操作。</li>
            <li>锦衣卫数据读取失败时，不以缓存猜测或演示数据替代。</li>
          </ul>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <DatabaseIcon className="size-5 text-brand" weight="duotone" />
            <p className="chaotang-title text-lg text-high">目录状态</p>
          </div>
          <div className="mt-double space-y-base text-sm">
            <StatusRow label="登记专署" value="锦衣卫" live />
            <StatusRow
              label="领域服务"
              value={health ? `已连接 · v${health.version}` : '未连接'}
              live={Boolean(health)}
            />
            <StatusRow
              label="当前身份"
              value={user ? user.username : '未登录'}
              live={Boolean(user)}
            />
            <StatusRow label="写入操作" value="目录层禁用" />
          </div>
        </ChaotangPanel>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  pending,
}: {
  label: string;
  value: number | undefined;
  pending: boolean;
}) {
  return (
    <div className="border border-brand/15 bg-primary/40 p-base">
      <p className="text-[9px] tracking-[0.14em] text-low">{label}</p>
      <p className="chaotang-title mt-base text-2xl text-high">
        {pending ? '…' : (value ?? '—')}
      </p>
    </div>
  );
}

function Boundary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-base border-b border-brand/10 pb-base text-xs">
      <span className="text-low">{label}</span>
      <span className="text-right text-normal">{value}</span>
    </div>
  );
}

function StatusRow({
  label,
  value,
  live = false,
}: {
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-base border-b border-brand/10 pb-base">
      <span className="text-low">{label}</span>
      <span className={live ? 'text-success' : 'text-normal'}>{value}</span>
    </div>
  );
}
