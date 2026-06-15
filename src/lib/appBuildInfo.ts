/** Injected at build time via vite.config `define`. */
declare const __APP_BUILD_ID__: string;
declare const __GIT_COMMIT__: string;
declare const __FW_FEATURE_FLAGS__: string;

export type FwHostKind = 'localhost' | 'lan' | 'vercel' | 'other';

export type FwFeatureFlags = {
  incrementalDraft: boolean;
};

export interface FwBuildInfo {
  gitCommit: string;
  buildTimestamp: string;
  environment: 'development' | 'production';
  url: string;
  userAgent: string;
  hostKind: FwHostKind;
  featureFlags: FwFeatureFlags;
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

function readFeatureFlagsJson(): string | null {
  try {
    return typeof __FW_FEATURE_FLAGS__ === 'string' ? __FW_FEATURE_FLAGS__ : null;
  } catch {
    return null;
  }
}

export function getFwFeatureFlags(): FwFeatureFlags {
  const raw = readFeatureFlagsJson();
  if (raw === null) {
    return { incrementalDraft: true };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FwFeatureFlags>;
    return {
      incrementalDraft: parsed.incrementalDraft === true,
    };
  } catch {
    return { incrementalDraft: false };
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
    featureFlags: getFwFeatureFlags(),
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
