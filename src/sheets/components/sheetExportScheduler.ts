/**
 * Trailing coalescing window for Univer workbook.export before Free Space persist.
 * Existing object persistence already debounces ~400ms; keep this short.
 */
export const SHEET_EXPORT_DEBOUNCE_MS = 180;

export type SheetExportScheduler = {
  schedule: () => void;
  /** Export+commit if dirty and alive. No-op when deleted/not alive. */
  flush: () => void;
  cancel: () => void;
};

export function createSheetExportScheduler(opts: {
  exportDocument: () => unknown;
  commit: (document: unknown) => void;
  isAlive: () => boolean;
  debounceMs?: number;
}): SheetExportScheduler {
  const debounceMs = opts.debounceMs ?? SHEET_EXPORT_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    clearTimer();
    if (!dirty) return;
    dirty = false;
    if (!opts.isAlive()) return;
    opts.commit(opts.exportDocument());
  };

  const schedule = () => {
    if (!opts.isAlive()) return;
    dirty = true;
    clearTimer();
    timer = setTimeout(flush, debounceMs);
  };

  const cancel = () => {
    clearTimer();
    dirty = false;
  };

  return { schedule, flush, cancel };
}
