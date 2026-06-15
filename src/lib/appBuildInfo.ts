/** Injected at build time via vite.config `define`. */
declare const __APP_BUILD_ID__: string;
declare const __GIT_COMMIT__: string;

export type FwHostKind = 'localhost' | 'lan' | 'vercel' | 'other';

export interface FwBuildInfo {
  gitCommit: string;
  buildTimestamp: string;
  environment: 'development' | 'production';
  url: string;
  userAgent: string;
  hostKind: FwHostKind;
}

export function getAppBuildId(): string {
  try {
    return typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getGitCommit(): string {
  try {
    return typeof __GIT_COMMIT__ === 'string' ? __GIT_COMMIT__ : 'unknown';
  } catch {
    return 'unknown';
  }
}

function classifyHost(hostname: string): FwHostKind {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return 'localhost';
  if (h.endsWith('.vercel.app')) return 'vercel';
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return 'lan';
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return 'lan';
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return 'lan';
  return 'other';
}

export function getFwBuildInfo(): FwBuildInfo {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return {
    gitCommit: getGitCommit(),
    buildTimestamp: getAppBuildId(),
    environment: import.meta.env.PROD ? 'production' : 'development',
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    hostKind: classifyHost(hostname),
  };
}

export function installFwBuildInfo(): void {
  if (typeof window === 'undefined') return;
  window.__fwBuildInfo = () => getFwBuildInfo();
}

/** Logs once at boot and exposes `window.__fwBuildInfo()`. */
export function logAppBuildInfo(): void {
  installFwBuildInfo();
  console.info('[FW_BUILD_INFO]', getFwBuildInfo());
}
