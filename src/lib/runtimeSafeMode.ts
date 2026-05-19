/**
 * Emergency “Safe Mode” — strips heavy rendering and interaction-risky paths.
 *
 * Enable any of:
 *   • URL once:  append  ?safe=1  (persists to localStorage and cleans the query)
 *   • localStorage:  localStorage.setItem('fw_runtime_safe_mode', '1')
 *   • Build/env:     VITE_SAFE_MODE=1
 *   • Dev-only SW:   VITE_DISABLE_SW=1  (skips service worker reload handler; dev preview only)
 *
 * Disable:  localStorage.removeItem('fw_runtime_safe_mode')  then hard refresh
 *
 * ── Interaction recovery (DEFAULT until opt-in) ───────────────────────────────
 * Heavy / fragile layers are OFF unless the user opts into “full experience”:
 *   • localStorage.setItem('fw_full_experience', '1')
 *   • URL once: ?fullExperience=1  or ?full=1
 *   • Build: VITE_FULL_EXPERIENCE=1
 * Back to recovery: localStorage.removeItem('fw_full_experience')  or ?minimal=1
 *
 * Debug hit targets: ?debugInteraction=1  (logs capture-phase pointerdown targets)
 */

const STORAGE_KEY = 'fw_runtime_safe_mode';
const FULL_EXPERIENCE_KEY = 'fw_full_experience';

function envFlagTrue(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/** Call once at startup (before React) to support ?safe=1. */
export function initRuntimeSafeModeFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('safe') === '1' || params.get('safeMode') === '1') {
      localStorage.setItem(STORAGE_KEY, '1');
      params.delete('safe');
      params.delete('safeMode');
      const q = params.toString();
      const url = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    }
    if (params.get('safe') === '0' || params.get('safeMode') === '0') {
      localStorage.removeItem(STORAGE_KEY);
      params.delete('safe');
      params.delete('safeMode');
      const q = params.toString();
      const url = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Full cinematic stack + pointer capture + starters, etc.
 * OFF by default for interaction recovery — opt in explicitly.
 */
export function initInteractionRecoveryFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fullExperience') === '1' || params.get('full') === '1') {
      localStorage.setItem(FULL_EXPERIENCE_KEY, '1');
      params.delete('fullExperience');
      params.delete('full');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    }
    if (params.get('minimal') === '1' || params.get('recovery') === '1') {
      localStorage.setItem(FULL_EXPERIENCE_KEY, '0');
      params.delete('minimal');
      params.delete('recovery');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    }
    if (params.get('debugInteraction') === '1') {
      document.addEventListener(
        'pointerdown',
        e => {
          const t = e.target;
          console.debug('[FW pointerdown]', t instanceof HTMLElement ? t.tagName : t, t);
        },
        true,
      );
      params.delete('debugInteraction');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    }
  } catch {
    /* ignore */
  }
}

export function isRuntimeSafeMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (envFlagTrue(import.meta.env.VITE_SAFE_MODE)) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Opt-in “full” product experience (living env, capture, overlays, etc.). */
export function isFullExperienceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (isRuntimeSafeMode()) return false;
  if (envFlagTrue(import.meta.env.VITE_FULL_EXPERIENCE)) return true;
  try {
    // ON by default — only disabled when explicitly set to '0' (via ?minimal=1)
    return localStorage.getItem(FULL_EXPERIENCE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** True for Safe Mode OR default recovery (full experience not enabled). */
export function shouldStripHeavyInteractionLayers(): boolean {
  return isRuntimeSafeMode() || !isFullExperienceEnabled();
}

/** Skip service-worker reload behavior (stale chunk loops). */
export function shouldDisableServiceWorkerNavigationReloads(): boolean {
  return shouldStripHeavyInteractionLayers() || envFlagTrue(import.meta.env.VITE_DISABLE_SW);
}

/** Unregister all SWs (production safe mode / recovery). Does not delete Cache Storage API keys. */
export async function unregisterServiceWorkersForRecovery(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    console.warn('[Focus Workspace] Service workers unregistered (Safe Mode / recovery). Hard refresh recommended.');
  } catch (e) {
    console.warn('[Focus Workspace] SW unregistration failed', e);
  }
}
