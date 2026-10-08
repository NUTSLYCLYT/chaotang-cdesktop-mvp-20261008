/** The browser trial is opt-in; ordinary desktop builds keep native commands. */
export function shouldUseLocalTrialTransport(input: {
  dev: boolean;
  acceptance: string | undefined;
  localTrial: string | undefined;
  protocol: string;
  hostname: string;
  nativeShell: boolean;
}): boolean {
  return (
    !input.nativeShell &&
    input.protocol === 'http:' &&
    input.hostname === '127.0.0.1' &&
    (input.localTrial === '1' || (input.dev && input.acceptance === '1'))
  );
}
