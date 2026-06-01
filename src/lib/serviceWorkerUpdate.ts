import { getAppBuildId } from './appBuildInfo';

const RELOAD_GUARD_KEY = 'fw_sw_reloaded_for_build';

/** At most one controllerchange reload per build (avoids reload loops). */
export function shouldReloadAfterServiceWorkerUpdate(): boolean {
  const build = getAppBuildId();
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === build) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, build);
  } catch {
    /* private mode / quota */
  }
  return true;
}

/** Check for a waiting SW when the tab becomes visible (picks up deploys faster). */
export function initServiceWorkerUpdateChecks(): void {
  if (!('serviceWorker' in navigator)) return;

  const check = () => {
    void navigator.serviceWorker.ready
      .then((reg) => reg.update())
      .catch(() => {});
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
