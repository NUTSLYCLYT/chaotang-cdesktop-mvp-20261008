import { useEffect, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  ChatCircleTextIcon,
  PaperPlaneTiltIcon,
  ScrollIcon,
} from '@phosphor-icons/react';
import {
  useCancelDecreeJob,
  useChancellorConsult,
  useChancellorDraft,
  useDecreeJob,
  useIssueChancellorDecree,
} from '@/shared/hooks/chaotang/useChancellor';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';
import { consumePendingOutcomeIntent } from './outcomeCaseHandoff';
import { StudyTaskProgress } from './StudyTaskProgress';
import { submitStudyDecree } from './studySubmission';
import {
  confirmStudyIntent,
  isStudyIntentCurrent,
  prepareConfirmedStudyDraft,
  type ConfirmedStudyIntent,
} from './studyIntentConfirmation';

export function ChancellorStudyWorkspace({
  initialObjective = '',
}: { initialObjective?: string } = {}) {
  const { user, authGeneration } = useChaotangProvider();
  return (
    <ChancellorStudySession
      key={`${user?.id ?? 'anonymous'}:${authGeneration}:${initialObjective}`}
      initialObjective={initialObjective}
    />
  );
}

function ChancellorStudySession({
  initialObjective,
}: {
  initialObjective: string;
}) {
  const { user, health, authGeneration } = useChaotangProvider();
  const [objective, setObjective] = useState(initialObjective);
  const [handoffNotice, setHandoffNotice] = useState<string>();
  const [submissionNotice, setSubmissionNotice] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const mounted = useRef(true);
  const initialized = useRef(false);
  const [cameFromOutcomeCase, setCameFromOutcomeCase] = useState(
    Boolean(initialObjective)
  );
  const [draftVersion, setDraftVersion] = useState(1);
  const [jobId, setJobId] = useState<string>();
  const [confirmedIntent, setConfirmedIntent] =
    useState<ConfirmedStudyIntent | null>(null);
  const [draftIntent, setDraftIntent] = useState<ConfirmedStudyIntent | null>(
    null
  );
  const contextGeneration = useRef(0);
  const consultationGeneration = useRef(0);
  const authorizationEpoch = useRef(0);
  const renderedEpoch = authorizationEpoch.current;
  const consult = useChancellorConsult();
  const draft = useChancellorDraft();
  const issue = useIssueChancellorDecree();
  const job = useDecreeJob(jobId);
  const cancel = useCancelDecreeJob();
  const currentIntent = {
    ownerId: user?.id ?? '',
    normalizedOriginalGoal: objective,
    exactLatestChancellorRestatement: consult.data?.reply ?? '',
    consultationGeneration: consultationGeneration.current,
    contextGeneration: contextGeneration.current,
  };
  const understandingConfirmed = isStudyIntentCurrent(
    confirmedIntent,
    currentIntent
  );
  const draftIsCurrent =
    understandingConfirmed && draftIntent === confirmedIntent;

  const invalidateUnderstanding = () => {
    ++authorizationEpoch.current;
    setConfirmedIntent(null);
    setDraftIntent(null);
    draft.reset();
    issue.reset();
    setSubmissionNotice(undefined);
  };

  useEffect(() => {
    if (confirmedIntent && !understandingConfirmed) {
      ++authorizationEpoch.current;
      setConfirmedIntent(null);
      setDraftIntent(null);
      draft.reset();
      issue.reset();
      setSubmissionNotice('目标或丞相理解已变化，请重新确认后拟旨。');
    }
  }, [confirmedIntent, understandingConfirmed, draft, issue]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;
    let handoffDiscarded = false;
    const pendingIntent = initialObjective
      ? undefined
      : consumePendingOutcomeIntent(
          () => sessionStorage,
          { ownerUserId: user.id, authGeneration },
          () => {
            handoffDiscarded = true;
            setHandoffNotice('未能带入之前的提纲，请重新选择案例或填写目标。');
          }
        );
    if (pendingIntent) {
      setObjective(pendingIntent);
      setCameFromOutcomeCase(true);
    }
    // A newly transferred objective must not display an older job as its result.
    // Keep the previous task record intact so opening the ordinary study can resume it.
    if (!initialObjective && !pendingIntent && !handoffDiscarded) {
      try {
        const storedJobId = sessionStorage.getItem(activeJobKey(user.id));
        if (storedJobId) setJobId(storedJobId);
      } catch {
        setHandoffNotice('无法读取本地任务记录，可到军机处查看已有任务。');
      }
    }
  }, [user, initialObjective, authGeneration]);

  useEffect(() => {
    if (!user || !jobId || !job.data || job.data.jobId !== jobId) return;
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.data.state)) {
      try {
        sessionStorage.removeItem(activeJobKey(user.id));
      } catch {
        setHandoffNotice(
          '本地任务记录未能清理，任务实际状态仍以后端回执为准。'
        );
      }
    }
  }, [job.data, jobId, user]);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center text-sm text-low">
        {!user ? '请先登录朝堂账户' : '朝堂后端未连接'}
      </ChaotangPanel>
    );
  }

  const ready =
    draftIsCurrent &&
    draft.data?.status === 'DRAFT_READY' &&
    draft.data.decreeText;
  const error =
    consult.error?.message ?? draft.error?.message ?? issue.error?.message;
  const submitting = isSubmitting || issue.isPending;

  const createDraft = () => {
    if (
      !understandingConfirmed ||
      submissionInFlight.current ||
      consult.isPending ||
      draft.isPending ||
      renderedEpoch !== authorizationEpoch.current
    )
      return;
    const payload = prepareConfirmedStudyDraft(
      confirmedIntent,
      currentIntent,
      draftVersion
    );
    if (!payload) {
      setSubmissionNotice(
        '请确认当前理解；目标与确认理解合计（含标记）不得超过 4000 字，请精简后重新咨询。'
      );
      return;
    }
    setSubmissionNotice(undefined);
    draft.reset();
    issue.reset();
    cancel.reset();
    setJobId(undefined);
    setDraftIntent(confirmedIntent);
    draft.mutate(payload);
  };

  const issueDraft = async () => {
    if (
      !ready ||
      !draft.data ||
      jobId ||
      submissionInFlight.current ||
      renderedEpoch !== authorizationEpoch.current
    )
      return;
    const submittedVersion = draft.data.version;
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setSubmissionNotice(undefined);
    try {
      const outcome = await submitStudyDecree({
        ownerUserId: user.id,
        draft: {
          decreeText: draft.data.decreeText!,
          draftVersion: draft.data.version,
          draftFingerprint: draft.data.fingerprint,
        },
        issue: (input) => issue.mutateAsync(input),
        isCurrent: () =>
          mounted.current && renderedEpoch === authorizationEpoch.current,
        remember: (acceptedJobId) =>
          sessionStorage.setItem(activeJobKey(user.id), acceptedJobId),
      });
      if (!mounted.current || outcome.status === 'left-session') return;
      if (outcome.status === 'unconfirmed') {
        setSubmissionNotice(
          '未能确认受理结果，请先到军机处查看。若需重试，请保留本次拟旨，避免重复办理。'
        );
      } else {
        cancel.reset();
        setJobId(outcome.jobId);
        setDraftVersion(submittedVersion + 1);
        if (!outcome.remembered) {
          setHandoffNotice(
            '任务已受理，但未能保存本地记录。离开后可到军机处查看。'
          );
        }
      }
    } finally {
      submissionInFlight.current = false;
      if (mounted.current) setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-double">
      {handoffNotice && (
        <p role="alert" className="text-sm text-low">
          {handoffNotice}
        </p>
      )}
      <div className="grid grid-cols-2 border border-brand/20 bg-secondary/85 sm:grid-cols-4">
        <Phase
          label="提出议题"
          active={!consult.data}
          complete={Boolean(consult.data)}
        />
        <Phase
          label="确认理解"
          active={Boolean(consult.data && !understandingConfirmed)}
          complete={understandingConfirmed}
        />
        <Phase
          label="形成拟旨"
          active={understandingConfirmed && !draftIsCurrent}
          complete={Boolean(draftIsCurrent && draft.data)}
        />
        <Phase
          label="预览下旨"
          active={Boolean(draftIsCurrent && draft.data && !jobId)}
          complete={Boolean(jobId)}
        />
      </div>
      <ChaotangPanel className="p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.22em] text-brand/55">
              CHANCELLOR DESK · LIVE
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              上书房
            </h2>
            <p className="mt-base text-sm leading-relaxed text-low">
              咨询不产生业务副作用；拟旨通过后才能正式下旨。
            </p>
          </div>
          <span className="border border-success/30 bg-success/10 px-base py-half text-[9px] text-success">
            OWNER · {user.username}
          </span>
        </div>
        <textarea
          rows={5}
          maxLength={4000}
          disabled={consult.isPending || draft.isPending || submitting}
          value={objective}
          onChange={(event) => {
            setObjective(event.target.value);
            setCameFromOutcomeCase(false);
            ++contextGeneration.current;
            invalidateUnderstanding();
            consult.reset();
          }}
          placeholder="说明目标、范围、已有材料、限制条件和期望成果…"
          className="mt-double w-full resize-y border border-brand/20 bg-primary/60 p-base text-sm leading-7 text-normal outline-none placeholder:text-low/60 focus:border-brand/45"
        />
        {cameFromOutcomeCase && (
          <p className="mt-base border-l-2 border-brand/55 bg-brand/5 px-base py-half text-xs leading-relaxed text-low">
            已带入案例提纲，可直接修改。此处仍是商议草稿；只有你确认并正式下旨后才会创建任务。
          </p>
        )}
        <div className="mt-base flex flex-wrap gap-base">
          <ChaotangButton
            disabled={
              !objective.trim() ||
              consult.isPending ||
              draft.isPending ||
              submitting
            }
            onClick={() => {
              if (submissionInFlight.current) return;
              if (
                consult.isPending ||
                draft.isPending ||
                renderedEpoch !== authorizationEpoch.current
              )
                return;
              if (
                !objective.trim() ||
                Array.from(objective.trim()).length > 4000
              ) {
                setSubmissionNotice('目标需为 1–4000 字，请调整后咨询。');
                return;
              }
              ++consultationGeneration.current;
              invalidateUnderstanding();
              consult.mutate([{ role: 'user', content: objective.trim() }]);
            }}
          >
            <ChatCircleTextIcon className="size-4" />
            {consult.isPending ? '丞相思考中…' : '咨询丞相'}
          </ChaotangButton>
          <ChaotangButton
            variant="primary"
            disabled={
              !understandingConfirmed ||
              consult.isPending ||
              draft.isPending ||
              submitting
            }
            onClick={createDraft}
          >
            <ScrollIcon className="size-4" />
            {draft.isPending
              ? '正在拟旨…'
              : understandingConfirmed
                ? '形成拟旨'
                : '请先确认理解'}
          </ChaotangButton>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-base border border-error/25 bg-error/5 p-base text-xs text-error"
          >
            {error}
          </p>
        )}
        {submissionNotice && (
          <p role="alert" className="mt-base text-xs text-error">
            {submissionNotice}
          </p>
        )}
      </ChaotangPanel>

      {consult.data && (
        <section className="border border-[#bda65d]/55 bg-[#e9e2cc] p-1 text-[#272116] shadow-[0_18px_55px_rgba(0,0,0,0.35)]">
          <div className="border border-[#9b8140]/35 bg-[linear-gradient(135deg,#eee9d9,#dcd3bb)] p-double sm:p-8">
            <div className="flex items-center justify-between gap-base text-[10px] text-[#79642f]">
              <span>上书房 · 理解确认</span>
              <span>咨询不持久化</span>
            </div>
            <p className="mt-double text-xs text-[#9a372b]">丞相复述</p>
            <p className="mt-base whitespace-pre-wrap text-base leading-8 text-[#2b251b]">
              {consult.data.reply}
            </p>
            <div className="mt-double border-t border-[#9b8140]/25 pt-double">
              {understandingConfirmed ? (
                <div className="flex flex-wrap items-center gap-base">
                  <p className="flex items-center gap-base text-sm text-[#516438]">
                    <CheckCircleIcon className="size-5" weight="duotone" />
                    理解已确认，可以形成拟旨。
                  </p>
                  <button
                    type="button"
                    disabled={
                      consult.isPending || draft.isPending || submitting
                    }
                    onClick={() => {
                      if (
                        submissionInFlight.current ||
                        renderedEpoch !== authorizationEpoch.current
                      )
                        return;
                      invalidateUnderstanding();
                    }}
                    className="border border-[#9b8140]/40 px-base py-base text-xs text-[#665323] hover:bg-white/30 disabled:opacity-45"
                  >
                    重新确认理解
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-base">
                  <button
                    type="button"
                    disabled={
                      consult.isPending || draft.isPending || submitting
                    }
                    onClick={() => {
                      if (
                        consult.isPending ||
                        draft.isPending ||
                        submissionInFlight.current ||
                        renderedEpoch !== authorizationEpoch.current
                      )
                        return;
                      const confirmed = confirmStudyIntent(
                        currentIntent,
                        currentIntent
                      );
                      setConfirmedIntent(confirmed);
                      if (!confirmed)
                        setSubmissionNotice('当前理解无法确认，请重新咨询。');
                    }}
                    className="border border-[#8f6c22] bg-[#d8bd69] px-double py-base text-sm font-semibold text-[#282014] hover:bg-[#e2ca7e]"
                  >
                    确认理解无误
                  </button>
                  <button
                    type="button"
                    disabled={
                      consult.isPending || draft.isPending || submitting
                    }
                    onClick={() => {
                      if (
                        submissionInFlight.current ||
                        renderedEpoch !== authorizationEpoch.current
                      )
                        return;
                      invalidateUnderstanding();
                      consult.reset();
                    }}
                    className="border border-[#9b8140]/40 px-base py-base text-xs text-[#665323] hover:bg-white/30"
                  >
                    返回修改议题
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {draft.data && draftIsCurrent && (
        <section className="border border-[#bda65d]/55 bg-[#e9e2cc] p-1 text-[#272116] shadow-[0_18px_55px_rgba(0,0,0,0.35)]">
          <div className="border border-[#9b8140]/35 bg-[linear-gradient(135deg,#eee9d9,#dcd3bb)] p-double sm:p-8">
            <div className="flex flex-wrap justify-between gap-base">
              <div>
                <p className="text-xs text-[#8f6f2a]">
                  拟旨 v{draft.data.version}
                </p>
                <h3 className="chaotang-title mt-half text-xl text-[#272116]">
                  {draft.data.status}
                </h3>
              </div>
              <span className="font-mono text-[9px] text-[#786f5d]">
                {draft.data.fingerprint.slice(0, 16)}…
              </span>
            </div>
            <p className="mt-double text-sm leading-7 text-[#312a1e]">
              {draft.data.understanding}
            </p>
            {draft.data.draft && (
              <div className="mt-double grid gap-base md:grid-cols-2">
                <DraftList
                  title="办理部门"
                  items={draft.data.draft.departments.map(
                    (item) => `${item.department} · ${item.bureaus.join('、')}`
                  )}
                />
                <DraftList
                  title="交付物"
                  items={draft.data.draft.deliverables}
                />
                <DraftList
                  title="材料缺口"
                  items={draft.data.draft.materialGaps}
                />
                <DraftList
                  title="权限与限制"
                  items={draft.data.draft.permissionsAndLimits}
                />
              </div>
            )}
            <div className="mt-double border border-[#9b8140]/35 bg-white/25 p-base text-sm leading-7 text-[#312a1e]">
              {draft.data.decreeText ?? draft.data.revisionPrompt}
            </div>
            <ChaotangButton
              className="mt-double"
              variant="primary"
              disabled={!ready || submitting || Boolean(jobId)}
              onClick={() => void issueDraft()}
            >
              <PaperPlaneTiltIcon className="size-4" />
              {submitting
                ? '正在受理…'
                : ready
                  ? '正式下旨'
                  : '尚未达到 DRAFT_READY'}
            </ChaotangButton>
          </div>
        </section>
      )}

      {jobId && (
        <StudyTaskProgress
          jobId={jobId}
          job={job.data}
          readError={job.error?.message}
          cancelError={cancel.error?.message}
          isFetching={job.isFetching}
          isCancelling={cancel.isPending}
          onRefresh={() => void job.refetch()}
          onCancel={() => cancel.mutate(jobId)}
        />
      )}
    </div>
  );
}

function activeJobKey(userId: string) {
  return `chaotang.active-decree-job.${userId}`;
}

function Phase({
  label,
  active,
  complete,
}: {
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div
      className={`border-r border-brand/15 px-base py-base text-center text-[10px] last:border-r-0 ${active ? 'bg-brand/10 text-brand' : complete ? 'text-success' : 'text-low'}`}
    >
      {complete ? '✓ ' : ''}
      {label}
    </div>
  );
}

function DraftList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="border border-brand/15 bg-primary/35 p-base">
      <p className="text-xs text-brand">{title}</p>
      {items.length ? (
        <ul className="mt-base space-y-half text-xs leading-relaxed text-low">
          {items.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-base text-xs text-low">无</p>
      )}
    </section>
  );
}
