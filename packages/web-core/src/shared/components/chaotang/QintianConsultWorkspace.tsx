import { useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowUpIcon,
  ChatCircleTextIcon,
  EraserIcon,
  ShieldCheckIcon,
  SparkleIcon,
  UserCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { useQintianConsult } from '@/shared/hooks/chaotang/useQintianConsult';
import {
  useChaotangProvider,
  type QintianConsultMessage,
} from '@/shared/providers/ChaotangProvider';
import {
  ChaotangButton,
  ChaotangPanel,
} from '@/shared/components/chaotang/ChaotangPrimitives';

const SUGGESTIONS = [
  '这项决策最需要验证的前提是什么？',
  '如果先小范围试行，应观察哪些信号？',
  '请从乐观、基准和悲观三个角度分析。',
] as const;

export function QintianConsultWorkspace() {
  const { user, health } = useChaotangProvider();
  const consult = useQintianConsult();
  const [messages, setMessages] = useState<QintianConsultMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string>();

  if (!user || !health) {
    return (
      <ChaotangPanel className="p-double text-center">
        <h2 className="chaotang-title text-xl text-high">
          {!user ? '请先登录朝堂账户' : '钦天监服务未连接'}
        </h2>
        <p className="mt-base text-sm text-low">
          即时问策需要认证，但不会创建正式推演或业务档案。
        </p>
      </ChaotangPanel>
    );
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const question = draft.trim();
    if (!question || question.length > 4000 || consult.isPending) return;

    const prior = messages.slice(-18);
    const request: QintianConsultMessage[] = [
      ...prior,
      { role: 'user', content: question },
    ];
    setPendingQuestion(question);
    consult.reset();
    try {
      const response = await consult.mutateAsync(request);
      setMessages([
        ...prior,
        { role: 'user', content: question },
        { role: 'assistant', content: response.reply },
      ]);
      setDraft('');
      setPendingQuestion(undefined);
    } catch {
      setPendingQuestion(undefined);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="grid gap-double xl:grid-cols-[1.35fr_0.7fr]">
      <ChaotangPanel className="flex min-h-[650px] flex-col p-double">
        <div className="flex flex-wrap items-start justify-between gap-base border-b border-brand/15 pb-double">
          <div>
            <p className="text-[9px] tracking-[0.24em] text-brand/55">
              EPHEMERAL CONSULTATION
            </p>
            <h2 className="chaotang-title mt-half text-2xl text-high">
              即时问策
            </h2>
            <p className="mt-base text-xs leading-relaxed text-low">
              与钦天监进行当前会话内的决策讨论，不保存为正式推演。
            </p>
          </div>
          <span className="border border-success/30 bg-success/10 px-base py-half text-[9px] tracking-[0.14em] text-success">
            LIVE · 非持久化
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-double pr-half">
          {messages.length === 0 && !pendingQuestion ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <SparkleIcon className="size-10 text-brand/55" weight="duotone" />
              <h3 className="chaotang-title mt-base text-xl text-high">
                你想研判什么？
              </h3>
              <p className="mt-base max-w-lg text-xs leading-relaxed text-low">
                适合澄清假设、比较情景和识别验证信号。若要形成可追踪结论，请转入“正式推演”。
              </p>
              <div className="mt-double grid w-full max-w-2xl gap-half">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    className="border border-brand/15 bg-primary/35 px-base py-base text-left text-xs text-normal hover:border-brand/35 hover:bg-brand/5"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-double">
              {messages.map((message, index) => (
                <MessageBubble
                  key={`${index}-${message.role}`}
                  message={message}
                />
              ))}
              {pendingQuestion && (
                <>
                  <MessageBubble
                    message={{ role: 'user', content: pendingQuestion }}
                  />
                  <div className="flex items-start gap-base">
                    <div className="flex size-8 shrink-0 items-center justify-center border border-brand/25 bg-brand/5 text-brand">
                      <SparkleIcon className="size-4 animate-pulse" />
                    </div>
                    <p className="border border-brand/15 bg-primary/40 px-base py-base text-xs text-low">
                      钦天监正在研判…
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {consult.isError && (
          <div className="mb-base flex items-start gap-base border border-error/25 bg-error/5 px-base py-base text-xs text-error">
            <WarningIcon className="mt-half size-4 shrink-0" />
            <span>{consult.error.message}</span>
          </div>
        )}

        <form onSubmit={submit} className="border-t border-brand/15 pt-double">
          <div className="border border-brand/25 bg-primary/55 p-base focus-within:border-brand/55">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
              onKeyDown={onKeyDown}
              placeholder="输入需要钦天监研判的问题…"
              rows={3}
              disabled={consult.isPending}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-normal outline-none placeholder:text-low disabled:opacity-60"
            />
            <div className="mt-base flex items-center justify-between gap-base">
              <span className="text-[9px] text-low">
                {draft.length}/4000 · Enter 发送 · Shift+Enter 换行
              </span>
              <button
                type="submit"
                aria-label="发送即时问策"
                disabled={!draft.trim() || consult.isPending}
                className="flex size-9 items-center justify-center border border-brand/40 bg-brand/10 text-brand hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ArrowUpIcon className="size-4" weight="bold" />
              </button>
            </div>
          </div>
        </form>
      </ChaotangPanel>

      <div className="flex flex-col gap-double">
        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <ShieldCheckIcon className="size-5 text-success" weight="duotone" />
            <h3 className="chaotang-title text-lg text-high">问策边界</h3>
          </div>
          <ul className="mt-double space-y-base text-xs leading-relaxed text-low">
            <li>不创建正式推演、旨意、任务或史馆档案。</li>
            <li>不触发六部执行、MCP 工具或连接器同步。</li>
            <li>服务端不保存本次对话；客户端仅保留当前页面内存。</li>
            <li>结果是决策辅助，不替代人工判断与正式审批。</li>
          </ul>
        </ChaotangPanel>

        <ChaotangPanel className="p-double">
          <div className="flex items-center gap-base">
            <ChatCircleTextIcon
              className="size-5 text-brand"
              weight="duotone"
            />
            <h3 className="chaotang-title text-lg text-high">会话状态</h3>
          </div>
          <div className="mt-double space-y-base text-sm">
            <Row label="咨询者" value="钦天监" />
            <Row label="已完成轮次" value={String(messages.length / 2)} />
            <Row label="服务端持久化" value="否" />
            <Row label="当前账户" value={user.username} />
          </div>
          <ChaotangButton
            className="mt-double"
            onClick={() => {
              setMessages([]);
              setDraft('');
              setPendingQuestion(undefined);
              consult.reset();
            }}
            disabled={consult.isPending || (messages.length === 0 && !draft)}
          >
            <EraserIcon className="size-4" />
            清空当前会话
          </ChaotangButton>
        </ChaotangPanel>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: QintianConsultMessage }) {
  const isUser = message.role === 'user';
  const Icon = isUser ? UserCircleIcon : SparkleIcon;
  return (
    <div className={`flex items-start gap-base ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center border border-brand/25 bg-brand/5 text-brand">
          <Icon className="size-4" weight="duotone" />
        </div>
      )}
      <div
        className={`max-w-[82%] border px-base py-base text-sm leading-7 ${
          isUser
            ? 'border-brand/30 bg-brand/10 text-high'
            : 'border-brand/15 bg-primary/40 text-normal'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
      {isUser && (
        <div className="flex size-8 shrink-0 items-center justify-center border border-brand/25 bg-brand/5 text-brand">
          <Icon className="size-4" weight="duotone" />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-base border-b border-brand/10 pb-base">
      <span className="text-low">{label}</span>
      <span className="text-right text-normal">{value}</span>
    </div>
  );
}
