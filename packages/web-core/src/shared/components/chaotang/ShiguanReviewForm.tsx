import { useState, type FormEvent } from 'react';
import { useShiguanReview } from '@/shared/hooks/chaotang/useShiguan';
import type {
  ShiguanArchive,
  ShiguanReviewStatusValue,
} from '@/shared/providers/ChaotangProvider';
import { ChaotangButton } from './ChaotangPrimitives';

const statuses: [ShiguanReviewStatusValue, string][] = [
  ['OBSERVING', '继续观察'],
  ['ACHIEVED', '目标已达成'],
  ['PARTIAL', '部分达成'],
  ['NOT_ACHIEVED', '未达成'],
];

export function ShiguanReviewForm({ archive }: { archive: ShiguanArchive }) {
  const review = useShiguanReview();
  const [status, setStatus] = useState<ShiguanReviewStatusValue>(
    archive.reviewStatus?.status ?? 'OBSERVING'
  );
  const [note, setNote] = useState(archive.reviewStatus?.note ?? '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (review.isPending || !note.trim()) return;
    review.mutate({ archiveId: archive.id, status, note: note.trim() });
  };
  return (
    <form
      onSubmit={submit}
      className="mt-double space-y-base border-t border-[#9b8140]/30 pt-double"
    >
      <h3 className="chaotang-title text-lg text-[#272116]">
        这次成果实际帮到你了吗？
      </h3>
      <p className="text-xs text-[#786f5d]">
        这是你的效果复盘，不代表独立验收通过，也不会自动改变原成果的批准状态。
      </p>
      <label className="block text-sm text-[#312a1e]">
        实际效果
        <select
          value={status}
          disabled={review.isPending}
          onChange={(event) => {
            review.reset();
            setStatus(event.target.value as ShiguanReviewStatusValue);
          }}
          className="mt-half block w-full border border-[#9b8140]/40 bg-white/40 p-base"
        >
          {statuses.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-[#312a1e]">
        依据与改进建议
        <textarea
          value={note}
          disabled={review.isPending}
          maxLength={2000}
          rows={3}
          onChange={(event) => {
            review.reset();
            setNote(event.target.value);
          }}
          placeholder="实际采用了什么？效果如何？下一次需要改进什么？"
          className="mt-half block w-full border border-[#9b8140]/40 bg-white/40 p-base"
        />
      </label>
      <ChaotangButton type="submit" disabled={review.isPending || !note.trim()}>
        {review.isPending ? '保存中…' : '保存复盘'}
      </ChaotangButton>
      {review.isError && (
        <p role="alert" className="text-sm text-[#9a372b]">
          复盘未保存，请检查连接后重试。填写内容仍保留。
        </p>
      )}
      {review.isSuccess && (
        <p role="status" className="text-sm text-[#386448]">
          复盘已保存，可在档案和旧案查询中查看。
        </p>
      )}
    </form>
  );
}
