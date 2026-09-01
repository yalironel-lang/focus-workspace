/**
 * PDF viewer page-persistence controller — debounce + restoration guards.
 */

export const PAGE_PERSIST_DEBOUNCE_MS = 350;

export type PageChangeSource = 'scroll' | 'toolbar' | 'restore';

export function shouldEmitPagePersist(
  source: PageChangeSource,
  isRestoring: boolean,
  isProgrammaticScroll: boolean,
): boolean {
  if (isRestoring) return false;
  if (source === 'scroll' && isProgrammaticScroll) return false;
  return true;
}

export function normalizePageForPersist(
  page: number,
  pageCount?: number | null,
): number {
  const raw = Math.max(1, Math.floor(page));
  if (typeof pageCount === 'number' && pageCount > 0) {
    return Math.min(raw, pageCount);
  }
  return raw;
}

export interface PagePersistScheduler {
  schedule: (page: number) => void;
  flush: () => void;
  cancel: () => void;
}

/** Trailing debounce for scroll-driven page persistence. */
export function createPagePersistScheduler(
  onPersist: (page: number) => void,
  debounceMs = PAGE_PERSIST_DEBOUNCE_MS,
): PagePersistScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingPage: number | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingPage !== null) {
      const page = pendingPage;
      pendingPage = null;
      onPersist(page);
    }
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingPage = null;
  };

  const schedule = (page: number) => {
    pendingPage = page;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  return { schedule, flush, cancel };
}
