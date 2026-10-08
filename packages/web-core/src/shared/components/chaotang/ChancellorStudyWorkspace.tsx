import { useEffect, useRef, useState, type MouseEvent } from 'react';
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
import { StudyResourceBudget } from './StudyResourceBudget';
import { submitStudyDecree } from './studySubmission';
import {
  readStudyTextMaterial,
  appendStudyTextMaterial,
  type StudyTextMaterial,
} from './studyTextMaterial';
import {
  confirmStudyIntent,
  isStudyIntentCurrent,
  prepareConfirmedStudyDraft,
  type ConfirmedStudyIntent,
} from './studyIntentConfirmation';
import {
  readStudyObjective,
  saveStudyObjective,
  removeStudyObjective,
  type SavedStudyObjective,
} from './studyObjectiveDraft';

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
  const [savedObjective, setSavedObjective] = useState<SavedStudyObjective>();
  const [savedObjectiveNotice, setSavedObjectiveNotice] = useState<string>();
  const [savedObjectiveError, setSavedObjectiveError] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const [materialPreview, setMaterialPreview] = useState<StudyTextMaterial>();
  const [materialNotice, setMaterialNotice] = useState<string>();
  const [materialError, setMaterialError] = useState(false);
  const [readingMaterial, setReadingMaterial] = useState(false);
  const materialGeneration = useRef(0);
  const materialPending = useRef(false);
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

  const discardMaterial = () => {
    ++materialGeneration.current;
    materialPending.current = false;
    setMaterialPreview(undefined);
    setReadingMaterial(false);
    setMaterialNotice(undefined);
    setMaterialError(false);
  };

  const invalidateUnderstanding = () => {
    discardMaterial();
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
    const saved = readStudyObjective(() => localStorage, user.id);
    if (saved.status === 'found') {
      setSavedObjective(saved.draft);
    } else if (saved.status !== 'empty') {
      setSavedObjectiveError(true);
      setSavedObjectiveNotice(
        '未能读取本机已存需求。你仍可编辑；请保留一份副本后再离开。'
      );
    }
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
  const preparationError = consult.error ?? draft.error;
  const modelConfigurationMissing =
    preparationError &&
    'code' in preparationError &&
    preparationError.code === 'config_unavailable';
  const submitting = isSubmitting || issue.isPending;
  const objectiveBusy = consult.isPending || draft.isPending || submitting;
  // User-facing copy: never surface DRAFT_READY as the primary explanation and
  // never imply the draft is executable unless the original ready check is true.
  const draftStatusText = submitting
    ? '正在受理，请勿重复提交'
    : jobId
      ? '已创建办理任务，请查看下方进展'
      : ready
        ? '拟旨已就绪，等待您确认下旨'
        : '拟旨尚需完善，请按下方意见补充';
  const issueButtonText = submitting
    ? '正在受理…'
    : jobId
      ? '已创建办理任务'
      : ready
        ? '正式下旨'
        : '请先完善拟旨';
  const canUseSavedObjective = () =>
    mounted.current &&
    !objectiveBusy &&
    !submissionInFlight.current &&
    renderedEpoch === authorizationEpoch.current;

  const saveBeforeRecoveryNavigation = (
    event: MouseEvent<HTMLAnchorElement>
  ) => {
    if (!canUseSavedObjective()) {
      event.preventDefault();
      return;
    }
    if (!objective.trim()) return;
    const saved = saveStudyObjective(() => localStorage, user.id, objective);
    setSavedObjectiveError(!saved);
    if (saved) setSavedObjective(saved);
    else {
      event.preventDefault();
      setSavedObjectiveNotice(
        '未能保存需求，暂未离开上书房。请复制当前内容留存后再打开其他入口。'
      );
    }
  };

  const restoreObjective = () => {
    if (!savedObjective || !canUseSavedObjective()) return;
    ++contextGeneration.current;
    invalidateUnderstanding();
    consult.reset();
    cancel.reset();
    setObjective(savedObjective.objective);
    setCameFromOutcomeCase(false);
    setJobId(undefined);
    setRestorePending(false);
    setSavedObjectiveError(false);
    setSavedObjectiveNotice(
      '已恢复需求文本，请重新咨询丞相并确认理解。尚未创建任务。'
    );
  };

  const chooseMaterial = async (file: File) => {
    if (!canUseSavedObjective()) return;
    // Invalidate approval immediately, before an asynchronous file read can finish.
    invalidateUnderstanding();
    consult.reset();
    setRestorePending(false);
    const generation = materialGeneration.current;
    const epoch = authorizationEpoch.current;
    materialPending.current = true;
    setReadingMaterial(true);
    const isCurrent = () =>
      mounted.current &&
      generation === materialGeneration.current &&
      epoch === authorizationEpoch.current;
    try {
      const material = await readStudyTextMaterial(file);
      if (!isCurrent()) return;
      appendStudyTextMaterial(objective, material);
      setMaterialPreview(material);
    } catch (error) {
      if (!isCurrent()) return;
      materialPending.current = false;
      setMaterialError(true);
      setMaterialNotice(
        error instanceof Error ? error.message : '资料读取失败，请重新选择。'
      );
    } finally {
      if (isCurrent()) setReadingMaterial(false);
    }
  };

  const applyMaterial = () => {
    if (
      !materialPreview ||
      !materialPending.current ||
      readingMaterial ||
      !canUseSavedObjective()
    )
      return;
    const combined = appendStudyTextMaterial(objective, materialPreview);
    ++contextGeneration.current;
    invalidateUnderstanding();
    consult.reset();
    cancel.reset();
    setObjective(combined);
    setCameFromOutcomeCase(false);
    setJobId(undefined);
    setMaterialNotice(
      '已加入需求，尚未上传、保存或办理。请检查内容，再咨询丞相并重新确认理解。'
    );
  };

  const createDraft = () => {
    if (
      !understandingConfirmed ||
      materialPending.current ||
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
      materialPending.current ||
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
              CHANCELLOR DESK
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
            setRestorePending(false);
            setCameFromOutcomeCase(false);
            ++contextGeneration.current;
            invalidateUnderstanding();
            consult.reset();
          }}
          placeholder="说明目标、范围、已有材料、限制条件和期望成果…"
          className="mt-double w-full resize-y border border-brand/20 bg-primary/60 p-base text-sm leading-7 text-normal outline-none placeholder:text-low/60 focus:border-brand/45"
        />
        <div
          className="mt-base border border-brand/15 bg-primary/35 p-base"
          aria-label="文本资料导入"
        >
          <label className="block text-sm text-normal">
            导入文本资料
            <input
              type="file"
              accept=".txt,.md"
              aria-label="导入文本资料"
              disabled={objectiveBusy}
              className="mt-base block w-full text-xs text-normal focus-visible:outline focus-visible:outline-brand"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void chooseMaterial(file);
              }}
            />
          </label>
          <p className="mt-base text-xs leading-relaxed text-low">
            支持 UTF-8 的 TXT、Markdown，每次一个文件，最多 16
            KiB；加入后总需求不得超过 4000 字符。PDF、Word、Excel 暂不支持。
            先在本机预览；点击“咨询丞相”时，需求中的资料会随文字发送到后端及已配置的模型服务。请先移除密钥和不应发送的个人资料。
          </p>
          {readingMaterial && (
            <p role="status" className="mt-base text-xs text-low">
              正在读取资料…
            </p>
          )}
          {materialPreview && (
            <div className="mt-base space-y-base">
              <div className="border border-brand/15 bg-secondary p-base">
                <p className="text-[10px] tracking-[0.18em] text-brand/70">
                  本机已读取 · 待加入需求
                </p>
                <p className="mt-half break-words text-sm text-normal">
                  {materialPreview.name}
                </p>
                <p className="mt-half text-xs leading-relaxed text-low">
                  资料仅在本机预览，尚未发送给丞相或模型。
                </p>
                <details
                  key={`${materialPreview.name}:${materialPreview.text}`}
                  className="mt-base border border-brand/15 bg-primary/40"
                >
                  <summary className="cursor-pointer px-base py-half text-xs text-brand focus-visible:outline focus-visible:outline-brand">
                    查看资料内容
                  </summary>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-brand/15 bg-secondary p-base text-xs text-normal">
                    {materialPreview.text}
                  </pre>
                </details>
              </div>
              <ChaotangButton disabled={objectiveBusy} onClick={applyMaterial}>
                加入当前需求
              </ChaotangButton>
            </div>
          )}
          {(readingMaterial || materialPreview) && (
            <ChaotangButton
              variant="ghost"
              className="mt-base"
              onClick={discardMaterial}
            >
              取消资料导入
            </ChaotangButton>
          )}
          {materialNotice && (
            <p
              role={materialError ? 'alert' : 'status'}
              className={`mt-base text-xs ${materialError ? 'text-error' : 'text-low'}`}
            >
              {materialNotice}
            </p>
          )}
        </div>
        {cameFromOutcomeCase && (
          <p className="mt-base border-l-2 border-brand/55 bg-brand/5 px-base py-half text-xs leading-relaxed text-low">
            已带入案例提纲，可直接修改。此处仍是商议草稿；只有你确认并正式下旨后才会创建任务。
          </p>
        )}
        <div
          className="mt-base border border-brand/15 bg-primary/35 p-base"
          aria-label="本机需求草稿"
        >
          <div className="flex flex-wrap items-center gap-base">
            <ChaotangButton
              disabled={objectiveBusy || !objective.trim()}
              onClick={() => {
                if (!canUseSavedObjective()) return;
                const saved = saveStudyObjective(
                  () => localStorage,
                  user.id,
                  objective
                );
                setRestorePending(false);
                setSavedObjectiveError(!saved);
                if (saved) {
                  setSavedObjective(saved);
                  setSavedObjectiveNotice(
                    '需求已保存到当前设备；不会自动办理。'
                  );
                } else {
                  setSavedObjectiveNotice(
                    '未能保存需求，当前内容仍在编辑框中。请复制留存后再离开。'
                  );
                }
              }}
            >
              保存需求
            </ChaotangButton>
            {savedObjective && (
              <>
                <ChaotangButton
                  disabled={objectiveBusy}
                  onClick={() => {
                    if (!canUseSavedObjective()) return;
                    if (objective && objective !== savedObjective.objective)
                      setRestorePending(true);
                    else restoreObjective();
                  }}
                >
                  恢复已存需求
                </ChaotangButton>
                <ChaotangButton
                  variant="ghost"
                  disabled={objectiveBusy}
                  onClick={() => {
                    if (!canUseSavedObjective()) return;
                    const removed = removeStudyObjective(
                      () => localStorage,
                      user.id
                    );
                    setSavedObjectiveError(!removed);
                    if (removed) {
                      setSavedObjective(undefined);
                      setRestorePending(false);
                      setSavedObjectiveNotice(
                        '已移除本机保存的副本，当前编辑内容仍保留。'
                      );
                    } else
                      setSavedObjectiveNotice('未能移除已存副本，请稍后重试。');
                  }}
                >
                  移除已存副本
                </ChaotangButton>
              </>
            )}
          </div>
          <p className="mt-base text-xs text-low">
            仅保存在当前设备、当前朝堂账户下。恢复后需重新确认，不会自动下旨。
            {savedObjective &&
              (savedObjective.objective === objective
                ? ' 当前内容已保存。'
                : ' 当前内容与已存副本不同。')}
          </p>
          {savedObjectiveNotice && (
            <p
              role={savedObjectiveError ? 'alert' : 'status'}
              className={`mt-base text-xs ${savedObjectiveError ? 'text-error' : 'text-low'}`}
            >
              {savedObjectiveNotice}
            </p>
          )}
          {restorePending && (
            <div
              className="mt-base space-y-base border-l-2 border-brand/50 pl-base"
              role="group"
              aria-label="确认恢复需求"
            >
              <p className="text-xs text-low">
                恢复会替换当前未保存的内容，并清除当前理解确认和拟旨。
              </p>
              <div className="flex flex-wrap gap-base">
                <ChaotangButton
                  disabled={objectiveBusy}
                  onClick={restoreObjective}
                >
                  用已存需求替换
                </ChaotangButton>
                <ChaotangButton
                  variant="ghost"
                  onClick={() => setRestorePending(false)}
                >
                  保留当前内容
                </ChaotangButton>
              </div>
            </div>
          )}
        </div>
        <div className="mt-base flex flex-wrap gap-base">
          <ChaotangButton
            disabled={
              !objective.trim() ||
              readingMaterial ||
              Boolean(materialPreview) ||
              consult.isPending ||
              draft.isPending ||
              submitting
            }
            onClick={() => {
              if (submissionInFlight.current || materialPending.current) return;
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
              readingMaterial ||
              Boolean(materialPreview) ||
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
        {modelConfigurationMissing && (
          <div className="mt-base space-y-base border border-brand/20 bg-primary/35 p-base text-xs text-low">
            <p>
              咨询或拟旨所需的模型配置尚未就绪。当前输入仍保留；打开下面入口前会先保存当前需求到本机，配置完善后可恢复并继续咨询。
              这次失败不会自动创建办理任务。
            </p>
            <div className="flex flex-wrap gap-base">
              <a
                className="text-brand underline focus-visible:outline focus-visible:outline-brand"
                href="/court#models"
                onClick={saveBeforeRecoveryNavigation}
              >
                查看模型设置
              </a>
              <a
                className="text-brand underline focus-visible:outline focus-visible:outline-brand"
                href="/court#hubu"
                onClick={saveBeforeRecoveryNavigation}
              >
                先试用户部现金分析
              </a>
            </div>
          </div>
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
              <h3 className="chaotang-title text-xl text-[#272116]">
                {draftStatusText}
              </h3>
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
                  title="办理范围"
                  items={draft.data.draft.scope ?? []}
                  emptyLabel="尚未列明，请返回补充要求"
                />
                <DraftList
                  title="使用资料"
                  items={draft.data.draft.inputMaterials ?? []}
                  emptyLabel="尚未列明，不代表已读取任何文件"
                />
                <DraftList
                  title="本次不办理"
                  items={draft.data.draft.exclusions ?? []}
                  emptyLabel="尚未列明，不代表允许所有外部动作"
                />
                <DraftList
                  title="完成标准"
                  items={draft.data.draft.completionCriteria ?? []}
                  emptyLabel="尚未列明，请返回补充验收要求"
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
            <StudyResourceBudget />
            <div className="mt-double border border-[#9b8140]/35 bg-white/25 p-base text-sm leading-7 text-[#312a1e]">
              {draft.data.decreeText ?? draft.data.revisionPrompt}
            </div>
            <details className="mt-double border border-[#9b8140]/35 bg-white/25 p-base">
              <summary className="cursor-pointer text-xs text-[#665323] focus-visible:outline focus-visible:outline-[#8f6c22]">
                拟旨详情
              </summary>
              <dl className="mt-base space-y-half text-xs leading-relaxed text-[#4a4133]">
                <div className="flex gap-base">
                  <dt className="shrink-0 text-[#8f6f2a]">状态</dt>
                  <dd className="font-mono">{draft.data.status}</dd>
                </div>
                <div className="flex gap-base">
                  <dt className="shrink-0 text-[#8f6f2a]">版本</dt>
                  <dd className="font-mono">{draft.data.version}</dd>
                </div>
                <div className="flex gap-base">
                  <dt className="shrink-0 text-[#8f6f2a]">指纹</dt>
                  <dd className="break-all font-mono">
                    {draft.data.fingerprint}
                  </dd>
                </div>
              </dl>
            </details>
            <p className="mt-double text-xs leading-relaxed text-[#665323]">
              正式下旨后才创建办理任务；拟旨不代表部门已经执行。
            </p>
            <ChaotangButton
              className="mt-double"
              variant="primary"
              disabled={!ready || submitting || Boolean(jobId)}
              onClick={() => void issueDraft()}
            >
              <PaperPlaneTiltIcon className="size-4" />
              {issueButtonText}
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

function DraftList({
  title,
  items,
  emptyLabel = '无',
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
}) {
  return (
    <section className="border border-[#9b8140]/35 bg-white/25 p-base">
      <p className="text-xs text-[#665323]">{title}</p>
      {items.length ? (
        <ul className="mt-base space-y-half text-xs leading-relaxed text-[#312a1e]">
          {items.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-base text-xs text-[#4a4133]">{emptyLabel}</p>
      )}
    </section>
  );
}
