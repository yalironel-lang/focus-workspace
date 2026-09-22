/**
 * @vitest-environment node
 *
 * M1.0B B3.2 — trusted worker integration tests (in-memory ledger).
 * Does not touch Production Supabase. Does not require remote migration 017.
 */

import { describe, expect, it, vi } from 'vitest';
import { PAGE_OCR_RECOVERY_VERSION } from '../src/bounds.ts';
import { InMemoryRecoveryLedger } from '../src/inMemoryRecoveryLedger.ts';
import {
  assertWorkerLogHasNoAcademicContent,
  formatWorkerRecoveryLogLine,
} from '../src/privacyLogWorker.ts';
import { resolveTrustedJobPdf } from '../src/resolveTrustedJobPdf.ts';
import {
  claimAndProcessNextRecoveryJob,
  processClaimedRecoveryJob,
} from '../src/runClaimedRecoveryJob.ts';
import { SOURCE_VERSION_LIFECYCLE_NOTE } from '../src/sourceVersionLifecycle.ts';
import { validatePageOcrRecoveryRequest } from '../src/validateRequest.ts';
import type { PageOcrRecoveryResult } from '../src/types.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const SECTION = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STORAGE = `${USER}/${SECTION}/pdf-obj-1/pdf/pdf-obj-1`;

function fakePdf(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4 fake');
}

function seedLedger(overrides?: {
  sourceVersionTip?: number;
  retrievalSourceVersion?: number | null;
  jobs?: Array<{
    pageNumber: number;
    detectorReasons: string[];
    sourceVersion: number;
  }>;
  nativeText?: string;
}) {
  const tip = overrides?.sourceVersionTip ?? 2;
  const jobs = overrides?.jobs ?? [
    {
      pageNumber: 3,
      detectorReasons: ['SHELL_WITH_MISSING_CONTENT', 'SPARSE_TEXT'],
      sourceVersion: tip,
    },
  ];
  const pages = jobs.map((j) => ({
    sourceId: SOURCE,
    sourceVersion: j.sourceVersion,
    pageNumber: j.pageNumber,
    nativeText: overrides?.nativeText ?? 'If is a continuous function on and Then Theorem',
    recoveredText: null as string | null,
    canonicalText: overrides?.nativeText ?? 'If is a continuous function on and Then Theorem',
    extractionMethod: 'native' as const,
    extractionVersion: 'pdf-extract-v2-metrics',
    recoveryVersion: null as string | null,
    fallbackResult: 'none' as string | null,
  }));
  // Also seed an older version page to prove isolation
  pages.push({
    sourceId: SOURCE,
    sourceVersion: 1,
    pageNumber: 3,
    nativeText: 'OLD_VERSION_NATIVE_V1',
    recoveredText: null,
    canonicalText: 'OLD_VERSION_NATIVE_V1',
    extractionMethod: 'native',
    extractionVersion: 'pdf-extract-v2-metrics',
    recoveryVersion: null,
    fallbackResult: 'none',
  });

  return new InMemoryRecoveryLedger({
    source: {
      sourceId: SOURCE,
      userId: USER,
      sectionId: SECTION,
      storagePath: STORAGE,
      sourceVersionTip: tip,
      retrievalSourceVersion: overrides?.retrievalSourceVersion ?? 1,
      status: 'processing',
    },
    pages,
    jobs: jobs.map((j) => ({
      ...j,
      extractionVersion: 'pdf-extract-v2-metrics',
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
    })),
    pdfByStoragePath: { [STORAGE]: fakePdf() },
  });
}

function mockRecovered(text: string): PageOcrRecoveryResult {
  return {
    sourceId: SOURCE,
    sourceVersion: 2,
    pageNumber: 3,
    recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
    status: 'recovered',
    recoveredText: text,
    metadata: {
      durationMs: 10,
      renderMs: 4,
      ocrMs: 6,
      renderDpi: 220,
      engine: 'tesseract',
      engineVersion: 'tesseract-test',
      renderer: 'pdfjs+napi-canvas',
      recoveredCharCount: text.length,
      recoveryIdentity: `${SOURCE}@v2:p3:${PAGE_OCR_RECOVERY_VERSION}`,
    },
  };
}

describe('M1.0B B3.2 trusted worker integration', () => {
  it('1. claims a queued job exactly once under concurrent claimers', async () => {
    const ledger = seedLedger();
    const [a, b] = await Promise.all([ledger.claimJob(), ledger.claimJob()]);
    const winners = [a, b].filter((r) => r.ok && r.job);
    expect(winners).toHaveLength(1);
    const idle = [a, b].filter((r) => r.ok && !r.job);
    expect(idle).toHaveLength(1);
  });

  it('2. lease/token prevents unauthorized or stale commit', async () => {
    const ledger = seedLedger();
    const claimed = await ledger.claimJob();
    expect(claimed.ok && claimed.job).toBeTruthy();
    if (!claimed.ok || !claimed.job) return;
    const bad = await ledger.commitRecoveryResult({
      jobId: claimed.job.id,
      claimToken: '00000000-0000-4000-8000-000000000000',
      status: 'recovered',
      recoveredText: 'enough recovered characters here',
    });
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe('stale_version');
  });

  it('3. duplicate delivery/commit is idempotent', async () => {
    const ledger = seedLedger();
    const claimed = await ledger.claimJob();
    if (!claimed.ok || !claimed.job) throw new Error('claim');
    const first = await ledger.commitRecoveryResult({
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken,
      status: 'recovered',
      recoveredText: 'enough recovered characters here',
    });
    expect(first.status).toBe('succeeded');
    const second = await ledger.commitRecoveryResult({
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken,
      status: 'recovered',
      recoveredText: 'DIFFERENT TEXT SHOULD NOT APPLY',
    });
    expect(second.idempotent).toBe(true);
    expect(ledger.getPage(SOURCE, 2, 3)?.canonicalText).toContain('enough recovered');
  });

  it('4. worker request validation rejects arbitrary Storage path fields', () => {
    const r = validatePageOcrRecoveryRequest({
      sourceId: 'src',
      sourceVersion: 1,
      pageNumber: 1,
      extractionVersion: 'pdf-extract-v2-metrics',
      recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
      storagePath: 'evil/path',
    });
    expect(r.ok).toBe(false);
  });

  it('5. correct private source resolves through trusted identity only', async () => {
    const ledger = seedLedger();
    const claimed = await ledger.claimJob();
    if (!claimed.ok || !claimed.job) throw new Error('claim');
    const resolved = await resolveTrustedJobPdf(claimed.job, ledger);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source.storagePath).toBe(STORAGE);
    expect(resolved.pdfBytes.byteLength).toBeGreaterThan(0);
  });

  it('6. wrong source_version is rejected', async () => {
    const ledger = seedLedger({ sourceVersionTip: 2 });
    const claimed = await ledger.claimJob();
    if (!claimed.ok || !claimed.job) throw new Error('claim');
    claimed.job.sourceVersion = 99;
    const resolved = await resolveTrustedJobPdf(claimed.job, ledger);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.code).toBe('stale_version');
  });

  it('7. deleted/missing source is discarded safely', async () => {
    const ledger = seedLedger();
    const claimed = await ledger.claimJob();
    if (!claimed.ok || !claimed.job) throw new Error('claim');
    ledger.mutateSource(SOURCE, { deleted: true });
    const commit = await ledger.commitRecoveryResult({
      jobId: claimed.job.id,
      claimToken: claimed.job.claimToken,
      status: 'recovered',
      recoveredText: 'enough recovered characters here',
    });
    expect(commit.status).toBe('discarded_stale');
    expect(ledger.getPage(SOURCE, 2, 3)?.canonicalText).not.toContain('enough recovered');
  });

  it('8. invalid page fails safely', async () => {
    const ledger = seedLedger();
    const claimed = await ledger.claimJob();
    if (!claimed.ok || !claimed.job) throw new Error('claim');
    claimed.job.pageNumber = 0;
    const resolved = await resolveTrustedJobPdf(claimed.job, ledger);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.code).toBe('invalid_page');
  });

  it('9/10. successful OCR updates recovered/canonical and preserves native', async () => {
    const logs: string[] = [];
    const ledger = seedLedger();
    const recovered =
      'If f is continuous on [a,b] and differentiable on (a,b) then there exists c.';
    await claimAndProcessNextRecoveryJob({
      ledger,
      log: (l) => logs.push(l),
      recoverPageFn: async () => mockRecovered(recovered),
    });
    const page = ledger.getPage(SOURCE, 2, 3)!;
    expect(page.nativeText).toContain('If is a continuous');
    expect(page.recoveredText).toBe(recovered);
    expect(page.canonicalText).toBe(recovered);
    expect(page.extractionMethod).toBe('ocr_tesseract');
    expect(logs.every(assertWorkerLogHasNoAcademicContent)).toBe(true);
    expect(logs.join('\n')).not.toContain(recovered);
  });

  it('11. failed/unusable OCR leaves native canonical', async () => {
    const ledger = seedLedger();
    await claimAndProcessNextRecoveryJob({
      ledger,
      recoverPageFn: async () => ({
        ...mockRecovered('x'),
        status: 'unusable',
        recoveredText: 'x',
        metadata: { ...mockRecovered('x').metadata, recoveredCharCount: 1 },
      }),
    });
    const page = ledger.getPage(SOURCE, 2, 3)!;
    expect(page.canonicalText).toBe(page.nativeText);
    expect(page.fallbackResult).toBe('native_after_ocr_unusable');
  });

  it('12/13. transient failure requeues; attempt 3 exhausts', async () => {
    const ledger = seedLedger({ maxAttempts: 3 } as never);
    // force maxAttempts via constructor opts
    const ledger2 = new InMemoryRecoveryLedger(
      {
        source: {
          sourceId: SOURCE,
          userId: USER,
          sectionId: SECTION,
          storagePath: STORAGE,
          sourceVersionTip: 2,
          retrievalSourceVersion: 1,
          status: 'processing',
        },
        pages: [
          {
            sourceId: SOURCE,
            sourceVersion: 2,
            pageNumber: 3,
            nativeText: 'native',
            recoveredText: null,
            canonicalText: 'native',
            extractionMethod: 'native',
            extractionVersion: 'pdf-extract-v2-metrics',
            recoveryVersion: null,
            fallbackResult: 'none',
          },
        ],
        jobs: [
          {
            pageNumber: 3,
            detectorReasons: ['LOW_TEXT_ITEM_COUNT'],
            extractionVersion: 'pdf-extract-v2-metrics',
            recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
            sourceVersion: 2,
          },
        ],
        pdfByStoragePath: { [STORAGE]: fakePdf() },
      },
      { maxAttempts: 3, retryBaseSeconds: 1 },
    );

    for (let i = 0; i < 2; i++) {
      const c = await ledger2.claimJob();
      if (!c.ok || !c.job) throw new Error('claim');
      const r = await ledger2.commitRecoveryResult({
        jobId: c.job.id,
        claimToken: c.job.claimToken,
        status: 'failed',
        errorCode: 'timeout',
      });
      expect(r.retry).toBe(true);
      expect(r.status).toBe('queued');
      // make immediately available
      const job = ledger2.getJob(c.job.id)!;
      job.availableAt = Date.now() - 1;
    }
    const c3 = await ledger2.claimJob();
    if (!c3.ok || !c3.job) throw new Error('claim3');
    expect(c3.job.attemptCount).toBe(3);
    const terminal = await ledger2.commitRecoveryResult({
      jobId: c3.job.id,
      claimToken: c3.job.claimToken,
      status: 'failed',
      errorCode: 'timeout',
    });
    expect(terminal.status).toBe('failed');
    expect(terminal.code).toBe('retry_exhausted');
    expect(ledger2.getPage(SOURCE, 2, 3)?.canonicalText).toBe('native');
    void ledger;
  });

  it('14. multiple jobs for same source complete independently', async () => {
    const ledger = seedLedger({
      jobs: [
        { pageNumber: 3, detectorReasons: ['SHELL_WITH_MISSING_CONTENT'], sourceVersion: 2 },
        { pageNumber: 10, detectorReasons: ['LOW_TEXT_ITEM_COUNT'], sourceVersion: 2 },
      ],
    });
    const results = [];
    for (let i = 0; i < 2; i++) {
      results.push(
        await claimAndProcessNextRecoveryJob({
          ledger,
          recoverPageFn: async (req) => {
            const pageNumber =
              typeof req === 'object' && req && 'pageNumber' in req
                ? Number((req as { pageNumber: number }).pageNumber)
                : 0;
            return {
              ...mockRecovered(`recovered page ${pageNumber} with enough chars`),
              pageNumber,
              sourceVersion: 2,
            };
          },
        }),
      );
    }
    expect(results.every((r) => r.processed)).toBe(true);
    expect(ledger.getPage(SOURCE, 2, 3)?.canonicalText).toContain('recovered page 3');
    expect(ledger.getPage(SOURCE, 2, 10)?.canonicalText).toContain('recovered page 10');
  });

  it('16. logs contain no academic text/content keys', () => {
    const line = formatWorkerRecoveryLogLine({
      event: 'page_ocr_worker',
      phase: 'ocr',
      jobId: 'j',
      sourceId: SOURCE,
      recoveredCharCount: 12,
      status: 'recovered',
    });
    expect(assertWorkerLogHasNoAcademicContent(line)).toBe(true);
    expect(line).not.toMatch(/native_text|recovered_text|canonical_text/);
  });

  it('17. feature flag disables recovery path cleanly', async () => {
    const ledger = seedLedger();
    const r = await claimAndProcessNextRecoveryJob({
      ledger,
      recoveryEnabled: false,
      recoverPageFn: async () => mockRecovered('should not run'),
    });
    expect(r.processed).toBe(false);
    expect(ledger.jobs[0]?.status).toBe('queued');
  });

  it('20. stale-during-OCR result is rejected at commit time', async () => {
    const ledger = seedLedger();
    const claimed = await ledger.claimJob();
    if (!claimed.ok || !claimed.job) throw new Error('claim');
    const result = await processClaimedRecoveryJob(claimed.job, {
      ledger,
      afterResolveBeforeOcr: async () => {
        ledger.mutatePage(SOURCE, 2, 3, { extractionVersion: 'changed-v' });
      },
      recoverPageFn: async () =>
        mockRecovered('enough recovered characters that would otherwise commit'),
    });
    expect(result.commitStatus).toBe('discarded_stale');
    expect(ledger.getPage(SOURCE, 2, 3)?.canonicalText).toContain('If is a continuous');
    expect(ledger.getPage(SOURCE, 2, 3)?.recoveredText).toBeNull();
  });

  it('24. N retrieval-active stays isolated from N+1 recovery evidence', async () => {
    expect(SOURCE_VERSION_LIFECYCLE_NOTE).toContain('processing_version');
    const ledger = seedLedger({
      sourceVersionTip: 2,
      retrievalSourceVersion: 1,
      jobs: [{ pageNumber: 3, detectorReasons: ['SHELL_WITH_MISSING_CONTENT'], sourceVersion: 2 }],
    });
    await claimAndProcessNextRecoveryJob({
      ledger,
      recoverPageFn: async () => mockRecovered('NPLUS1 recovered theorem text enough chars'),
    });
    expect(ledger.getPage(SOURCE, 1, 3)?.canonicalText).toBe('OLD_VERSION_NATIVE_V1');
    expect(ledger.getPage(SOURCE, 1, 3)?.recoveredText).toBeNull();
    expect(ledger.getPage(SOURCE, 2, 3)?.canonicalText).toContain('NPLUS1 recovered');
    // In-memory model: tip=2 processing while retrieval pointer remains 1
    expect(ledger.sources.get(SOURCE)?.retrievalSourceVersion).toBe(1);
    expect(ledger.sources.get(SOURCE)?.sourceVersionTip).toBe(2);
  });

  it('download refuses absolute/foreign paths even if somehow requested', async () => {
    const ledger = seedLedger();
    // Direct download API only serves seeded authoritative keys
    expect(await ledger.downloadPdfByStoragePath('/etc/passwd')).toBeNull();
    expect(await ledger.downloadPdfByStoragePath('evil/other')).toBeNull();
  });
});

describe('M1.0B B3.2 environment gate documentation', () => {
  it('records that remote 017 must not use Production as first exercise', () => {
    // This suite intentionally uses InMemoryRecoveryLedger — not Production.
    expect(true).toBe(true);
  });
});
