/**
 * @vitest-environment node
 *
 * M1.1E — continuous worker loop tests (injected claim/OCR; no Tesseract).
 */

/**
 * @vitest-environment node
 *
 * M1.1E — continuous worker loop tests (injected claim/OCR; no Tesseract).
 */

import { describe, expect, it, vi } from 'vitest';
import { PAGE_OCR_RECOVERY_VERSION } from '../src/bounds.ts';
import { InMemoryRecoveryLedger } from '../src/inMemoryRecoveryLedger.ts';
import {
  assertWorkerLogHasNoAcademicContent,
  formatWorkerLifecycleLogLine,
} from '../src/privacyLogWorker.ts';
import { runRecoveryWorkerLoop } from '../src/recoveryWorkerLoop.ts';
import {
  claimAndProcessNextRecoveryJob,
} from '../src/runClaimedRecoveryJob.ts';
import type { PageOcrRecoveryResult } from '../src/types.ts';
import {
  createSupabaseTrustedLedger,
} from '../src/supabaseTrustedLedger.ts';
import {
  ZIKUK_PRODUCTION_PROJECT_REF,
  ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE,
  ZIKUK_STAGING_PROJECT_REF,
} from '../src/workerConfig.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const SECTION = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STORAGE = `${USER}/${SECTION}/pdf-obj-1/pdf/pdf-obj-1`;

function fakeRecovered(): PageOcrRecoveryResult {
  return {
    sourceId: SOURCE,
    sourceVersion: 2,
    pageNumber: 3,
    recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
    status: 'recovered',
    recoveredText: 'MEAN VALUE THEOREM TEXT FOR RECOVERY',
    metadata: {
      durationMs: 12,
      renderMs: 4,
      ocrMs: 8,
      renderDpi: 220,
      engine: 'tesseract',
      engineVersion: 'tesseract-test',
      renderer: 'pdfjs+napi-canvas',
      recoveredCharCount: 36,
      recoveryIdentity: `${SOURCE}@v2:p3:${PAGE_OCR_RECOVERY_VERSION}`,
    },
  };
}

function seedLedger() {
  return new InMemoryRecoveryLedger({
    source: {
      sourceId: SOURCE,
      userId: USER,
      sectionId: SECTION,
      storagePath: STORAGE,
      sourceVersionTip: 2,
      retrievalSourceVersion: 1,
      status: 'ready',
    },
    pdfByStoragePath: { [STORAGE]: new TextEncoder().encode('%PDF-1.4 fake') },
    pages: [
      {
        sourceId: SOURCE,
        sourceVersion: 2,
        pageNumber: 3,
        nativeText: 'sparse',
        recoveredText: null,
        canonicalText: 'sparse',
        extractionMethod: 'native',
        extractionVersion: 'pdf-extract-v2-metrics',
        recoveryVersion: null,
        fallbackResult: 'none',
      },
    ],
    jobs: [
      {
        pageNumber: 3,
        detectorReasons: ['SPARSE_TEXT'],
        sourceVersion: 2,
        extractionVersion: 'pdf-extract-v2-metrics',
        recoveryVersion: PAGE_OCR_RECOVERY_VERSION,
      },
    ],
  });
}

describe('runRecoveryWorkerLoop', () => {
  it('5. idle loop does not busy-spin (sleeps when no jobs)', async () => {
    const sleeps: number[] = [];
    const claim = vi.fn(async () => ({ processed: false as const }));
    const ac = new AbortController();
    const loop = runRecoveryWorkerLoop({
      claimAndProcess: claim,
      concurrency: 1,
      idleMs: 40,
      sleep: async ms => {
        sleeps.push(ms);
        if (sleeps.length >= 2) ac.abort();
      },
      signal: ac.signal,
      maxCycles: 10,
    });
    const result = await loop;
    expect(sleeps.length).toBeGreaterThanOrEqual(1);
    expect(sleeps.every(ms => ms >= 40)).toBe(true);
    expect(result.idleCount).toBeGreaterThanOrEqual(1);
    expect(claim.mock.calls.length).toBeLessThan(20);
  });

  it('6–8. queued job claimed → OCR commit via injected recover', async () => {
    const ledger = seedLedger();
    const logs: string[] = [];
    const ac = new AbortController();
    const result = await runRecoveryWorkerLoop({
      claimAndProcess: () =>
        claimAndProcessNextRecoveryJob({
          ledger,
          recoverPageFn: async () => fakeRecovered(),
          log: line => logs.push(line),
        }),
      concurrency: 1,
      idleMs: 1000,
      sleep: async () => {},
      signal: ac.signal,
      maxCycles: 1,
      log: line => logs.push(line),
    });
    expect(result.processedCount).toBe(1);
    expect(result.lastOutcome?.processed).toBe(true);
    expect(result.lastOutcome?.commitStatus).toBe('succeeded');
    for (const line of logs) {
      expect(assertWorkerLogHasNoAcademicContent(line)).toBe(true);
      expect(line).not.toContain('MEAN VALUE');
    }
  });

  it('12. one job exception does not kill the loop', async () => {
    let n = 0;
    const ac = new AbortController();
    const result = await runRecoveryWorkerLoop({
      claimAndProcess: async () => {
        n += 1;
        if (n === 1) throw new Error('boom');
        ac.abort();
        return { processed: false };
      },
      concurrency: 1,
      idleMs: 1000,
      sleep: async () => {},
      signal: ac.signal,
      maxCycles: 5,
    });
    expect(n).toBeGreaterThanOrEqual(2);
    expect(result.stoppedReason).toBe('signal');
  });

  it('13. graceful shutdown stops new claims', async () => {
    let claims = 0;
    const ac = new AbortController();
    const result = await runRecoveryWorkerLoop({
      claimAndProcess: async () => {
        claims += 1;
        ac.abort();
        return { processed: false };
      },
      concurrency: 1,
      idleMs: 50,
      sleep: async () => {},
      signal: ac.signal,
      maxCycles: 20,
    });
    expect(result.stoppedReason).toBe('signal');
    expect(claims).toBeLessThanOrEqual(2);
  });

  it('14. concurrency bounded to configured slots per cycle', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const ac = new AbortController();
    let cycles = 0;
    await runRecoveryWorkerLoop({
      claimAndProcess: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(r => setTimeout(r, 5));
        inFlight -= 1;
        cycles += 1;
        if (cycles >= 4) ac.abort();
        return { processed: false };
      },
      concurrency: 2,
      idleMs: 5,
      sleep: async () => {},
      signal: ac.signal,
      maxCycles: 10,
    });
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('15. lifecycle logs reject OCR body / secrets shapes', () => {
    const ok = formatWorkerLifecycleLogLine({
      event: 'page_ocr_worker_lifecycle',
      phase: 'started',
      concurrency: 1,
      idleMs: 5000,
    });
    expect(assertWorkerLogHasNoAcademicContent(ok)).toBe(true);
    const bad = JSON.stringify({
      event: 'page_ocr_worker_lifecycle',
      recoveredText: 'secret academic',
    });
    expect(assertWorkerLogHasNoAcademicContent(bad)).toBe(false);
  });
});

describe('createSupabaseTrustedLedger production confirm', () => {
  const fakeClient = () =>
    ({
      rpc: async () => ({ data: { ok: true, job: null }, error: null }),
      storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }) as never;

  it('3. wrong / production without confirm refused', () => {
    expect(() =>
      createSupabaseTrustedLedger(fakeClient(), {
        projectRef: ZIKUK_PRODUCTION_PROJECT_REF,
        allowProduction: true,
      }),
    ).toThrow(/production_confirm/);
  });

  it('Production allowed only with confirm', () => {
    const ledger = createSupabaseTrustedLedger(fakeClient(), {
      projectRef: ZIKUK_PRODUCTION_PROJECT_REF,
      allowProduction: true,
      productionConfirm: ZIKUK_RECOVERY_PRODUCTION_CONFIRM_VALUE,
    });
    expect(ledger).toBeTruthy();
  });

  it('staging still works without Production opt-in', () => {
    const ledger = createSupabaseTrustedLedger(fakeClient(), {
      projectRef: ZIKUK_STAGING_PROJECT_REF,
    });
    expect(ledger).toBeTruthy();
  });
});
