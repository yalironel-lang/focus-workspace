/**
 * M1.0B B3.1 — recovery job status model + transition rules (pure).
 */

export type PageRecoveryJobStatus =
  | 'queued'
  | 'claimed'
  | 'succeeded'
  | 'unusable'
  | 'failed'
  | 'discarded_stale';

export type PageRecoveryJobErrorCode =
  | 'invalid_request'
  | 'invalid_page'
  | 'source_unavailable'
  | 'stale_version'
  | 'render_failed'
  | 'ocr_failed'
  | 'timeout'
  | 'output_too_large'
  | 'internal_error'
  | 'retry_exhausted';

const TERMINAL: ReadonlySet<PageRecoveryJobStatus> = new Set([
  'succeeded',
  'unusable',
  'failed',
  'discarded_stale',
]);

export function isTerminalPageRecoveryJobStatus(status: PageRecoveryJobStatus): boolean {
  return TERMINAL.has(status);
}

/** Whether a worker may claim/reclaim this status (with lease rules applied separately). */
export function isClaimablePageRecoveryJobStatus(status: PageRecoveryJobStatus): boolean {
  return status === 'queued' || status === 'claimed';
}

export function isRetryablePageRecoveryError(code: PageRecoveryJobErrorCode): boolean {
  return (
    code === 'timeout' ||
    code === 'ocr_failed' ||
    code === 'render_failed' ||
    code === 'internal_error' ||
    code === 'output_too_large'
  );
}

export function isNonRetryablePageRecoveryError(code: PageRecoveryJobErrorCode): boolean {
  return (
    code === 'invalid_request' ||
    code === 'invalid_page' ||
    code === 'source_unavailable' ||
    code === 'stale_version'
  );
}

/**
 * Map a commit outcome to the next job status given attempt budget.
 * Pure helper for domain tests; SQL RPC is authoritative at runtime.
 */
export function nextJobStatusAfterAttempt(input: {
  current: PageRecoveryJobStatus;
  outcome: 'recovered' | 'unusable' | 'failed';
  errorCode?: PageRecoveryJobErrorCode;
  attemptCount: number;
  maxAttempts: number;
}): PageRecoveryJobStatus {
  if (isTerminalPageRecoveryJobStatus(input.current) && input.current !== 'claimed') {
    return input.current;
  }
  if (input.outcome === 'recovered') return 'succeeded';
  if (input.outcome === 'unusable') return 'unusable';

  const code = input.errorCode ?? 'internal_error';
  if (isNonRetryablePageRecoveryError(code)) return 'failed';
  if (input.attemptCount >= input.maxAttempts) return 'failed';
  if (isRetryablePageRecoveryError(code)) return 'queued';
  return 'failed';
}

export function buildPageRecoveryJobIdentity(input: {
  sourceId: string;
  sourceVersion: number;
  pageNumber: number;
  recoveryVersion: string;
}): string {
  return `${input.sourceId}@v${input.sourceVersion}:p${input.pageNumber}:${input.recoveryVersion}`;
}
