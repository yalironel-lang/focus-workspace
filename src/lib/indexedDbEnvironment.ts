/**
 * Safe IndexedDB access + runtime environment probe (iPad Safari / PWA / private mode).
 * WebKit throws "Can't find variable: indexedDB" when the API is not exposed — never
 * use bare `indexedDB`; always resolve via globalThis/window with `in` checks.
 */

export type IndexedDbEnvironmentReport = {
  typeofIndexedDB: string;
  typeofWindowIndexedDB: string;
  hasGlobalThisIndexedDB: boolean;
  hasWindowIndexedDB: boolean;
  resolved: boolean;
  userAgent: string;
  displayMode: string;
  iosStandalone: boolean;
  isServiceWorkerContext: boolean;
  privateModeHint: 'likely' | 'unlikely' | 'unknown';
  runtimeContext: 'browser-main' | 'worker-or-non-window';
  wkWebViewHint: boolean;
};

function safeTypeof(get: () => unknown): string {
  try {
    const v = get();
    return typeof v;
  } catch (e) {
    return e instanceof ReferenceError ? 'ReferenceError' : 'throws';
  }
}

/** Resolve IDBFactory without throwing when the global binding is absent (iOS private mode). */
export function getIndexedDB(): IDBFactory | null {
  if (typeof globalThis === 'object' && globalThis !== null && 'indexedDB' in globalThis) {
    const idb = globalThis.indexedDB;
    if (idb) return idb;
  }
  if (typeof window === 'object' && window !== null && 'indexedDB' in window) {
    const idb = window.indexedDB;
    if (idb) return idb;
  }
  return null;
}

function detectDisplayMode(): string {
  if (typeof window === 'undefined' || !window.matchMedia) return 'unknown';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  return 'browser';
}

function detectPrivateModeHint(): 'likely' | 'unlikely' | 'unknown' {
  if (!getIndexedDB()) return 'likely';
  try {
    const k = '__fw_idb_private_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return 'unlikely';
  } catch {
    return 'likely';
  }
}

function detectWkWebViewHint(ua: string): boolean {
  return /AppleWebKit/i.test(ua) && !/Safari/i.test(ua);
}

export function probeIndexedDbEnvironment(): IndexedDbEnvironmentReport {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const iosStandalone =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return {
    typeofIndexedDB: safeTypeof(() => indexedDB),
    typeofWindowIndexedDB:
      typeof window === 'object' && window !== null
        ? safeTypeof(() => window.indexedDB)
        : 'no-window',
    hasGlobalThisIndexedDB:
      typeof globalThis === 'object' && globalThis !== null && 'indexedDB' in globalThis,
    hasWindowIndexedDB: typeof window === 'object' && window !== null && 'indexedDB' in window,
    resolved: getIndexedDB() !== null,
    userAgent: ua,
    displayMode: detectDisplayMode(),
    iosStandalone,
    isServiceWorkerContext: typeof window === 'undefined' && typeof self !== 'undefined',
    privateModeHint: detectPrivateModeHint(),
    runtimeContext:
      typeof window === 'undefined' ? 'worker-or-non-window' : 'browser-main',
    wkWebViewHint: detectWkWebViewHint(ua),
  };
}

declare global {
  interface Window {
    __fwIdbEnv?: () => IndexedDbEnvironmentReport;
  }
}

if (typeof window !== 'undefined') {
  window.__fwIdbEnv = probeIndexedDbEnvironment;
}
