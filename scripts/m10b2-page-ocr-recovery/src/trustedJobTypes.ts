/**
 * M1.0B B3.2 — claimed recovery job contracts (trusted ledger side).
 */

export type ClaimedRecoveryJob = {
  id: string;
  userId: string;
  sectionId: string;
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  extractionVersion: string;
  recoveryVersion: string;
  status: 'claimed';
  attemptCount: number;
  detectorReasons: string[];
  claimToken: string;
  leaseExpiresAt: string;
};

export type TrustedSourceRecord = {
  sourceId: string;
  userId: string;
  sectionId: string;
  /** Authoritative private Storage path from persisted source row only. */
  storagePath: string;
  /** Tip version on the source row (may differ from job.sourceVersion). */
  sourceVersionTip: number;
  retrievalSourceVersion: number | null;
  status: string;
  deleted?: boolean;
};

export type PageEvidenceRecord = {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  nativeText: string;
  recoveredText: string | null;
  canonicalText: string;
  extractionMethod: 'native' | 'ocr_tesseract';
  extractionVersion: string;
  recoveryVersion: string | null;
  fallbackResult: string | null;
};

export type CommitRecoveryInput = {
  jobId: string;
  claimToken: string;
  status: 'recovered' | 'unusable' | 'failed';
  recoveredText?: string | null;
  errorCode?: string | null;
};

export type CommitRecoveryResult = {
  ok: boolean;
  status?: string;
  code?: string;
  idempotent?: boolean;
  retry?: boolean;
};

export type ClaimRecoveryResult =
  | { ok: true; job: ClaimedRecoveryJob | null }
  | { ok: false; code: string };

/**
 * Server-side ports the worker uses. Implementations must NEVER accept
 * caller-supplied Storage paths or PDF bytes as authority.
 */
export type TrustedRecoveryLedger = {
  claimJob(opts?: { leaseSeconds?: number; maxAttempts?: number }): Promise<ClaimRecoveryResult>;
  loadSource(sourceId: string): Promise<TrustedSourceRecord | null>;
  loadPageEvidence(
    sourceId: string,
    sourceVersion: number,
    pageNumber: number,
  ): Promise<PageEvidenceRecord | null>;
  /**
   * Download PDF bytes for an authoritative storagePath already loaded from
   * the source row. Path must equal source.storagePath.
   */
  downloadPdfByStoragePath(storagePath: string): Promise<Uint8Array | null>;
  commitRecoveryResult(input: CommitRecoveryInput): Promise<CommitRecoveryResult>;
};
