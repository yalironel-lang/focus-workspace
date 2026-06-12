/** Injected at build time via vite.config `define`. */
declare const __APP_BUILD_ID__: string;
declare const __GIT_COMMIT__: string;

export function getAppBuildId(): string {
  try {
    return typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'dev';
  } catch {
    return 'dev';
  }
}

export function getGitCommit(): string {
  try {
    return typeof __GIT_COMMIT__ === 'string' ? __GIT_COMMIT__ : 'dev';
  } catch {
    return 'dev';
  }
}

export function logAppBuildInfo(): void {
  const id = getAppBuildId();
  const commit = getGitCommit();
  if (import.meta.env.DEV) {
    console.info(`[Focus Workspace] build ${id} commit ${commit} (dev)`);
    return;
  }
  console.info(`[Focus Workspace] build ${id} commit ${commit}`);
}
