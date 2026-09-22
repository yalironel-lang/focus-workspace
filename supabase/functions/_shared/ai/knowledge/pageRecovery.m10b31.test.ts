/**
 * @vitest-environment node
 *
 * M1.0B B3.1 — recovery policy, canonical selection, job state (pure domain).
 */

import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
  KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS,
  KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION,
} from './bounds.ts';
import {
  isRecoveredTextValidForCanonical,
  selectCanonicalPageText,
} from './canonicalPageText.ts';
import {
  buildPageRecoveryJobIdentity,
  isNonRetryablePageRecoveryError,
  isRetryablePageRecoveryError,
  isTerminalPageRecoveryJobStatus,
  nextJobStatusAfterAttempt,
} from './pageRecoveryJobState.ts';
import { decidePageRecoveryTrigger } from './pageRecoveryPolicy.ts';

describe('M1.0B B3.1 page recovery trigger policy', () => {
  it('auto-recovers SHELL and LOW_TEXT_ITEM_COUNT', () => {
    const shell = decidePageRecoveryTrigger(['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT']);
    expect(shell.autoRecover).toBe(true);
    expect(shell.decision).toBe('auto_recover');
    expect(shell.strongTriggers).toContain('SHELL_WITH_MISSING_CONTENT');
    expect(shell.policyVersion).toBe(KNOWLEDGE_PAGE_RECOVERY_POLICY_VERSION);
    expect(shell.recoveryVersion).toBe(KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION);

    const low = decidePageRecoveryTrigger(['LOW_TEXT_ITEM_COUNT']);
    expect(low.autoRecover).toBe(true);
  });

  it('observes SPARSE_TEXT alone without auto-recover', () => {
    const sparse = decidePageRecoveryTrigger(['SPARSE_TEXT']);
    expect(sparse.autoRecover).toBe(false);
    expect(sparse.decision).toBe('observe_only');
  });

  it('treats SUSPICIOUS_UNICODE as experimental/disabled', () => {
    const u = decidePageRecoveryTrigger(['SUSPICIOUS_UNICODE']);
    expect(u.autoRecover).toBe(false);
    expect(u.decision).toBe('disabled_experimental');
  });

  it('healthy pages create no recovery', () => {
    const h = decidePageRecoveryTrigger([]);
    expect(h.decision).toBe('healthy');
    expect(h.autoRecover).toBe(false);
  });

  it('master disable forces observe-only even for strong triggers', () => {
    const r = decidePageRecoveryTrigger(['LOW_TEXT_ITEM_COUNT'], { enabled: false });
    expect(r.autoRecover).toBe(false);
  });
});

describe('M1.0B B3.1 canonical page text', () => {
  it('uses native when healthy / no recovery', () => {
    const d = selectCanonicalPageText({
      nativeText: 'native theorem shell',
      recoveredText: null,
      recoveryStatus: null,
    });
    expect(d.canonicalText).toBe('native theorem shell');
    expect(d.extractionMethod).toBe('native');
    expect(d.usedRecovered).toBe(false);
  });

  it('uses recovered only when recovered status and valid', () => {
    const ok = selectCanonicalPageText({
      nativeText: 'shell',
      recoveredText: 'If f is continuous on [a,b] and differentiable...',
      recoveryStatus: 'recovered',
    });
    expect(ok.usedRecovered).toBe(true);
    expect(ok.extractionMethod).toBe('ocr_tesseract');
    expect(ok.canonicalText).toContain('continuous');

    expect(isRecoveredTextValidForCanonical('abc')).toBe(false);
    const bad = selectCanonicalPageText({
      nativeText: 'shell',
      recoveredText: 'x',
      recoveryStatus: 'recovered',
    });
    expect(bad.usedRecovered).toBe(false);
    expect(bad.fallbackResult).toBe('native_after_ocr_unusable');
  });

  it('falls back to native on failed/unusable without discarding native', () => {
    const failed = selectCanonicalPageText({
      nativeText: 'native kept',
      recoveredText: 'noise',
      recoveryStatus: 'failed',
    });
    expect(failed.canonicalText).toBe('native kept');
    expect(failed.fallbackResult).toBe('native_after_ocr_failed');
  });
});

describe('M1.0B B3.1 job state transitions', () => {
  it('builds deterministic recovery identity', () => {
    expect(
      buildPageRecoveryJobIdentity({
        sourceId: 'src',
        sourceVersion: 2,
        pageNumber: 3,
        recoveryVersion: KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
      }),
    ).toBe(`src@v2:p3:${KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION}`);
  });

  it('classifies retryable vs non-retryable errors', () => {
    expect(isRetryablePageRecoveryError('timeout')).toBe(true);
    expect(isNonRetryablePageRecoveryError('invalid_page')).toBe(true);
    expect(isTerminalPageRecoveryJobStatus('succeeded')).toBe(true);
    expect(isTerminalPageRecoveryJobStatus('queued')).toBe(false);
  });

  it('retries transient failures within max attempts then fails', () => {
    expect(
      nextJobStatusAfterAttempt({
        current: 'claimed',
        outcome: 'failed',
        errorCode: 'timeout',
        attemptCount: 1,
        maxAttempts: KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS,
      }),
    ).toBe('queued');

    expect(
      nextJobStatusAfterAttempt({
        current: 'claimed',
        outcome: 'failed',
        errorCode: 'timeout',
        attemptCount: KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS,
        maxAttempts: KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS,
      }),
    ).toBe('failed');

    expect(
      nextJobStatusAfterAttempt({
        current: 'claimed',
        outcome: 'failed',
        errorCode: 'invalid_page',
        attemptCount: 1,
        maxAttempts: KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS,
      }),
    ).toBe('failed');

    expect(
      nextJobStatusAfterAttempt({
        current: 'claimed',
        outcome: 'recovered',
        attemptCount: 1,
        maxAttempts: KNOWLEDGE_PAGE_RECOVERY_MAX_ATTEMPTS,
      }),
    ).toBe('succeeded');
  });
});
