/**
 * Explicit opt-in for the owner PDF recovery diagnostic panel.
 * Staging/DEV builds only mount the panel when this returns true.
 */

export const PDF_RECOVERY_DIAG_QUERY = 'pdfRecoveryDiag';
export const PDF_RECOVERY_DIAG_STORAGE_KEY = 'FW_PDF_RECOVERY_DIAG';

export function readOwnerPdfRecoveryDiagOptIn(opts: {
  search: string;
  storage: Pick<Storage, 'getItem'>;
}): boolean {
  try {
    if (new URLSearchParams(opts.search).get(PDF_RECOVERY_DIAG_QUERY) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    return opts.storage.getItem(PDF_RECOVERY_DIAG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist opt-in when URL contains `?pdfRecoveryDiag=1`. */
export function persistOwnerPdfRecoveryDiagOptInFromSearch(
  search: string,
  storage: Pick<Storage, 'setItem'>,
): boolean {
  try {
    if (new URLSearchParams(search).get(PDF_RECOVERY_DIAG_QUERY) !== '1') return false;
    storage.setItem(PDF_RECOVERY_DIAG_STORAGE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
