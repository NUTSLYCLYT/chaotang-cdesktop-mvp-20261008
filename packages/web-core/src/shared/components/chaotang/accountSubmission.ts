export type AccountMode = 'login' | 'register';

type AccountRequest =
  | { mode: 'login'; identifier: string; password: string }
  | { mode: 'register'; username: string; email: string; password: string };

type AccountActions = {
  login(identifier: string, password: string): Promise<void>;
  register(username: string, email: string, password: string): Promise<void>;
};

/** UI duplicate guard only. Account identity and session authority stay in the provider. */
export function createAccountSubmission() {
  let pending = false;
  const submit = async (request: AccountRequest, actions: AccountActions) => {
    if (pending) return false;
    pending = true;
    try {
      if (request.mode === 'login') {
        await actions.login(request.identifier.trim(), request.password);
      } else {
        await actions.register(
          request.username.trim(),
          request.email.trim(),
          request.password
        );
      }
      return true;
    } finally {
      pending = false;
    }
  };
  return Object.assign(submit, { isPending: () => pending });
}
