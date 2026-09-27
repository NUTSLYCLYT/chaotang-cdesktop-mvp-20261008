import { describe, expect, it, vi } from 'vitest';
import { createAccountSubmission } from './accountSubmission';

describe('account entry submission', () => {
  it('sends registration to the existing provider and preserves password whitespace', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const login = vi.fn();
    const submit = createAccountSubmission();
    expect(
      await submit(
        {
          mode: 'register',
          username: ' new-user ',
          email: ' a@b.test ',
          password: ' secret ',
        },
        { login, register }
      )
    ).toBe(true);
    expect(register).toHaveBeenCalledWith('new-user', 'a@b.test', ' secret ');
    expect(login).not.toHaveBeenCalled();
  });

  it('does not duplicate an in-flight request and allows a later explicit login', async () => {
    let resolve!: () => void;
    const login = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          })
      )
      .mockResolvedValue(undefined);
    const register = vi.fn();
    const submit = createAccountSubmission();
    const request = {
      mode: 'login' as const,
      identifier: ' owner ',
      password: ' password ',
    };
    const first = submit(request, { login, register });
    expect(await submit(request, { login, register })).toBe(false);
    expect(login).toHaveBeenCalledTimes(1);
    resolve();
    expect(await first).toBe(true);
    expect(await submit(request, { login, register })).toBe(true);
    expect(login).toHaveBeenLastCalledWith('owner', ' password ');
    expect(register).not.toHaveBeenCalled();
  });

  it('releases the submission guard after a server failure so retry works', async () => {
    const login = vi
      .fn()
      .mockRejectedValueOnce(new Error('账户服务暂时不可用'))
      .mockResolvedValue(undefined);
    const register = vi.fn();
    const submit = createAccountSubmission();
    const request = {
      mode: 'login' as const,
      identifier: 'owner',
      password: 'password',
    };
    await expect(submit(request, { login, register })).rejects.toThrow(
      '账户服务暂时不可用'
    );
    expect(await submit(request, { login, register })).toBe(true);
    expect(login).toHaveBeenCalledTimes(2);
  });
});
