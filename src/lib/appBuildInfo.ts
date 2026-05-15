/** Injected at build time via vite.config `define`. */
declare const __APP_BUILD_ID__: string;

export function getAppBuildId(): string {
  try {
    return typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'dev';
  } catch {
    return 'dev';
  }
}

export function logAppBuildInfo(): void {
  const id = getAppBuildId();
  if (import.meta.env.DEV) {
    console.info(`[Focus Workspace] build ${id} (dev)`);
    return;
  }
  console.info(`[Focus Workspace] build ${id}`);
}
