/**
 * M1.0B B2 — page OCR recovery worker contracts (prototype).
 */

import { PAGE_OCR_RECOVERY_VERSION } from './bounds.ts';

/** Production-shaped recovery request identity (no file paths). */
export type PageOcrRecoveryRequest = {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  extractionVersion: string;
  recoveryVersion: typeof PAGE_OCR_RECOVERY_VERSION | string;
  /** Optional override; clamped to prototype bounds. */
  renderDpi?: number;
};

export type PageOcrRecoveryStatus = 'recovered' | 'failed' | 'unusable';

export type PageOcrRecoveryErrorCode =
  | 'invalid_request'
  | 'invalid_page'
  | 'source_unavailable'
  | 'render_failed'
  | 'ocr_failed'
  | 'timeout'
  | 'output_too_large'
  | 'internal_error';

export type PageOcrRecoveryMetadata = {
  durationMs: number;
  renderMs?: number;
  ocrMs?: number;
  renderDpi: number;
  engine: 'tesseract';
  engineVersion: string;
  renderer: 'pdfjs+napi-canvas';
  pageWidthPx?: number;
  pageHeightPx?: number;
  recoveredCharCount?: number;
  recoveryIdentity: string;
};

export type PageOcrRecoveryResult = {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  recoveryVersion: string;
  status: PageOcrRecoveryStatus;
  recoveredText?: string;
  metadata: PageOcrRecoveryMetadata;
  errorCode?: PageOcrRecoveryErrorCode;
};

/** Trusted internal resolution of bytes for a recovery identity. */
export type TrustedPdfSource = {
  sourceId: string;
  sourceVersion: number;
  bytes: Uint8Array;
};

export type TrustedSourceResolver = (
  req: Pick<PageOcrRecoveryRequest, 'sourceId' | 'sourceVersion'>,
) => Promise<TrustedPdfSource | null>;
