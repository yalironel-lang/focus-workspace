/**
 * @vitest-environment node
 *
 * M1.0B B1 — extraction contract metrics + pipeline non-regression.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_MAX_PAGES,
  KNOWLEDGE_PDF_EXTRACTION_VERSION,
} from './bounds.ts';
import { chunkPageTexts } from './chunkPages.ts';
import { extractPdfTextFromBytes, type PdfJsModule } from './extractPdfText.ts';
import { countSuspiciousUnicodeChars } from './extractionMetrics.ts';
import {
  fixtureNotPdf,
  fixturePdfBlank,
  fixturePdfMultiPage,
  fixturePdfOnePage,
} from './fixtures.ts';
import { loadPdfJsModule } from './loadPdfJs.ts';
import { meaningfulCharCount } from './normalizeText.ts';
import { assertSafeKnowledgeLogPayload } from './privacyLog.ts';
import { formatKnowledgeSuspicionLogLine } from './privacyLogSuspicion.ts';
import {
  buildSuspicionObservationSummary,
  isPageSuspicionDetectEnabled,
} from './pageSuspicionObserve.ts';
import {
  runKnowledgeIngest,
  type KnowledgeIngestDeps,
} from './runKnowledgeIngest.ts';

async function pdfjs() {
  return loadPdfJsModule();
}

describe('M1.0B B1 extraction contract', () => {
  it('captures itemCount from pdf.js items and deterministic meaningfulChars', async () => {
    const items = [{ str: 'Hello' }, { str: 'ZIKUK' }, { str: 'world' }];
    const fakePdfjs: PdfJsModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items }),
          }),
        }),
      }),
    };
    // Valid PDF magic so extract proceeds past header check.
    const bytes = fixturePdfOnePage();
    const result = await extractPdfTextFromBytes(bytes, fakePdfjs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extractionVersion).toBe(KNOWLEDGE_PDF_EXTRACTION_VERSION);
    expect(result.pages[0]?.itemCount).toBe(3);
    expect(result.pages[0]?.text).toBe('Hello ZIKUK world');
    expect(result.pages[0]?.meaningfulChars).toBe(meaningfulCharCount('Hello ZIKUK world'));
    expect(result.pages[0]?.suspiciousUnicodeCount).toBe(0);
  });

  it('preserves existing page text and page numbers on real pdfjs fixtures', async () => {
    const one = await extractPdfTextFromBytes(fixturePdfOnePage(), await pdfjs());
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    expect(one.pages[0]?.pageNumber).toBe(1);
    expect(one.pages[0]?.text).toContain('Hello ZIKUK');
    expect(typeof one.pages[0]?.itemCount).toBe('number');
    expect(one.pages[0]?.meaningfulChars).toBe(meaningfulCharCount(one.pages[0]!.text));

    const multi = await extractPdfTextFromBytes(fixturePdfMultiPage(), await pdfjs());
    expect(multi.ok).toBe(true);
    if (!multi.ok) return;
    expect(multi.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(multi.pages[0]?.text).toContain('Page one');
  });

  it('blank PDF still extracts empty pages; errors retain prior codes', async () => {
    const blank = await extractPdfTextFromBytes(fixturePdfBlank(), await pdfjs());
    expect(blank.ok).toBe(true);
    if (!blank.ok) return;
    expect(blank.pagesWithText).toBe(0);
    expect(blank.pages.every((p) => p.itemCount === 0 || p.meaningfulChars === 0)).toBe(true);

    const bad = await extractPdfTextFromBytes(fixtureNotPdf(), await pdfjs());
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('extract_failed');
  });

  it('enforces max pages bound unchanged', async () => {
    const fakePdfjs: PdfJsModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: KNOWLEDGE_MAX_PAGES + 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
          }),
        }),
      }),
    };
    const result = await extractPdfTextFromBytes(fixturePdfOnePage(), fakePdfjs);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('too_many_pages');
  });

  it('meaningfulChars and PUA count are deterministic helpers', () => {
    expect(meaningfulCharCount('a b\nc')).toBe(3);
    expect(countSuspiciousUnicodeChars('αβγ')).toBe(0);
    expect(countSuspiciousUnicodeChars('\uE001\uE002')).toBe(2);
  });
});

describe('M1.0B B1 pipeline non-regression', () => {
  it('chunk input text is unchanged when metric fields are present', () => {
    const withMetrics = [
      {
        pageNumber: 1,
        text: 'Alpha paragraph one.\n\nAlpha paragraph two that is long enough.',
        itemCount: 10,
        meaningfulChars: 50,
        suspiciousUnicodeCount: 0,
      },
      {
        pageNumber: 2,
        text: 'Beta only page two content that is long enough to keep.',
        itemCount: 8,
        meaningfulChars: 40,
        suspiciousUnicodeCount: 0,
      },
    ];
    const plain = withMetrics.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
    expect(chunkPageTexts(withMetrics)).toEqual(chunkPageTexts(plain));
  });

  it('ingest finalize still receives the same chunk texts (detector observational)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const objectId = 'pdf-obj-1';
    const userId = '11111111-1111-4111-8111-111111111111';
    const bytes = fixturePdfOnePage();

    let finalizedChunks: { text: string; page_number: number }[] | null = null;
    const deps: KnowledgeIngestDeps = {
      loadOwnedPdfObject: vi.fn(async () => ({ ok: true as const, objectType: 'pdf' })),
      downloadPdfBytes: vi.fn(async () => ({ ok: true as const, bytes })),
      beginIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-1',
        source_version: 1,
        status: 'pending',
        idempotent: false,
      })),
      finalizeIngest: vi.fn(async ({ status, chunks }) => {
        if (status === 'ready') {
          finalizedChunks = (chunks ?? []).map((c) => ({
            text: c.text,
            page_number: c.page_number,
          }));
          return {
            ok: true,
            source_id: 'src-1',
            source_version: 1,
            status: 'ready',
            chunk_count: chunks?.length ?? 0,
          };
        }
        return { ok: true, source_id: 'src-1', source_version: 1, status: 'failed' };
      }),
      upsertPageTextsNative: vi.fn(async ({ pages }) => ({
        ok: true,
        page_count: pages.length,
      })),
      enqueuePageRecoveryJobs: vi.fn(async () => ({
        ok: true,
        enqueued: 0,
        already_present: 0,
      })),
      pdfjs: await pdfjs(),
      recoveryEnabled: false,
    };

    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(true);
    expect(finalizedChunks).not.toBeNull();
    expect(finalizedChunks!.length).toBeGreaterThan(0);
    expect(finalizedChunks!.every((c) => c.text.includes('Hello ZIKUK') || c.text.length > 0)).toBe(
      true,
    );

    // Observation log present when enabled; never includes raw text keys.
    expect(isPageSuspicionDetectEnabled()).toBe(true);
    const suspicionLogs = logSpy.mock.calls
      .map((c) => String(c[0] ?? ''))
      .filter((s) => s.includes('knowledge_page_suspicion'));
    expect(suspicionLogs.length).toBe(1);
    const parsed = JSON.parse(suspicionLogs[0]!);
    expect(assertSafeKnowledgeLogPayload(parsed)).toBe(true);
    expect(parsed).not.toHaveProperty('text');
    expect(parsed.event).toBe('knowledge_page_suspicion');
    logSpy.mockRestore();
  });

  it('suspicion summary omits healthy pages and academic text', () => {
    const { logLine } = buildSuspicionObservationSummary([
      {
        pageNumber: 1,
        text:
          'Plenty of healthy academic prose for a normal lecture slide about limits, continuity, and differentiability with enough extracted characters to clear the thin-content gate.',
        itemCount: 25,
        meaningfulChars: 160,
        suspiciousUnicodeCount: 0,
      },
      {
        pageNumber: 3,
        text: 'If is a continuous function on and differentiable on its interior. Then: . Theorem',
        itemCount: 14,
        meaningfulChars: 72,
        suspiciousUnicodeCount: 0,
      },
    ]);
    expect(logLine.suspiciousPageCount).toBe(1);
    expect(logLine.suspiciousPages).toHaveLength(1);
    expect(logLine.suspiciousPages[0]?.pageNumber).toBe(3);
    const formatted = formatKnowledgeSuspicionLogLine(logLine);
    expect(formatted).not.toMatch(/continuous function/);
    expect(assertSafeKnowledgeLogPayload(JSON.parse(formatted))).toBe(true);
  });
});
