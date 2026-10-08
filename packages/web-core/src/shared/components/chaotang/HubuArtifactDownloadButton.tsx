import { useEffect, useRef, useState } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { useHubuArtifactDownload } from '@/shared/hooks/chaotang/useHubu';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { ChaotangButton } from './ChaotangPrimitives';

export function HubuArtifactDownloadButton({
  artifactId,
  published,
}: {
  artifactId: string;
  published: boolean;
}) {
  const download = useHubuArtifactDownload();
  const { user, authGeneration } = useChaotangProvider();
  const identity = `${user?.id ?? ''}:${authGeneration}:${artifactId}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const lifecycle = useRef({ active: false, busy: false });
  const [status, setStatus] = useState<'idle' | 'pending' | 'sent' | 'error'>(
    'idle'
  );
  useEffect(() => {
    const current = { active: true, busy: false };
    lifecycle.current = current;
    setStatus('idle');
    return () => {
      current.active = false;
    };
  }, [identity]);

  const handleDownload = async () => {
    const request = lifecycle.current;
    if (!user || !published || !request.active || request.busy) return;
    request.busy = true;
    setStatus('pending');
    const isCurrent = () =>
      request.active && currentIdentity.current === identity;
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const file = await download.mutateAsync(artifactId);
      if (!isCurrent()) return;
      url = URL.createObjectURL(
        new Blob([new Uint8Array(file.bytes)], { type: file.mimeType })
      );
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      setStatus('sent');
    } catch {
      if (isCurrent()) setStatus('error');
    } finally {
      anchor?.remove();
      if (url) URL.revokeObjectURL(url);
      request.busy = false;
    }
  };

  return (
    <div className="space-y-half">
      <ChaotangButton
        onClick={handleDownload}
        disabled={!user || !published || status === 'pending'}
        aria-busy={status === 'pending'}
      >
        <DownloadSimpleIcon className="size-4" />
        {status === 'pending'
          ? '下载中…'
          : status === 'error'
            ? '重试下载'
            : '下载 XLSX'}
      </ChaotangButton>
      {status === 'sent' && (
        <p role="status" className="text-xs text-success">
          已交给浏览器下载，请在下载记录中确认文件。
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="text-xs text-error">
          下载未完成，请重试；若仍失败，请刷新页面确认成果仍可下载。
        </p>
      )}
      {!published && (
        <p className="text-xs text-low">文件尚未发布，暂时不能下载。</p>
      )}
    </div>
  );
}
