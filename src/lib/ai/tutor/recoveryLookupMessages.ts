/**
 * Safe user-facing copy for Capture recovery lookup failures.
 * Never includes source IDs, UUIDs, storage paths, or raw error payloads.
 */

import type { RecoveredPdfPageTextResult } from './fetchRecoveredPdfPageText';

export type RecoveryLookupFailureCode = Extract<RecoveredPdfPageTextResult, { ok: false }>['code'];

/** Internal alias used in Capture diagnostics (maps to query_failed). */
export type CaptureRecoveryDiagCode =
  | RecoveryLookupFailureCode
  | 'lookup_error';

export function normalizeRecoveryFailureCode(
  code: RecoveryLookupFailureCode,
): CaptureRecoveryDiagCode {
  return code === 'query_failed' ? 'lookup_error' : code;
}

/**
 * User-facing message after native Capture failed and recovery is unavailable.
 * `pageTextKind` steers whether we emphasize region miss vs missing text layer.
 */
export function messageForCaptureRecoveryFailure(input: {
  code: RecoveryLookupFailureCode;
  pageTextKind: 'useful' | 'sparse' | 'empty' | 'unknown';
}): string {
  const diag = normalizeRecoveryFailureCode(input.code);

  switch (diag) {
    case 'unauthenticated':
      return 'Sign in to check for recovered page text for this PDF.';
    case 'invalid_request':
      return 'Could not look up recovered page text for this selection.';
    case 'source_not_found':
      return 'No recovered page text is indexed for this document yet. Course Knowledge recovery may still be pending.';
    case 'page_not_found':
      return 'No recovered text exists for this page yet. If OCR recovery is still running, try Capture again later.';
    case 'no_recovered_text':
      return 'This page has no OCR-recovered text available. Native PDF text could not be used for this selection.';
    case 'lookup_error':
      return 'Could not check recovered page text right now. Try again in a moment.';
    default:
      return 'Recovered page text is not available for this selection.';
  }
}

/**
 * Prefer a region-miss tip when the page itself has useful native text elsewhere.
 */
export function messageForNativeCaptureMiss(input: {
  pageTextKind: 'useful' | 'sparse' | 'empty' | 'unknown';
  recoveryCode?: RecoveryLookupFailureCode;
}): string {
  if (input.pageTextKind === 'useful') {
    return 'Selection did not intersect readable text on this page. Drag over text lines, or wait for OCR recovery if the visible content is image-only.';
  }

  if (input.recoveryCode) {
    return messageForCaptureRecoveryFailure({
      code: input.recoveryCode,
      pageTextKind: input.pageTextKind,
    });
  }

  if (input.pageTextKind === 'empty') {
    return 'No usable PDF text layer on this page. If OCR recovery finishes for this document, try Capture again.';
  }

  return 'No usable native text for this selection. The page text layer looks sparse or unreadable. If OCR recovery finishes, try Capture again.';
}
