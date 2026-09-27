import { ValidatedDecreeResult } from './CourtWorkspace';
import { decreeIdempotencyKey } from '@/shared/lib/chaotangFusion';
import { useEffect, useState } from 'react';
import {
  CheckCircleIcon,
  ChatCircleTextIcon,
  PaperPlaneTiltIcon,
  ScrollIcon,
  ShieldCheckIcon,
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

export function ChancellorStudyWorkspace() {
  const { user } = useChaotangProvider();
  return <ChancellorStudySession key={user?.id ?? 'anonymous'} />;
}

function ChancellorStudySession() {
  const { user, health } = useChaotangProvider();
  const [objective, setObjective] = useState('');
  const [cameFromOutcomeCase, setCameFromOutcomeCase] = useState(false);
  const [draftVersion, setDraftVersion] = useState(1);
  const [jobId, setJobId] = useState<string>();
  const [understandingConfirmed, setUnderstandingConfirmed] = useState(false);
  const consult = useChancellorConsult();
  const draft = useChancellorDraft();
  const issue = useIssueChancellorDecree();
  const job = useDecreeJob(jobId);
  const cancel = useCancelDecreeJob();

  useEffect(() => {
    if (!user) return;
    const pendingIntent = consumePendingOutcomeIntent(sessionStorage);
    if (pendingIntent) {
      setObjective(pendingIntent);
      setCameFromOutcomeCase(true);
    }
    const storedJobId = sessionStorage.getItem(activeJobKey(user.id));
    if (storedJobId) setJobId(storedJobId);
  }, [user]);

  useEffect(() => {
    if (!user || !jobId || !job.data) return;
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.data.state)) {
      sessionStorage.removeItem(activeJobKey(user.id));
    }
  }, [job.data, jobId, user]);

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center text-sm text-low">
        {!user ? '请先登录朝堂账户' : '朝堂后端未连接'}
      </ChaotangPanel>
    );
  }

  const ready = draft.data?.status === 'DRAFT_READY' && draft.data.decreeText;
  const error =
    consult.error?.message ??
    draft.error?.message ??
    issue.error?.message ??
    job.error?.message;

  const createDraft = () => {
    if (!understandingConfirmed) return;
    draft.reset();
    issue.reset();
    setJobId(undefined);
    draft.mutate({
      messages: [{ role: 'user', content: objective.trim() }],
      version: draftVersion,
    });
  };

  const issueDraft = async () => {
    if (!ready || !draft.data) return;
    const accepted = await issue.mutateAsync({
      decreeText: draft.data.decreeText!,
      draftVersion: draft.data.version,
      draftFingerprint: draft.data.fingerprint,
      idempotencyKey: await decreeIdempotencyKey(
        user.id,
        draft.data.fingerprint
      ),
    });
    setJobId(accepted.jobId);
    sessionStorage.setItem(activeJobKey(user.id), accepted.jobId);
    setDraftVersion(draft.data.version + 1);
  };

  return (
    <div className="space-y-double">
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
          active={understandingConfirmed && !draft.data}
          complete={Boolean(draft.data)}
        />
        <Phase
          label="预览下旨"
          active={Boolean(draft.data && !jobId)}
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
          disabled={consult.isPending || draft.isPending || issue.isPending}
          value={objective}
          onChange={(event) => {
            setObjective(event.target.value);
            setCameFromOutcomeCase(false);
            setUnderstandingConfirmed(false);
            consult.reset();
            draft.reset();
            issue.reset();
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
            disabled={!objective.trim() || consult.isPending || draft.isPending}
            onClick={() => {
              setUnderstandingConfirmed(false);
              draft.reset();
              consult.mutate([{ role: 'user', content: objective.trim() }]);
            }}
          >
            <ChatCircleTextIcon className="size-4" />
            {consult.isPending ? '丞相思考中…' : '咨询丞相'}
          </ChaotangButton>
          <ChaotangButton
            variant="primary"
            disabled={
              !understandingConfirmed || consult.isPending || draft.isPending
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
          <p className="mt-base border border-error/25 bg-error/5 p-base text-xs text-error">
            {error}
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
                <p className="flex items-center gap-base text-sm text-[#516438]">
                  <CheckCircleIcon className="size-5" weight="duotone" />
                  理解已确认，可以形成拟旨。
                </p>
              ) : (
                <div className="flex flex-wrap gap-base">
                  <button
                    type="button"
                    onClick={() => setUnderstandingConfirmed(true)}
                    className="border border-[#8f6c22] bg-[#d8bd69] px-double py-base text-sm font-semibold text-[#282014] hover:bg-[#e2ca7e]"
                  >
                    确认理解无误
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUnderstandingConfirmed(false);
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

      {draft.data && (
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
              disabled={!ready || issue.isPending || Boolean(jobId)}
              onClick={() => void issueDraft()}
            >
              <PaperPlaneTiltIcon className="size-4" />
              {issue.isPending
                ? '正在受理…'
                : ready
                  ? '正式下旨'
                  : '尚未达到 DRAFT_READY'}
            </ChaotangButton>
          </div>
        </section>
      )}

      {jobId && (
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <ShieldCheckIcon className="size-5 text-brand" weight="duotone" />
            <h3 className="chaotang-title text-xl text-high">旨意任务</h3>
          </div>
          <div className="mt-double grid gap-base sm:grid-cols-4">
            <Metric label="Job ID" value={jobId} mono />
            <Metric label="公开状态" value={job.data?.state ?? 'QUEUED'} />
            <Metric label="内部阶段" value={job.data?.stage ?? 'QUEUED'} />
            <Metric
              label="模型请求"
              value={String(job.data?.providerRequestCount ?? 0)}
            />
          </div>
          {job.data?.error && (
            <p className="mt-base border border-error/25 bg-error/5 p-base text-xs text-error">
              {job.data.error.code} · {job.data.error.stage} ·{' '}
              {job.data.error.category}
            </p>
          )}
          {job.data?.result && (
            <ValidatedDecreeResult value={job.data.result} />
          )}
          {job.data && ['QUEUED', 'RUNNING'].includes(job.data.state) && (
            <ChaotangButton
              className="mt-base"
              disabled={cancel.isPending || job.data.cancelRequested}
              onClick={() => cancel.mutate(jobId)}
            >
              {job.data.cancelRequested ? '已请求取消' : '请求取消'}
            </ChaotangButton>
          )}
        </ChaotangPanel>
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

function Metric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 border border-brand/15 bg-primary/35 p-base">
      <p className="text-[9px] text-low">{label}</p>
      <p
        className={`mt-half truncate text-xs text-normal ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}
