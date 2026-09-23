/**
 * @vitest-environment node
 *
 * M1.0B B3.3A.1 — complete native PDF page ledger wiring (unit).
 * No remote Supabase. No Production. No retrieval flip.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION,
  KNOWLEDGE_PDF_EXTRACTION_VERSION,
} from './bounds.ts';
import { detectPageExtractionSuspicion } from './detectPageExtractionSuspicion.ts';
import { fixturePdfMultiPage, fixturePdfOnePage } from './fixtures.ts';
import { loadPdfJsModule } from './loadPdfJs.ts';
import { decidePageRecoveryTrigger } from './pageRecoveryPolicy.ts';
import {
  applyNativeUpsertConflict,
  buildNativePageLedgerPlan,
} from './persistNativePageLedger.ts';
import {
  runKnowledgeIngest,
  type KnowledgeIngestDeps,
} from './runKnowledgeIngest.ts';
import { validateCanonicalPageSet } from './validateCanonicalPageSet.ts';
import { selectCanonicalPageText } from './canonicalPageText.ts';

async function pdfjs() {
  return loadPdfJsModule();
}

describe('M1.0B B3.3A.1 buildNativePageLedgerPlan', () => {
  it('persists ALL pages including healthy + blank', () => {
    const pages = [
      {
        pageNumber: 1,
        text: 'Healthy theorem content with enough characters for indexing.',
        itemCount: 40,
        meaningfulChars: 80,
        suspiciousUnicodeCount: 0,
      },
      {
        pageNumber: 2,
        text: '',
        itemCount: 0,
        meaningfulChars: 0,
        suspiciousUnicodeCount: 0,
      },
      {
        pageNumber: 3,
        text: 'If is a continuous function on and Then Theorem holds.',
        itemCount: 12,
        meaningfulChars: 40,
        suspiciousUnicodeCount: 0,
      },
    ];
    const suspicionResults = pages.map((p) => detectPageExtractionSuspicion(p));
    const plan = buildNativePageLedgerPlan({ pages, suspicionResults });
    expect(plan.nativePages.map((p) => p.page_number)).toEqual([1, 2, 3]);
    expect(plan.nativePages[1]!.native_text).toBe('');
    expect(plan.expectedPageCount).toBe(3);
    expect(plan.extractionVersion).toBe(KNOWLEDGE_PDF_EXTRACTION_VERSION);
    // Page 3 shell → auto recover; healthy + blank do not
    expect(plan.recoveryPages.map((p) => p.page_number)).toEqual([3]);
    expect(
      decidePageRecoveryTrigger(plan.recoveryPages[0]!.detector_reasons as never[])
        .autoRecover,
    ).toBe(true);
  });

  it('does not enqueue healthy-only pages', () => {
    const pages = [
      {
        pageNumber: 1,
        text: 'Plenty of healthy native text on page one.',
        itemCount: 30,
        meaningfulChars: 50,
        suspiciousUnicodeCount: 0,
      },
      {
        pageNumber: 2,
        text: 'Plenty of healthy native text on page two.',
        itemCount: 30,
        meaningfulChars: 50,
        suspiciousUnicodeCount: 0,
      },
    ];
    const suspicionResults = pages.map((p) => detectPageExtractionSuspicion(p));
    const plan = buildNativePageLedgerPlan({ pages, suspicionResults });
    expect(plan.nativePages).toHaveLength(2);
    expect(plan.recoveryPages).toHaveLength(0);
  });

  it('replay conflict preserves OCR recovered/canonical', () => {
    const afterOcr = applyNativeUpsertConflict({
      existing: {
        native_text: 'If is a continuous',
        recovered_text: 'If f is a continuous function',
        canonical_text: 'If f is a continuous function',
        extraction_method: 'ocr_tesseract',
        detector_reasons: ['SHELL_WITH_MISSING_CONTENT'],
      },
      incoming: {
        page_number: 2,
        native_text: 'If is a continuous',
        detector_reasons: ['SHELL_WITH_MISSING_CONTENT'],
      },
    });
    expect(afterOcr.recovered_text).toBe('If f is a continuous function');
    expect(afterOcr.canonical_text).toBe('If f is a continuous function');
    expect(afterOcr.extraction_method).toBe('ocr_tesseract');
    expect(afterOcr.native_text).toBe('If is a continuous');
  });

  it('failed/unusable recovery keeps native canonical (domain)', () => {
    const failed = selectCanonicalPageText({
      nativeText: 'native kept',
      recoveredText: null,
      recoveryStatus: 'failed',
    });
    expect(failed.canonicalText).toBe('native kept');
    const unusable = selectCanonicalPageText({
      nativeText: 'native kept',
      recoveredText: 'bad',
      recoveryStatus: 'unusable',
    });
    expect(unusable.canonicalText).toBe('native kept');
  });

  it('successful recovery replaces canonical while native preserved', () => {
    const ok = selectCanonicalPageText({
      nativeText: 'If is a continuous',
      recoveredText: 'If f is a continuous function on [a,b]',
      recoveryStatus: 'recovered',
    });
    expect(ok.canonicalText).toContain('continuous');
    expect(ok.usedRecovered).toBe(true);
  });
});

describe('M1.0B B3.3A.1 ingest wiring', () => {
  const sectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const objectId = 'pdf-obj-ledger';
  const userId = '11111111-1111-4111-8111-111111111111';

  async function makeDeps(opts?: {
    bytes?: Uint8Array;
    tipVersion?: number;
  }): Promise<
    KnowledgeIngestDeps & {
      upsertCalls: unknown[];
      enqueueCalls: unknown[];
      pageStore: Map<string, ReturnType<typeof applyNativeUpsertConflict>>;
    }
  > {
    const tipVersion = opts?.tipVersion ?? 2;
    const upsertCalls: unknown[] = [];
    const enqueueCalls: unknown[] = [];
    const pageStore = new Map<string, ReturnType<typeof applyNativeUpsertConflict>>();

    const deps: KnowledgeIngestDeps = {
      loadOwnedPdfObject: vi.fn(async () => ({ ok: true as const, objectType: 'pdf' })),
      downloadPdfBytes: vi.fn(async () => ({
        ok: true as const,
        bytes: opts?.bytes ?? fixturePdfMultiPage(),
      })),
      beginIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-ledger',
        source_version: tipVersion,
        status: 'pending',
        idempotent: false,
      })),
      finalizeIngest: vi.fn(async ({ status, chunks, sourceVersion }) => {
        if (status === 'ready') {
          return {
            ok: true,
            source_id: 'src-ledger',
            source_version: sourceVersion,
            status: 'ready',
            chunk_count: chunks?.length ?? 0,
          };
        }
        return {
          ok: true,
          source_id: 'src-ledger',
          source_version: sourceVersion,
          status: 'failed',
        };
      }),
      upsertPageTextsNative: vi.fn(async ({ sourceVersion, pages }) => {
        upsertCalls.push({ sourceVersion, pages });
        for (const p of pages) {
          const key = `${sourceVersion}:${p.page_number}`;
          const prev = pageStore.get(key) ?? null;
          pageStore.set(
            key,
            applyNativeUpsertConflict({
              existing: prev
                ? {
                    native_text: prev.native_text,
                    recovered_text: prev.recovered_text,
                    canonical_text: prev.canonical_text,
                    extraction_method: prev.extraction_method,
                    detector_reasons: prev.detector_reasons,
                  }
                : null,
              incoming: p,
            }),
          );
        }
        return { ok: true, page_count: pages.length };
      }),
      enqueuePageRecoveryJobs: vi.fn(async (input) => {
        enqueueCalls.push(input);
        return { ok: true, enqueued: input.pages.length, already_present: 0 };
      }),
      pdfjs: await pdfjs(),
    };

    return Object.assign(deps, { upsertCalls, enqueueCalls, pageStore });
  }

  it('healthy multi-page PDF persists ALL pages 1..P', async () => {
    const deps = await makeDeps({ tipVersion: 1, bytes: fixturePdfMultiPage() });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(true);
    expect(deps.upsertCalls).toHaveLength(1);
    const call = deps.upsertCalls[0] as {
      sourceVersion: number;
      pages: Array<{ page_number: number; native_text: string }>;
    };
    expect(call.sourceVersion).toBe(1);
    expect(call.pages.map((p) => p.page_number)).toEqual([1, 2, 3]);
    expect(call.pages.every((p) => typeof p.native_text === 'string')).toBe(true);

    const validated = validateCanonicalPageSet({
      sourceId: 'src-ledger',
      sourceVersion: 1,
      expectedPageCount: 3,
      rows: call.pages.map((p) => ({
        sourceId: 'src-ledger',
        sourceVersion: 1,
        pageNumber: p.page_number,
        canonicalText: p.native_text,
      })),
    });
    expect(validated.ok).toBe(true);
  });

  it('same-hash ready resume does not re-upsert (no duplicate work)', async () => {
    const deps = await makeDeps({ tipVersion: 1, bytes: fixturePdfOnePage() });
    vi.mocked(deps.beginIngest).mockResolvedValue({
      ok: true,
      source_id: 'src-ledger',
      source_version: 1,
      status: 'ready',
      idempotent: true,
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.reused).toBe(true);
    expect(deps.upsertCalls).toHaveLength(0);
    expect(deps.enqueueCalls).toHaveLength(0);
  });

  it('replay does not destroy OCR evidence on conflict model', async () => {
    const deps = await makeDeps({ tipVersion: 2, bytes: fixturePdfMultiPage() });
    // Seed OCR on page 1 of tip 2
    deps.pageStore.set(
      '2:1',
      applyNativeUpsertConflict({
        existing: null,
        incoming: { page_number: 1, native_text: 'native', detector_reasons: [] },
      }),
    );
    deps.pageStore.set('2:1', {
      native_text: 'native',
      recovered_text: 'OCR recovered continuous text',
      canonical_text: 'OCR recovered continuous text',
      extraction_method: 'ocr_tesseract',
      detector_reasons: ['SHELL_WITH_MISSING_CONTENT'],
    });

    await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    const after = deps.pageStore.get('2:1');
    expect(after?.extraction_method).toBe('ocr_tesseract');
    expect(after?.canonical_text).toBe('OCR recovered continuous text');
    expect(after?.recovered_text).toBe('OCR recovered continuous text');
  });

  it('N+1 persistence keys only tip version (does not write N)', async () => {
    const deps = await makeDeps({ tipVersion: 2, bytes: fixturePdfMultiPage() });
    // Pre-seed N evidence that must remain untouched
    deps.pageStore.set('1:1', {
      native_text: 'N page',
      recovered_text: null,
      canonical_text: 'N page',
      extraction_method: 'native',
      detector_reasons: [],
    });
    await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(deps.pageStore.get('1:1')?.native_text).toBe('N page');
    expect([...deps.pageStore.keys()].filter((k) => k.startsWith('2:')).length).toBe(3);
    const upsertVersion = (deps.upsertCalls[0] as { sourceVersion: number }).sourceVersion;
    expect(upsertVersion).toBe(2);
  });

  it('B3.3A assembler receives complete page set from ingest upsert payload', async () => {
    const deps = await makeDeps({ tipVersion: 2, bytes: fixturePdfMultiPage() });
    await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    const pages = (deps.upsertCalls[0] as { pages: Array<{ page_number: number; native_text: string }> })
      .pages;
    const validated = validateCanonicalPageSet({
      sourceId: 'src-ledger',
      sourceVersion: 2,
      expectedPageCount: pages.length,
      rows: pages.map((p) => ({
        sourceId: 'src-ledger',
        sourceVersion: 2,
        pageNumber: p.page_number,
        canonicalText: p.native_text,
      })),
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  });

  it('recovery version constant matches worker contract', () => {
    expect(KNOWLEDGE_PAGE_OCR_RECOVERY_VERSION).toBe('page-ocr-recovery-v1');
  });
});

describe('M1.0B B3.3A.1 schema contract (017 upsert)', () => {
  it('SQL preserves ocr_tesseract canonical on native re-upsert', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/017_ai_knowledge_page_recovery.sql'),
      'utf8',
    );
    expect(sql).toContain('ai_knowledge_upsert_page_texts_native');
    expect(sql).toContain("when ai_knowledge_page_texts.extraction_method = 'ocr_tesseract'");
    expect(sql).toContain('then ai_knowledge_page_texts.canonical_text');
  });
});
