export const desktopRuntimeMessage =
  '当前浏览器未连接朝堂桌面服务。请打开“朝堂 AI OS”桌面程序进入朝堂工作区；浏览器验收请使用已配置的验收入口。';

export class DesktopRuntimeUnavailableError extends Error {
  constructor() {
    super(desktopRuntimeMessage);
    this.name = 'DesktopRuntimeUnavailableError';
  }
}

export function assertDesktopRuntime(runtime: unknown = globalThis): void {
  const internals = (
    runtime as { __TAURI_INTERNALS__?: { invoke?: unknown } } | null
  )?.__TAURI_INTERNALS__;
  if (typeof internals?.invoke !== 'function') {
    throw new DesktopRuntimeUnavailableError();
  }
}
