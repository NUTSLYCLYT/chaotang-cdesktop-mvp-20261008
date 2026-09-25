import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useChaotangClient,
  type ChaotangClient,
  type DecreeDesktopResources,
} from '@/shared/providers/ChaotangProvider';
import type { TaskTerminal, TaskTerminalClient } from './taskTerminalContract';

const button =
  'rounded border px-base py-half text-normal disabled:opacity-40 hover:bg-secondary focus-visible:ring-1 focus-visible:ring-brand';

function terminalBytes(dataBase64: string): Uint8Array {
  const binary = atob(dataBase64);
  return Uint8Array.from(binary, (value) => value.charCodeAt(0));
}

export function createTerminalReadGate() {
  let reading = false;
  return {
    async run<T>(operation: () => Promise<T>): Promise<T | undefined> {
      if (reading) return undefined;
      reading = true;
      try {
        return await operation();
      } finally {
        reading = false;
      }
    },
  };
}

export function TaskTerminalPanel({
  resources,
  connected,
}: {
  resources: DecreeDesktopResources;
  connected: boolean;
}) {
  const client = useChaotangClient() as ChaotangClient &
    Partial<TaskTerminalClient>;
  const supported =
    resources.terminalAvailable &&
    Boolean(
      client.startTaskTerminal &&
        client.readTaskTerminal &&
        client.writeTaskTerminal &&
        client.closeTaskTerminal
    );
  const [terminal, setTerminal] = useState<TaskTerminal>();
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const after = useRef(0);
  const decoder = useRef(new TextDecoder());
  const readGate = useRef(createTerminalReadGate());

  const append = useCallback((text: string) => {
    setOutput((value) => `${value}${text}`.slice(-256 * 1024));
  }, []);

  useEffect(() => {
    if (!terminal?.active || !client.readTaskTerminal) return;
    let stopped = false;
    const read = async () => {
      try {
        const value = await readGate.current.run(() =>
          client.readTaskTerminal!({
            jobId: resources.jobId,
            terminalId: terminal.terminalId,
            afterSequence: after.current,
          })
        );
        if (stopped || !value) return;
        if (value.truncated) append('\r\n[较早输出已被安全截断]\r\n');
        for (const entry of value.entries) {
          append(
            decoder.current.decode(terminalBytes(entry.dataBase64), {
              stream: true,
            })
          );
          after.current = entry.sequence;
        }
        if (!value.active)
          setTerminal((current) => current && { ...current, active: false });
      } catch (cause) {
        if (!stopped)
          setError(cause instanceof Error ? cause.message : '终端输出读取失败');
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [append, client.readTaskTerminal, resources.jobId, terminal]);

  return (
    <TaskTerminalView
      supported={supported}
      connected={connected}
      terminalId={terminal?.terminalId}
      active={terminal?.active}
      output={output}
      input={input}
      busy={busy}
      error={error}
      onStart={() => {
        if (!client.startTaskTerminal || busy) return;
        setBusy(true);
        setError('');
        after.current = 0;
        decoder.current = new TextDecoder();
        setOutput('');
        void client
          .startTaskTerminal({ jobId: resources.jobId, cols: 100, rows: 30 })
          .then(setTerminal)
          .catch((cause) =>
            setError(
              cause instanceof Error ? cause.message : '任务终端启动失败'
            )
          )
          .finally(() => setBusy(false));
      }}
      onInputChange={setInput}
      onSend={() => {
        if (!client.writeTaskTerminal || !terminal?.active || !input || busy)
          return;
        setBusy(true);
        setError('');
        const data = input.endsWith('\r') ? input : `${input}\r`;
        void client
          .writeTaskTerminal({
            jobId: resources.jobId,
            terminalId: terminal.terminalId,
            data,
          })
          .then(() => setInput(''))
          .catch((cause) =>
            setError(
              cause instanceof Error ? cause.message : '终端输入发送失败'
            )
          )
          .finally(() => setBusy(false));
      }}
      onClose={() => {
        if (!client.closeTaskTerminal || !terminal || busy) return;
        setBusy(true);
        setError('');
        void client
          .closeTaskTerminal({
            jobId: resources.jobId,
            terminalId: terminal.terminalId,
          })
          .then(() => setTerminal(undefined))
          .catch((cause) =>
            setError(cause instanceof Error ? cause.message : '终端关闭失败')
          )
          .finally(() => setBusy(false));
      }}
    />
  );
}

export function TaskTerminalView({
  supported,
  connected,
  terminalId,
  active = true,
  output,
  input,
  busy,
  error,
  onStart,
  onInputChange,
  onSend,
  onClose,
}: {
  supported: boolean;
  connected: boolean;
  terminalId?: string;
  active?: boolean;
  output: string;
  input: string;
  busy: boolean;
  error?: string;
  onStart: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="任务终端"
      className="space-y-base rounded border p-base"
    >
      <h3 className="text-lg text-high">任务终端</h3>
      {!supported ? (
        <p>当前客户端暂不支持任务终端，请更新桌面客户端。</p>
      ) : !terminalId ? (
        <>
          <p className="text-low">
            终端仅在当前任务的专属目录中运行，并随本次登录关闭。
          </p>
          <button
            type="button"
            className={button}
            disabled={!connected || busy}
            onClick={onStart}
          >
            {busy ? '正在启动…' : '启动或恢复任务终端'}
          </button>
        </>
      ) : (
        <>
          <pre className="max-h-80 min-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-secondary p-base font-ibm-plex-mono text-sm text-normal">
            {output || '终端已启动，等待输出…'}
          </pre>
          {active ? (
            <div className="flex gap-half">
              <input
                aria-label="终端命令"
                className="min-w-0 flex-1 rounded border bg-secondary px-base py-half font-ibm-plex-mono text-normal focus:outline-none focus:ring-1 focus:ring-brand"
                value={input}
                disabled={!connected || busy}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSend();
                }}
              />
              <button
                type="button"
                className={button}
                disabled={!connected || busy || !input}
                onClick={onSend}
              >
                发送命令
              </button>
            </div>
          ) : (
            <p role="status">终端进程已结束。</p>
          )}
          <button
            type="button"
            className={button}
            disabled={!connected || busy}
            onClick={onClose}
          >
            关闭终端
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </section>
  );
}
