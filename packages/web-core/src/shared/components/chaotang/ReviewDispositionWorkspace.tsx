import { useEffect, useState, type FormEvent } from 'react';
import {
  BookOpenTextIcon,
  CheckCircleIcon,
  ClockIcon,
  ScrollIcon,
  ShieldCheckIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import {
  useShiguanArchive,
  useShiguanArchives,
  useShiguanDecision,
  useShiguanReview,
} from '@/shared/hooks/chaotang/useShiguan';
import {
  useChaotangProvider,
  type ShiguanArchiveDecisionValue,
  type ShiguanReviewStatusValue,
} from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';
import { cn } from '@/shared/lib/utils';

const REVIEW_OPTIONS: Array<{
  value: ShiguanReviewStatusValue;
  label: string;
}> = [
  { value: 'ACHIEVED', label: '已达成' },
  { value: 'NOT_ACHIEVED', label: '未达成' },
  { value: 'PARTIAL', label: '部分达成' },
  { value: 'OBSERVING', label: '观察中' },
];

const DECISION_LABELS: Record<ShiguanArchiveDecisionValue, string> = {
  APPROVED: '批准奏折',
  REJECTED: '驳回奏折',
  ADOPTED: '采纳回奏',
  RETURNED_FOR_RECONSIDERATION: '退回重议',
};

export function ReviewDispositionWorkspace() {
  const { user, health } = useChaotangProvider();
  const archives = useShiguanArchives();
  const [selectedId, setSelectedId] = useState<string>();
  const detail = useShiguanArchive(selectedId);
  const review = useShiguanReview();
  const decision = useShiguanDecision();
  const [reviewStatus, setReviewStatus] =
    useState<ShiguanReviewStatusValue>('OBSERVING');
  const [note, setNote] = useState('');
  const [pendingDecision, setPendingDecision] =
    useState<ShiguanArchiveDecisionValue>();

  useEffect(() => {
    if (!detail.data) return;
    setReviewStatus(detail.data.reviewStatus?.status ?? 'OBSERVING');
    setNote(detail.data.reviewStatus?.note ?? '');
    setPendingDecision(undefined);
    review.reset();
    decision.reset();
  }, [detail.data?.id]);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '史馆服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          复盘和处置必须由档案所属账户提交。
        </p>
      </ChaotangPanel>
    );
  }

  if (archives.isPending) {
    return (
      <div className="grid animate-pulse gap-double xl:grid-cols-[0.8fr_1.3fr]">
        <div className="h-[620px] border border-brand/15 bg-panel/60" />
        <div className="h-[620px] border border-brand/15 bg-panel/60" />
      </div>
    );
  }

  if (archives.isError) {
    return (
      <ChaotangPanel className="p-double text-center text-error">
        {archives.error.message}
      </ChaotangPanel>
    );
  }

  const submitReview = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || review.isPending) return;
    review.mutate({ archiveId: selectedId, status: reviewStatus, note });
  };

  const confirmDecision = () => {
    if (!selectedId || !pendingDecision || decision.isPending) return;
    decision.mutate({ archiveId: selectedId, decision: pendingDecision });
  };

  return (
    <div className="grid gap-double xl:grid-cols-[0.8fr_1.3fr]">
      <ChaotangPanel className="p-double">
        <div className="flex items-center gap-base border-b border-brand/15 pb-double">
          <BookOpenTextIcon className="size-5 text-brand" weight="duotone" />
          <div>
            <h2 className="chaotang-title text-lg text-high">史馆档案</h2>
            <p className="mt-half text-[10px] text-low">
              当前批次 {archives.data.length} 项
            </p>
          </div>
        </div>
        {archives.data.length === 0 ? (
          <p className="mt-double border border-dashed border-brand/20 py-16 text-center text-sm text-low">
            当前账户没有可复盘档案
          </p>
        ) : (
          <div className="mt-double max-h-[620px] space-y-half overflow-y-auto pr-half">
            {archives.data.map((archive) => (
              <button
                key={archive.id}
                type="button"
                onClick={() => setSelectedId(archive.id)}
                className={cn(
                  'w-full border p-base text-left transition-colors',
                  selectedId === archive.id
                    ? 'border-brand/45 bg-brand/10'
                    : 'border-brand/10 bg-primary/35 hover:border-brand/25'
                )}
              >
                <div className="flex items-start justify-between gap-base">
                  <span className="line-clamp-2 text-sm text-high">
                    {archive.title}
                  </span>
                  <span className="shrink-0 text-[9px] text-brand">
                    {archive.archiveType === 'MEMORIAL' ? '奏折' : '回奏'}
                  </span>
                </div>
                <p className="mt-half text-[10px] text-low">
                  {archive.department} · {archive.matterType}
                </p>
                <div className="mt-base flex items-center justify-between gap-base text-[9px]">
                  <span
                    className={
                      archive.reviewStatus ? 'text-success' : 'text-brand'
                    }
                  >
                    {archive.reviewStatus
                      ? reviewLabel(archive.reviewStatus.status)
                      : '待复盘'}
                  </span>
                  <span
                    className={
                      archive.decisionStatus ? 'text-success' : 'text-low'
                    }
                  >
                    {archive.decisionStatus
                      ? DECISION_LABELS[archive.decisionStatus.decision]
                      : '待处置'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </ChaotangPanel>

      <ChaotangPanel className="p-double">
        {!selectedId ? (
          <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
            <ScrollIcon className="size-8 text-brand/45" weight="duotone" />
            <p className="mt-base text-sm text-low">
              选择一份档案进行复盘与处置
            </p>
          </div>
        ) : detail.isPending ? (
          <div className="h-[520px] animate-pulse bg-brand/5" />
        ) : detail.isError ? (
          <p className="text-center text-sm text-error">
            {detail.error.message}
          </p>
        ) : (
          <article>
            <div className="border-b border-brand/15 pb-double">
              <p className="text-[9px] tracking-[0.2em] text-brand/55">
                {detail.data.archiveType} · REVIEW & DISPOSITION
              </p>
              <h2 className="chaotang-title mt-half text-2xl text-high">
                {detail.data.title}
              </h2>
              <p className="mt-base line-clamp-3 text-xs leading-relaxed text-low">
                {detail.data.content}
              </p>
            </div>

            <form onSubmit={submitReview} className="mt-double">
              <div className="flex items-center gap-base">
                <ClockIcon className="size-5 text-brand" weight="duotone" />
                <div>
                  <h3 className="chaotang-title text-lg text-high">复盘状态</h3>
                  <p className="mt-half text-[10px] text-low">
                    可再次更新；它是复盘读模型，不是真实 OutcomeEvent。
                  </p>
                </div>
              </div>
              <div className="mt-base grid gap-base sm:grid-cols-2">
                {REVIEW_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-base border px-base py-base text-sm',
                      reviewStatus === option.value
                        ? 'border-brand/45 bg-brand/10 text-brand'
                        : 'border-brand/15 text-normal'
                    )}
                  >
                    <input
                      type="radio"
                      name="review-status"
                      value={option.value}
                      checked={reviewStatus === option.value}
                      onChange={() => setReviewStatus(option.value)}
                      disabled={review.isPending}
                      className="accent-brand"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 4000))}
                placeholder="填写复盘备注（可选）"
                rows={3}
                disabled={review.isPending}
                className="mt-base w-full resize-none border border-brand/20 bg-primary/45 px-base py-base text-sm text-normal outline-none placeholder:text-low focus:border-brand/50"
              />
              <div className="mt-base flex items-center justify-between gap-base">
                <span className="text-[9px] text-low">{note.length}/4000</span>
                <ChaotangButton
                  type="submit"
                  variant="primary"
                  disabled={review.isPending}
                >
                  {review.isPending ? '正在更新…' : '更新复盘'}
                </ChaotangButton>
              </div>
              {review.isError && (
                <p className="mt-base text-xs text-error">
                  {review.error.message}
                </p>
              )}
              {review.isSuccess && (
                <p className="mt-base flex items-center gap-half text-xs text-success">
                  <CheckCircleIcon className="size-4" />
                  复盘已更新
                </p>
              )}
            </form>

            <section className="mt-double border-t border-brand/15 pt-double">
              <div className="flex items-center gap-base">
                <ShieldCheckIcon
                  className="size-5 text-success"
                  weight="duotone"
                />
                <div>
                  <h3 className="chaotang-title text-lg text-high">档案处置</h3>
                  <p className="mt-half text-[10px] text-low">
                    最终决定不可更改；重复提交相同决定只返回原记录。
                  </p>
                </div>
              </div>

              {detail.data.decisionStatus ? (
                <div className="mt-base border border-success/25 bg-success/5 p-base">
                  <p className="text-sm text-success">
                    {DECISION_LABELS[detail.data.decisionStatus.decision]}
                  </p>
                  <p className="mt-half text-[10px] text-low">
                    {new Date(
                      detail.data.decisionStatus.decidedAt
                    ).toLocaleString('zh-CN')}
                  </p>
                </div>
              ) : pendingDecision ? (
                <div className="mt-base border border-error/30 bg-error/5 p-base">
                  <div className="flex items-start gap-base">
                    <WarningIcon className="mt-half size-5 shrink-0 text-error" />
                    <div>
                      <p className="text-sm text-error">
                        确认“{DECISION_LABELS[pendingDecision]}”？
                      </p>
                      <p className="mt-half text-xs leading-relaxed text-low">
                        此操作会写入不可变最终决定，之后不能改成另一种处置。
                      </p>
                    </div>
                  </div>
                  <div className="mt-base flex gap-base">
                    <ChaotangButton
                      variant="danger"
                      onClick={confirmDecision}
                      disabled={decision.isPending}
                    >
                      {decision.isPending ? '正在确认…' : '确认最终处置'}
                    </ChaotangButton>
                    <ChaotangButton
                      onClick={() => setPendingDecision(undefined)}
                      disabled={decision.isPending}
                    >
                      取消
                    </ChaotangButton>
                  </div>
                </div>
              ) : (
                <div className="mt-base flex flex-wrap gap-base">
                  {decisionOptions(detail.data.archiveType).map((option) => (
                    <ChaotangButton
                      key={option}
                      variant={
                        option === 'REJECTED' ||
                        option === 'RETURNED_FOR_RECONSIDERATION'
                          ? 'danger'
                          : 'secondary'
                      }
                      onClick={() => setPendingDecision(option)}
                    >
                      {DECISION_LABELS[option]}
                    </ChaotangButton>
                  ))}
                </div>
              )}
              {decision.isError && (
                <p className="mt-base text-xs text-error">
                  {decision.error.message}
                </p>
              )}
            </section>
          </article>
        )}
      </ChaotangPanel>
    </div>
  );
}

function reviewLabel(value: ShiguanReviewStatusValue) {
  return (
    REVIEW_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

function decisionOptions(
  archiveType: 'MEMORIAL' | 'REPLY'
): ShiguanArchiveDecisionValue[] {
  return archiveType === 'MEMORIAL'
    ? ['APPROVED', 'REJECTED']
    : ['ADOPTED', 'RETURNED_FOR_RECONSIDERATION'];
}
