/**
 * Explicit opt-in for Capture region diagnostics (staging/dev visibility).
 * Never enables itself in production builds without query/storage opt-in,
 * and callers must also gate on staging/dev build flags.
 */

export const CAPTURE_REGION_DIAG_QUERY = 'captureRegionDiag';
export const CAPTURE_REGION_DIAG_STORAGE_KEY = 'FW_CAPTURE_REGION_DIAG';

export function readCaptureRegionDiagOptIn(opts: {
  search: string;
  storage: Pick<Storage, 'getItem'>;
}): boolean {
  try {
    if (new URLSearchParams(opts.search).get(CAPTURE_REGION_DIAG_QUERY) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    return opts.storage.getItem(CAPTURE_REGION_DIAG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist opt-in when URL contains `?captureRegionDiag=1`. */
export function persistCaptureRegionDiagOptInFromSearch(
  search: string,
  storage: Pick<Storage, 'setItem'>,
): boolean {
  try {
    if (new URLSearchParams(search).get(CAPTURE_REGION_DIAG_QUERY) !== '1') return false;
    storage.setItem(CAPTURE_REGION_DIAG_STORAGE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** Staging/dev build gate — mirrors owner PDF recovery diag visibility. */
export function isCaptureRegionDiagBuildEnabled(): boolean {
  try {
    if (import.meta.env.DEV) return true;
  } catch {
    /* ignore */
  }
  try {
    return import.meta.env.VITE_STAGING_EMAIL_AUTH === 'true';
  } catch {
    return false;
  }
}

export function isCaptureRegionDiagActive(opts: {
  search: string;
  storage: Pick<Storage, 'getItem'>;
}): boolean {
  return isCaptureRegionDiagBuildEnabled() && readCaptureRegionDiagOptIn(opts);
}
