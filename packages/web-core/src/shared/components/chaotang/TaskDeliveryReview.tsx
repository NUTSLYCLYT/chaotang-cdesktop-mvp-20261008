import { useEffect, useRef, useState } from 'react';
import {
  useChaotangClient,
  useChaotangProvider,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangButton, ChaotangPanel } from './ChaotangPrimitives';
import {
  decodeTaskDeliveryReview,
  deliveryCheckLabels,
  type TaskDeliveryReceipt,
} from './taskDeliveryReviewContract';

type ViewState = {
  identity: string;
  phase: 'idle' | 'pending' | 'done' | 'error';
  receipt?: TaskDeliveryReceipt;
};
const checkState = { PASS: '通过', FAIL: '未通过', NOT_VERIFIED: '未核实' };

export function TaskDeliveryReview({
  jobId,
  jobState,
  jobVersion,
}: {
  jobId: string;
  jobState: string;
  jobVersion: string;
}) {
  const client = useChaotangClient();
  const { user, health, authGeneration } = useChaotangProvider();
  const identity = JSON.stringify([
    user?.id,
    authGeneration,
    jobId,
    jobState,
    jobVersion,
  ]);
  const latest = useRef(identity);
  latest.current = identity;
  const lifecycle = useRef({ active: false, busy: false, identity });
  const [saved, setSaved] = useState<ViewState>({ identity, phase: 'idle' });
  const view: ViewState =
    saved.identity === identity ? saved : { identity, phase: 'idle' };
  useEffect(() => {
    const current = { active: true, busy: false, identity };
    lifecycle.current = current;
    setSaved({ identity, phase: 'idle' });
    return () => {
      current.active = false;
    };
  }, [identity]);
  const available = Boolean(
    user && health && client.reviewDecreeDelivery && jobState === 'SUCCEEDED'
  );
  const review = async () => {
    const request = lifecycle.current;
    if (
      !available ||
      !client.reviewDecreeDelivery ||
      !request.active ||
      request.busy ||
      request.identity !== identity
    )
      return;
    request.busy = true;
    setSaved({ identity, phase: 'pending' });
    const isCurrent = () => request.active && latest.current === identity;
    try {
      const value = await client.reviewDecreeDelivery(jobId);
      if (!isCurrent()) return;
      const receipt = decodeTaskDeliveryReview(value, jobId);
      setSaved({ identity, phase: 'done', receipt });
    } catch {
      if (isCurrent()) setSaved({ identity, phase: 'error' });
    } finally {
      request.busy = false;
    }
  };
  return (
    <ChaotangPanel className="space-y-base p-double">
      <h3 className="chaotang-title text-lg text-high">
        翰林院 · 交付结构核验
      </h3>
      <p className="text-sm text-low">
        核对任务、成果、文件与史馆的关联，不调用模型。结构通过不代表证据内容真实、业务质量合格或已获发布批准。
      </p>
      <ChaotangButton
        onClick={review}
        disabled={!available || view.phase === 'pending'}
        aria-busy={view.phase === 'pending'}
      >
        {view.phase === 'pending'
          ? '正在核验…'
          : view.phase === 'error'
            ? '重试结构核验'
            : view.receipt
              ? '重新核验当前交付'
              : '请翰林院核验交付结构'}
      </ChaotangButton>
      {!available && (
        <p className="text-xs text-low">
          {jobState !== 'SUCCEEDED'
            ? '任务尚未成功结束，完成后可核验交付。'
            : !client.reviewDecreeDelivery
              ? '当前客户端尚未接入结构核验，请使用已接通的试用入口。'
              : '请登录并连接朝堂服务后核验。'}
        </p>
      )}
      {view.phase === 'error' && (
        <p role="alert" className="text-sm text-error">
          未取得匹配的核验回执，请确认会话与服务正常后重试。任务和成果不会因此被标记通过。
        </p>
      )}
      {view.receipt && <TaskDeliveryReceiptView receipt={view.receipt} />}
    </ChaotangPanel>
  );
}

export function TaskDeliveryReceiptView({
  receipt,
}: {
  receipt: TaskDeliveryReceipt;
}) {
  return (
    <div className="space-y-base text-sm text-normal">
      <p
        role="status"
        className={receipt.state === 'PASSED' ? 'text-success' : 'text-error'}
      >
        {receipt.state === 'PASSED'
          ? '交付结构核验通过'
          : receipt.state === 'FAILED'
            ? '交付结构核验未通过'
            : '交付结构仍有未核实项'}
      </p>
      <p>业务质量：尚未评估。证据真伪：本次未作内容核验。</p>
      <p className="text-xs text-low">
        核验时间：{receipt.reviewed_at}
        。这是该时点的回执；成果变化后请重新核验。
      </p>
      <ul className="space-y-base">
        {receipt.checks.map((item) => (
          <li key={item.check_id} className="border-t border-brand/15 pt-base">
            <p>
              {deliveryCheckLabels[item.check_id]}：{checkState[item.state]}
            </p>
            <p className="mt-half whitespace-pre-wrap text-low">
              {item.detail}
            </p>
            {item.evidence.length > 0 && (
              <details className="mt-half text-xs text-low">
                <summary>查看关联记录</summary>
                <ul>
                  {item.evidence.map((ref, index) => (
                    <li key={index} className="break-all">
                      {ref}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      <details className="text-xs text-low">
        <summary>核验回执凭据</summary>
        <p className="break-all">任务：{receipt.job_id}</p>
        <p className="break-all">回执：{receipt.review_id}</p>
        <p className="break-all">摘要：{receipt.review_digest}</p>
      </details>
    </div>
  );
}
