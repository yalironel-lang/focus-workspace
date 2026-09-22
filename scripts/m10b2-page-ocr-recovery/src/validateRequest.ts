/**
 * Request validation for M1.0B B2 page OCR recovery (prototype).
 * Rejects path-like / injection-shaped fields — identity only.
 */

import {
  PAGE_OCR_DEFAULT_DPI,
  PAGE_OCR_MAX_DPI,
  PAGE_OCR_MIN_DPI,
  PAGE_OCR_RECOVERY_VERSION,
} from './bounds.ts';
import type { PageOcrRecoveryRequest } from './types.ts';

export type ValidateRequestOk = {
  ok: true;
  request: Required<
    Pick<
      PageOcrRecoveryRequest,
      | 'sourceId'
      | 'sourceVersion'
      | 'pageNumber'
      | 'extractionVersion'
      | 'recoveryVersion'
      | 'renderDpi'
    >
  >;
};

export type ValidateRequestFail = {
  ok: false;
  errorCode: 'invalid_request' | 'invalid_page';
  detail: string;
};

export type ValidateRequestResult = ValidateRequestOk | ValidateRequestFail;

const SOURCE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function looksLikePath(s: string): boolean {
  return (
    s.includes('/') ||
    s.includes('\\') ||
    s.includes('..') ||
    s.startsWith('~') ||
    /^[a-zA-Z]:/.test(s)
  );
}

export function validatePageOcrRecoveryRequest(
  raw: unknown,
): ValidateRequestResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errorCode: 'invalid_request', detail: 'body_not_object' };
  }
  const o = raw as Record<string, unknown>;

  // Reject client-style path / storage smuggling keys entirely.
  for (const forbidden of [
    'path',
    'filePath',
    'pdfPath',
    'storagePath',
    'objectKey',
    'bytes',
    'command',
    'shell',
  ]) {
    if (forbidden in o) {
      return { ok: false, errorCode: 'invalid_request', detail: `forbidden_field:${forbidden}` };
    }
  }

  if (typeof o.sourceId !== 'string' || !SOURCE_ID_RE.test(o.sourceId) || looksLikePath(o.sourceId)) {
    return { ok: false, errorCode: 'invalid_request', detail: 'invalid_sourceId' };
  }
  if (
    typeof o.sourceVersion !== 'number' ||
    !Number.isInteger(o.sourceVersion) ||
    o.sourceVersion < 1 ||
    o.sourceVersion > 1_000_000
  ) {
    return { ok: false, errorCode: 'invalid_request', detail: 'invalid_sourceVersion' };
  }
  if (
    typeof o.pageNumber !== 'number' ||
    !Number.isInteger(o.pageNumber) ||
    o.pageNumber < 1
  ) {
    return { ok: false, errorCode: 'invalid_page', detail: 'invalid_pageNumber' };
  }
  if (typeof o.extractionVersion !== 'string' || o.extractionVersion.length < 1 || o.extractionVersion.length > 64) {
    return { ok: false, errorCode: 'invalid_request', detail: 'invalid_extractionVersion' };
  }
  if (typeof o.recoveryVersion !== 'string' || o.recoveryVersion !== PAGE_OCR_RECOVERY_VERSION) {
    return { ok: false, errorCode: 'invalid_request', detail: 'unsupported_recoveryVersion' };
  }

  let renderDpi = PAGE_OCR_DEFAULT_DPI;
  if (o.renderDpi !== undefined) {
    if (typeof o.renderDpi !== 'number' || !Number.isFinite(o.renderDpi)) {
      return { ok: false, errorCode: 'invalid_request', detail: 'invalid_renderDpi' };
    }
    renderDpi = Math.round(o.renderDpi);
    if (renderDpi < PAGE_OCR_MIN_DPI || renderDpi > PAGE_OCR_MAX_DPI) {
      return { ok: false, errorCode: 'invalid_request', detail: 'renderDpi_out_of_bounds' };
    }
  }

  return {
    ok: true,
    request: {
      sourceId: o.sourceId,
      sourceVersion: o.sourceVersion,
      pageNumber: o.pageNumber,
      extractionVersion: o.extractionVersion,
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
      renderDpi,
    },
  };
}
