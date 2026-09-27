import { useId, useRef, useState } from 'react';
import { useChaotangProvider } from '@/shared/providers/ChaotangProvider';
import { createAccountSubmission, type AccountMode } from './accountSubmission';

const inputClass =
  'mt-1 w-full border border-[#d7b36a]/25 bg-black/25 px-3 py-2 text-sm text-[#eee7d4] outline-none focus:border-[#d7b36a] disabled:opacity-50';

/** Shared entry for the original court panel and its primary navigation. */
export function ChaotangAccountForm({
  mode,
  onModeChange,
}: {
  mode: AccountMode;
  onModeChange: (mode: AccountMode) => void;
}) {
  const { login, register } = useChaotangProvider();
  const id = useId();
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submit = useRef(createAccountSubmission());

  return (
    <form
      aria-label={mode === 'login' ? '登录朝堂账户' : '注册朝堂账户'}
      aria-busy={pending}
      className="space-y-4 text-sm text-[#eee7d4]"
      onSubmit={(event) => {
        event.preventDefault();
        if (submit.current.isPending()) return;
        setPending(true);
        setError(undefined);
        const request =
          mode === 'login'
            ? { mode, identifier, password }
            : { mode, username, email, password };
        void submit
          .current(request, { login, register })
          .catch((cause: unknown) => {
            setError(
              cause instanceof Error && cause.message
                ? cause.message
                : '账户请求未完成，请检查连接后重试。'
            );
          })
          .finally(() => {
            setPassword('');
            setPending(false);
          });
      }}
    >
      <div className="flex flex-wrap gap-2" aria-label="账户办理方式">
        {(['login', 'register'] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={pending}
            aria-pressed={mode === choice}
            onClick={() => {
              setPassword('');
              setError(undefined);
              onModeChange(choice);
            }}
            className={`border px-3 py-2 disabled:opacity-50 ${
              mode === choice
                ? 'border-[#d7b36a]/50 bg-[#d7b36a]/10 text-[#f2d99b]'
                : 'border-[#d7b36a]/20 text-[#aaa99f]'
            }`}
          >
            {choice === 'login' ? '登录已有账户' : '注册新账户'}
          </button>
        ))}
      </div>
      {mode === 'login' ? (
        <label className="block" htmlFor={`${id}-identifier`}>
          用户名或邮箱
          <input
            id={`${id}-identifier`}
            name="identifier"
            required
            maxLength={254}
            disabled={pending}
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className={inputClass}
          />
        </label>
      ) : (
        <>
          <label className="block" htmlFor={`${id}-username`}>
            用户名
            <input
              id={`${id}-username`}
              name="username"
              required
              maxLength={254}
              disabled={pending}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block" htmlFor={`${id}-email`}>
            邮箱
            <input
              id={`${id}-email`}
              name="email"
              required
              type="email"
              maxLength={254}
              disabled={pending}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </label>
        </>
      )}
      <label className="block" htmlFor={`${id}-password`}>
        密码
        <input
          id={`${id}-password`}
          name="password"
          required
          type="password"
          minLength={mode === 'register' ? 6 : undefined}
          maxLength={1024}
          disabled={pending}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          aria-describedby={
            mode === 'register' ? `${id}-password-hint` : undefined
          }
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </label>
      {mode === 'register' && (
        <p id={`${id}-password-hint`} className="text-xs text-[#aaa99f]">
          密码至少 6 位。账户用于保存你的任务与成果。
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full border border-[#d7b36a]/50 bg-[#d7b36a]/10 px-4 py-3 text-[#f2d99b] disabled:cursor-wait disabled:opacity-50"
      >
        {pending
          ? mode === 'login'
            ? '登录中…'
            : '正在创建账户…'
          : mode === 'login'
            ? '登录朝堂'
            : '创建账户'}
      </button>
    </form>
  );
}
