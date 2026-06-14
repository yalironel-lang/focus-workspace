/** QA / dev visibility — diagnostics only; not a user-facing feature. */

export const FW_QA_MODE_KEY = 'FW_QA_MODE';

export function qaModeFromUrl(search: string): boolean {
  try {
    return new URLSearchParams(search).get('qa') === '1';
  } catch {
    return false;
  }
}

export function qaModeFromStorage(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(FW_QA_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when build badge / ink QA panel should render. */
export function isQaModeEnabled(opts: {
  dev: boolean;
  search: string;
  storage: Pick<Storage, 'getItem'>;
}): boolean {
  if (opts.dev) return true;
  if (qaModeFromUrl(opts.search)) return true;
  return qaModeFromStorage(opts.storage);
}

/** Persist QA mode when URL contains ?qa=1. Call once at app boot. */
export function persistQaModeFromUrl(storage: Pick<Storage, 'setItem'>): boolean {
  if (typeof window === 'undefined') return false;
  if (!qaModeFromUrl(window.location.search)) return false;
  try {
    storage.setItem(FW_QA_MODE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function qaBuildEnvLabel(prod: boolean): 'prod' | 'dev' {
  return prod ? 'prod' : 'dev';
}
