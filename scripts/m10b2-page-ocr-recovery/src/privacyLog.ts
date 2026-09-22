/**
 * Privacy-safe operational log line for B2 prototype (never OCR/page text).
 */

import type { PageOcrRecoveryResult } from './types.ts';

export function formatPageOcrRecoveryLogLine(result: PageOcrRecoveryResult): string {
  return JSON.stringify({
    event: 'page_ocr_recovery',
    sourceId: result.sourceId,
    sourceVersion: result.sourceVersion,
    pageNumber: result.pageNumber,
    recoveryVersion: result.recoveryVersion,
    status: result.status,
    errorCode: result.errorCode ?? null,
    durationMs: result.metadata.durationMs,
    renderMs: result.metadata.renderMs ?? null,
    ocrMs: result.metadata.ocrMs ?? null,
    renderDpi: result.metadata.renderDpi,
    recoveredCharCount: result.metadata.recoveredCharCount ?? null,
    pageWidthPx: result.metadata.pageWidthPx ?? null,
    pageHeightPx: result.metadata.pageHeightPx ?? null,
    recoveryIdentity: result.metadata.recoveryIdentity,
    engine: result.metadata.engine,
    engineVersion: result.metadata.engineVersion,
  });
}
