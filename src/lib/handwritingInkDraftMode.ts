/**
 * Draft pen renderer mode — stroke continuity (PR-1).
 * Safari console rollback: localStorage.setItem('fwInkDraftMode', 'polyline'); location.reload();
 * Default: ink (shared perfect-freehand path for live + committed strokes).
 */

export type FwInkDraftMode = 'ink' | 'polyline';

export const FW_INK_DRAFT_MODE_KEY = 'fwInkDraftMode';

export function parseFwInkDraftMode(raw: string | null | undefined): FwInkDraftMode {
  return raw === 'polyline' ? 'polyline' : 'ink';
}

export function getFwInkDraftMode(): FwInkDraftMode {
  if (typeof window === 'undefined') return 'ink';
  try {
    return parseFwInkDraftMode(window.localStorage.getItem(FW_INK_DRAFT_MODE_KEY));
  } catch {
    return 'ink';
  }
}

export function setFwInkDraftMode(mode: FwInkDraftMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FW_INK_DRAFT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
