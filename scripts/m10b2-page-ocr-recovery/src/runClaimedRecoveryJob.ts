/**
 * M1.0B B3.2 — process one claimed recovery job (trusted ledger + B2 OCR core).
 *
 * Does NOT accept client Storage paths / PDF bytes / shell.
 * Does NOT assemble documents, chunk, embed, or publish retrieval.
 */

import {
  PAGE_OCR_DEFAULT_DPI,
  PAGE_OCR_RECOVERY_VERSION,
  PAGE_OCR_TIMEOUT_MS,
} from './bounds.ts';
import {
  assertWorkerLogHasNoAcademicContent,
  formatWorkerRecoveryLogLine,
} from './privacyLogWorker.ts';
import { recoverPdfPage } from './recoverPage.ts';
import { resolveTrustedJobPdf } from './resolveTrustedJobPdf.ts';
import type { ClaimedRecoveryJob, TrustedRecoveryLedger } from './trustedJobTypes.ts';

export type ProcessClaimedJobOptions = {
  ledger: TrustedRecoveryLedger;
  /** When false, worker refuses to process (rollback gate). */
  recoveryEnabled?: boolean;
  timeoutMs?: number;
  tesseractBin?: string;
  log?: (line: string) => void;
  /**
   * Test hook: invoked after resolve + before OCR so tests can mutate ledger
   * to simulate stale-during-OCR.
   */
  afterResolveBeforeOcr?: (job: ClaimedRecoveryJob) => Promise<void> | void;
  /**
   * Optional B3.3C hook: after a terminal commit (succeeded/unusable/failed/
   * discarded_stale), allow the host to attempt finalize (assemble+publish)
   * when all required jobs for the tip are terminal. Must be idempotent.
   * Does NOT run OCR or mutate recovery results.
   */
  afterTerminalCommit?: (input: {
    job: ClaimedRecoveryJob;
    commitStatus: string | undefined;
    errorCode: string | null | undefined;
  }) => Promise<void> | void;
  /** Injectable OCR core (defaults to B2 recoverPdfPage). */
  recoverPageFn?: typeof recoverPdfPage;
};

export type ProcessClaimedJobResult = {
  processed: boolean;
  jobId?: string;
  commitStatus?: string;
  errorCode?: string | null;
};

function emit(
  log: ((line: string) => void) | undefined,
  payload: Parameters<typeof formatWorkerRecoveryLogLine>[0],
): void {
  const line = formatWorkerRecoveryLogLine(payload);
  if (!assertWorkerLogHasNoAcademicContent(line)) {
    throw new Error('worker_log_content_violation');
  }
  (log ?? console.log)(line);
}

/**
 * Claim next job (if any) and run OCR → trusted commit.
 * Pull/claim semantics only.
 */
export async function claimAndProcessNextRecoveryJob(
  opts: ProcessClaimedJobOptions,
): Promise<ProcessClaimedJobResult> {
  const enabled = opts.recoveryEnabled !== false;
  if (!enabled) {
    emit(opts.log, { event: 'page_ocr_worker', phase: 'feature_disabled' });
    return { processed: false };
  }

  const claimed = await opts.ledger.claimJob();
  if (!claimed.ok) {
    emit(opts.log, {
      event: 'page_ocr_worker',
      phase: 'error',
      errorCode: claimed.code,
    });
    return { processed: false, errorCode: claimed.code };
  }
  if (!claimed.job) {
    emit(opts.log, { event: 'page_ocr_worker', phase: 'claim', status: 'idle' });
    return { processed: false };
  }

  emit(opts.log, {
    event: 'page_ocr_worker',
    phase: 'claim',
    jobId: claimed.job.id,
    sourceId: claimed.job.sourceId,
    sourceVersion: claimed.job.sourceVersion,
    pageNumber: claimed.job.pageNumber,
    attemptCount: claimed.job.attemptCount,
    detectorReasons: claimed.job.detectorReasons,
    status: 'claimed',
  });

  return processClaimedRecoveryJob(claimed.job, opts);
}

export async function processClaimedRecoveryJob(
  job: ClaimedRecoveryJob,
  opts: ProcessClaimedJobOptions,
): Promise<ProcessClaimedJobResult> {
  const t0 = Date.now();
  const enabled = opts.recoveryEnabled !== false;
  if (!enabled) {
    emit(opts.log, { event: 'page_ocr_worker', phase: 'feature_disabled', jobId: job.id });
    return { processed: false, jobId: job.id };
  }

  const resolved = await resolveTrustedJobPdf(job, opts.ledger);
  if (!resolved.ok) {
    emit(opts.log, {
      event: 'page_ocr_worker',
      phase: 'resolve',
      jobId: job.id,
      sourceId: job.sourceId,
      sourceVersion: job.sourceVersion,
      pageNumber: job.pageNumber,
      errorCode: resolved.code,
    });
    const commit = await opts.ledger.commitRecoveryResult({
      jobId: job.id,
      claimToken: job.claimToken,
      status: 'failed',
      errorCode: resolved.code,
    });
    return {
      processed: true,
      jobId: job.id,
      commitStatus: commit.status ?? 'failed',
      errorCode: resolved.code,
    };
  }

  emit(opts.log, {
    event: 'page_ocr_worker',
    phase: 'resolve',
    jobId: job.id,
    sourceId: job.sourceId,
    sourceVersion: job.sourceVersion,
    pageNumber: job.pageNumber,
    status: 'resolved',
  });

  if (opts.afterResolveBeforeOcr) {
    await opts.afterResolveBeforeOcr(job);
  }

  // OCR via B2 core — resolver returns bytes already loaded from trusted path.
  // recoverPdfPage still validates identity-shaped request (no path fields).
  const recover = opts.recoverPageFn ?? recoverPdfPage;
  const ocr = await recover(
    {
      sourceId: job.sourceId,
      sourceVersion: job.sourceVersion,
      pageNumber: job.pageNumber,
      extractionVersion: job.extractionVersion,
      recoveryVersion: job.recoveryVersion || PAGE_OCR_RECOVERY_VERSION,
      renderDpi: PAGE_OCR_DEFAULT_DPI,
    },
    {
      timeoutMs: opts.timeoutMs ?? PAGE_OCR_TIMEOUT_MS,
      tesseractBin: opts.tesseractBin,
      resolveSource: async () => ({
        sourceId: job.sourceId,
        sourceVersion: job.sourceVersion,
        bytes: resolved.pdfBytes,
      }),
    },
  );

  emit(opts.log, {
    event: 'page_ocr_worker',
    phase: 'ocr',
    jobId: job.id,
    sourceId: job.sourceId,
    sourceVersion: job.sourceVersion,
    pageNumber: job.pageNumber,
    attemptCount: job.attemptCount,
    status: ocr.status,
    errorCode: ocr.errorCode ?? null,
    durationMs: ocr.metadata.durationMs,
    renderMs: ocr.metadata.renderMs,
    ocrMs: ocr.metadata.ocrMs,
    renderDpi: ocr.metadata.renderDpi,
    recoveredCharCount: ocr.metadata.recoveredCharCount,
    engineVersion: ocr.metadata.engineVersion,
  });

  const commitStatus =
    ocr.status === 'recovered'
      ? 'recovered'
      : ocr.status === 'unusable'
        ? 'unusable'
        : 'failed';

  const commit = await opts.ledger.commitRecoveryResult({
    jobId: job.id,
    claimToken: job.claimToken,
    status: commitStatus,
    recoveredText: ocr.recoveredText ?? null,
    errorCode: ocr.errorCode ?? null,
  });

  const phase =
    commit.status === 'discarded_stale' || commit.code === 'stale_version'
      ? 'stale_discard'
      : 'commit';

  emit(opts.log, {
    event: 'page_ocr_worker',
    phase,
    jobId: job.id,
    sourceId: job.sourceId,
    sourceVersion: job.sourceVersion,
    pageNumber: job.pageNumber,
    status: commit.status ?? (commit.ok ? commitStatus : 'failed'),
    errorCode: commit.code ?? ocr.errorCode ?? null,
    durationMs: Date.now() - t0,
    recoveredCharCount: ocr.metadata.recoveredCharCount,
  });

  if (opts.afterTerminalCommit) {
    try {
      await opts.afterTerminalCommit({
        job,
        commitStatus: commit.status,
        errorCode: commit.code ?? ocr.errorCode ?? null,
      });
    } catch {
      // Finalize hook must never fail the OCR commit path; process retry resumes.
    }
  }

  return {
    processed: true,
    jobId: job.id,
    commitStatus: commit.status,
    errorCode: commit.code ?? ocr.errorCode ?? null,
  };
}
