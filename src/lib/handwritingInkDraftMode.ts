/**
 * Draft pen renderer mode.
 * Default: incremental (fast tail segments live; perfect-freehand on pen-up).
 * Rollback: localStorage.setItem('fwInkDraftMode', 'ink' | 'polyline'); location.reload();
 */

export type FwInkDraftMode = 'incremental' | 'ink' | 'polyline';

export const FW_INK_DRAFT_MODE_KEY = 'fwInkDraftMode';

export type FwInkDraftModeDiag = {
  mode: FwInkDraftMode;
  storageRaw: string | null;
  usesIncremental: boolean;
  usesFullInk: boolean;
};

export function parseFwInkDraftMode(raw: string | null | undefined): FwInkDraftMode {
  if (raw === 'ink') return 'ink';
  if (raw === 'polyline') return 'polyline';
  return 'incremental';
}

export function getFwInkDraftMode(): FwInkDraftMode {
  if (typeof window === 'undefined') return 'incremental';
  try {
    return parseFwInkDraftMode(window.localStorage.getItem(FW_INK_DRAFT_MODE_KEY));
  } catch {
    return 'incremental';
  }
}

export function getFwInkDraftModeDiag(): FwInkDraftModeDiag {
  let storageRaw: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      storageRaw = window.localStorage.getItem(FW_INK_DRAFT_MODE_KEY);
    } catch {
      storageRaw = null;
    }
  }
  const mode = parseFwInkDraftMode(storageRaw);
  return {
    mode,
    storageRaw,
    usesIncremental: mode === 'incremental',
    usesFullInk: mode === 'ink',
  };
}

export function setFwInkDraftMode(mode: FwInkDraftMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FW_INK_DRAFT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function installFwInkDraftModeDiag(): void {
  if (typeof window === 'undefined') return;
  window.__fwInkDraftMode = () => getFwInkDraftModeDiag();
  console.info(`[FW_INK] draftMode=${getFwInkDraftMode()}`);
}

declare global {
  interface Window {
    __fwInkDraftMode?: () => FwInkDraftModeDiag;
  }
}
