/**
 * M1.0B B3.2 — resolve authoritative PDF from a claimed job (no client paths).
 */

import type {
  ClaimedRecoveryJob,
  PageEvidenceRecord,
  TrustedRecoveryLedger,
  TrustedSourceRecord,
} from './trustedJobTypes.ts';

export type TrustedResolveOk = {
  ok: true;
  source: TrustedSourceRecord;
  page: PageEvidenceRecord;
  pdfBytes: Uint8Array;
};

export type TrustedResolveFail = {
  ok: false;
  code:
    | 'source_unavailable'
    | 'stale_version'
    | 'invalid_page'
    | 'invalid_request';
};

export type TrustedResolveResult = TrustedResolveOk | TrustedResolveFail;

/**
 * Independent pre-OCR validation + private Storage download.
 * Authority: job identity → persisted source row → source.storagePath only.
 */
export async function resolveTrustedJobPdf(
  job: ClaimedRecoveryJob,
  ledger: TrustedRecoveryLedger,
): Promise<TrustedResolveResult> {
  if (!job.claimToken || job.status !== 'claimed') {
    return { ok: false, code: 'invalid_request' };
  }
  if (!Number.isInteger(job.pageNumber) || job.pageNumber < 1) {
    return { ok: false, code: 'invalid_page' };
  }

  const source = await ledger.loadSource(job.sourceId);
  if (!source || source.deleted) {
    return { ok: false, code: 'source_unavailable' };
  }
  if (source.userId !== job.userId || source.sectionId !== job.sectionId) {
    return { ok: false, code: 'stale_version' };
  }
  // Job must target an existing processing version ≤ tip (immutable identity).
  if (job.sourceVersion < 1 || job.sourceVersion > source.sourceVersionTip) {
    return { ok: false, code: 'stale_version' };
  }

  const page = await ledger.loadPageEvidence(
    job.sourceId,
    job.sourceVersion,
    job.pageNumber,
  );
  if (!page) {
    return { ok: false, code: 'stale_version' };
  }
  if (page.extractionVersion !== job.extractionVersion) {
    return { ok: false, code: 'stale_version' };
  }

  const storagePath = source.storagePath;
  if (
    !storagePath ||
    storagePath.includes('..') ||
    storagePath.startsWith('/') ||
    storagePath.includes('\\') ||
    /^[a-zA-Z]:/.test(storagePath)
  ) {
    return { ok: false, code: 'source_unavailable' };
  }

  const bytes = await ledger.downloadPdfByStoragePath(storagePath);
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, code: 'source_unavailable' };
  }

  return { ok: true, source, page, pdfBytes: bytes };
}
