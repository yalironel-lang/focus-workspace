/**
 * In-memory ledger mirroring B3.1 claim/commit semantics for B3.2 tests.
 * Not a Production substitute — proves worker contracts without remote DB.
 */

import { randomUUID } from 'node:crypto';
import { selectCanonicalPageText } from '../../../supabase/functions/_shared/ai/knowledge/canonicalPageText.ts';
import {
  isNonRetryablePageRecoveryError,
  type PageRecoveryJobErrorCode,
} from '../../../supabase/functions/_shared/ai/knowledge/pageRecoveryJobState.ts';
import type {
  ClaimedRecoveryJob,
  ClaimRecoveryResult,
  CommitRecoveryInput,
  CommitRecoveryResult,
  PageEvidenceRecord,
  TrustedRecoveryLedger,
  TrustedSourceRecord,
} from './trustedJobTypes.ts';

type JobRow = {
  id: string;
  userId: string;
  sectionId: string;
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  extractionVersion: string;
  recoveryVersion: string;
  status: string;
  attemptCount: number;
  detectorReasons: string[];
  errorCode: string | null;
  availableAt: number;
  claimedAt: number | null;
  claimToken: string | null;
  leaseExpiresAt: number | null;
  completedAt: number | null;
};

export type InMemoryLedgerSeed = {
  source: TrustedSourceRecord;
  pages: PageEvidenceRecord[];
  jobs: Array<{
    pageNumber: number;
    detectorReasons: string[];
    extractionVersion: string;
    recoveryVersion: string;
    sourceVersion: number;
  }>;
  pdfByStoragePath: Record<string, Uint8Array>;
};

export class InMemoryRecoveryLedger implements TrustedRecoveryLedger {
  sources = new Map<string, TrustedSourceRecord>();
  pages = new Map<string, PageEvidenceRecord>();
  jobs: JobRow[] = [];
  pdfByStoragePath: Record<string, Uint8Array>;
  maxAttempts: number;
  retryBaseSeconds: number;
  nowMs: () => number;
  /** Serialize claims to approximate SKIP LOCKED single-winner behavior. */
  private claimLock: Promise<void> = Promise.resolve();

  constructor(
    seed: InMemoryLedgerSeed,
    opts?: { maxAttempts?: number; retryBaseSeconds?: number; nowMs?: () => number },
  ) {
    this.sources.set(seed.source.sourceId, { ...seed.source });
    for (const p of seed.pages) {
      this.pages.set(pageKey(p.sourceId, p.sourceVersion, p.pageNumber), { ...p });
    }
    this.pdfByStoragePath = { ...seed.pdfByStoragePath };
    this.maxAttempts = opts?.maxAttempts ?? 3;
    this.retryBaseSeconds = opts?.retryBaseSeconds ?? 30;
    this.nowMs = opts?.nowMs ?? Date.now;
    for (const j of seed.jobs) {
      this.jobs.push({
        id: randomUUID(),
        userId: seed.source.userId,
        sectionId: seed.source.sectionId,
        sourceId: seed.source.sourceId,
        sourceVersion: j.sourceVersion,
        pageNumber: j.pageNumber,
        extractionVersion: j.extractionVersion,
        recoveryVersion: j.recoveryVersion,
        status: 'queued',
        attemptCount: 0,
        detectorReasons: [...j.detectorReasons],
        errorCode: null,
        availableAt: this.nowMs(),
        claimedAt: null,
        claimToken: null,
        leaseExpiresAt: null,
        completedAt: null,
      });
    }
  }

  async claimJob(opts?: {
    leaseSeconds?: number;
    maxAttempts?: number;
  }): Promise<ClaimRecoveryResult> {
    const run = async (): Promise<ClaimRecoveryResult> => {
      const leaseSeconds = opts?.leaseSeconds ?? 120;
      const maxAttempts = opts?.maxAttempts ?? this.maxAttempts;
      const now = this.nowMs();
      const eligible = this.jobs
        .filter((j) => {
          if (j.attemptCount >= maxAttempts) return false;
          if (j.status === 'queued' && j.availableAt <= now) return true;
          if (
            j.status === 'claimed' &&
            j.leaseExpiresAt != null &&
            j.leaseExpiresAt < now
          ) {
            return true;
          }
          return false;
        })
        .sort((a, b) => a.availableAt - b.availableAt || a.id.localeCompare(b.id));

      const job = eligible[0];
      if (!job) return { ok: true, job: null };

      const token = randomUUID();
      job.status = 'claimed';
      job.attemptCount += 1;
      job.claimedAt = now;
      job.claimToken = token;
      job.leaseExpiresAt = now + leaseSeconds * 1000;
      job.errorCode = null;

      const claimed: ClaimedRecoveryJob = {
        id: job.id,
        userId: job.userId,
        sectionId: job.sectionId,
        sourceId: job.sourceId,
        sourceVersion: job.sourceVersion,
        pageNumber: job.pageNumber,
        extractionVersion: job.extractionVersion,
        recoveryVersion: job.recoveryVersion,
        status: 'claimed',
        attemptCount: job.attemptCount,
        detectorReasons: [...job.detectorReasons],
        claimToken: token,
        leaseExpiresAt: new Date(job.leaseExpiresAt).toISOString(),
      };
      return { ok: true, job: claimed };
    };

    const prev = this.claimLock;
    let release!: () => void;
    this.claimLock = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      return await run();
    } finally {
      release();
    }
  }

  async loadSource(sourceId: string): Promise<TrustedSourceRecord | null> {
    const s = this.sources.get(sourceId);
    return s ? { ...s } : null;
  }

  async loadPageEvidence(
    sourceId: string,
    sourceVersion: number,
    pageNumber: number,
  ): Promise<PageEvidenceRecord | null> {
    const p = this.pages.get(pageKey(sourceId, sourceVersion, pageNumber));
    return p ? { ...p } : null;
  }

  async downloadPdfByStoragePath(storagePath: string): Promise<Uint8Array | null> {
    const bytes = this.pdfByStoragePath[storagePath];
    return bytes ? bytes.slice() : null;
  }

  async commitRecoveryResult(input: CommitRecoveryInput): Promise<CommitRecoveryResult> {
    const job = this.jobs.find((j) => j.id === input.jobId);
    if (!job) return { ok: false, code: 'not_found' };

    if (['succeeded', 'unusable', 'failed', 'discarded_stale'].includes(job.status)) {
      return { ok: true, idempotent: true, status: job.status };
    }

    if (job.status !== 'claimed' || job.claimToken !== input.claimToken) {
      return { ok: false, code: 'stale_version' };
    }

    const source = this.sources.get(job.sourceId);
    if (!source || source.deleted) {
      job.status = 'discarded_stale';
      job.errorCode = 'source_unavailable';
      job.completedAt = this.nowMs();
      job.claimToken = null;
      job.leaseExpiresAt = null;
      return { ok: true, status: 'discarded_stale', code: 'source_unavailable' };
    }

    const page = this.pages.get(
      pageKey(job.sourceId, job.sourceVersion, job.pageNumber),
    );
    if (!page || page.extractionVersion !== job.extractionVersion) {
      job.status = 'discarded_stale';
      job.errorCode = 'stale_version';
      job.completedAt = this.nowMs();
      job.claimToken = null;
      job.leaseExpiresAt = null;
      return { ok: true, status: 'discarded_stale', code: 'stale_version' };
    }

    // Optional: job version must not exceed tip (stale if tip moved backwards somehow)
    if (job.sourceVersion > source.sourceVersionTip) {
      job.status = 'discarded_stale';
      job.errorCode = 'stale_version';
      job.completedAt = this.nowMs();
      job.claimToken = null;
      job.leaseExpiresAt = null;
      return { ok: true, status: 'discarded_stale', code: 'stale_version' };
    }

    if (input.status === 'recovered' || input.status === 'unusable') {
      const decision = selectCanonicalPageText({
        nativeText: page.nativeText,
        recoveredText: input.recoveredText,
        recoveryStatus: input.status,
      });
      page.recoveredText =
        input.recoveredText != null ? input.recoveredText : page.recoveredText;
      page.canonicalText = decision.canonicalText;
      page.extractionMethod = decision.extractionMethod;
      page.fallbackResult = decision.fallbackResult;
      page.recoveryVersion = job.recoveryVersion;

      job.status = input.status === 'recovered' && decision.usedRecovered ? 'succeeded' : 'unusable';
      if (input.status === 'unusable') job.status = 'unusable';
      if (input.status === 'recovered' && !decision.usedRecovered) job.status = 'unusable';
      job.completedAt = this.nowMs();
      job.claimToken = null;
      job.leaseExpiresAt = null;
      job.errorCode = null;
      return { ok: true, status: job.status };
    }

    // failed
    const code = (input.errorCode ?? 'internal_error') as PageRecoveryJobErrorCode;
    if (isNonRetryablePageRecoveryError(code)) {
      const decision = selectCanonicalPageText({
        nativeText: page.nativeText,
        recoveredText: null,
        recoveryStatus: 'failed',
      });
      page.canonicalText = decision.canonicalText;
      page.extractionMethod = 'native';
      page.fallbackResult = decision.fallbackResult;
      page.recoveryVersion = job.recoveryVersion;
      job.status = 'failed';
      job.errorCode = code;
      job.completedAt = this.nowMs();
      job.claimToken = null;
      job.leaseExpiresAt = null;
      return { ok: true, status: 'failed' };
    }

    if (job.attemptCount < this.maxAttempts) {
      const retrySecs = this.retryBaseSeconds * Math.max(1, job.attemptCount);
      job.status = 'queued';
      job.errorCode = code;
      job.availableAt = this.nowMs() + retrySecs * 1000;
      job.claimToken = null;
      job.leaseExpiresAt = null;
      job.claimedAt = null;
      return { ok: true, status: 'queued', retry: true };
    }

    const decision = selectCanonicalPageText({
      nativeText: page.nativeText,
      recoveredText: null,
      recoveryStatus: 'failed',
    });
    page.canonicalText = decision.canonicalText;
    page.extractionMethod = 'native';
    page.fallbackResult = decision.fallbackResult;
    page.recoveryVersion = job.recoveryVersion;
    job.status = 'failed';
    job.errorCode = 'retry_exhausted';
    job.completedAt = this.nowMs();
    job.claimToken = null;
    job.leaseExpiresAt = null;
    return { ok: true, status: 'failed', code: 'retry_exhausted' };
  }

  /** Test helper: mutate source/page/job to simulate races. */
  mutateSource(sourceId: string, patch: Partial<TrustedSourceRecord>): void {
    const s = this.sources.get(sourceId);
    if (!s) return;
    Object.assign(s, patch);
  }

  mutatePage(
    sourceId: string,
    sourceVersion: number,
    pageNumber: number,
    patch: Partial<PageEvidenceRecord>,
  ): void {
    const p = this.pages.get(pageKey(sourceId, sourceVersion, pageNumber));
    if (!p) return;
    Object.assign(p, patch);
  }

  getJob(id: string): JobRow | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  getPage(
    sourceId: string,
    sourceVersion: number,
    pageNumber: number,
  ): PageEvidenceRecord | undefined {
    return this.pages.get(pageKey(sourceId, sourceVersion, pageNumber));
  }
}

function pageKey(sourceId: string, sourceVersion: number, pageNumber: number): string {
  return `${sourceId}@${sourceVersion}:p${pageNumber}`;
}
