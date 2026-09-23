/**
 * @vitest-environment node
 *
 * M0.5B — PDF extraction, chunking, hash, ingest pipeline (no remote, no provider).
 */

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_CHUNK_MAX_CHARS,
  KNOWLEDGE_MAX_PDF_BYTES,
  KNOWLEDGE_MIN_DOCUMENT_CHARS,
} from './bounds.ts';
import { chunkPageTexts } from './chunkPages.ts';
import { extractPdfTextFromBytes } from './extractPdfText.ts';
import {
  fixtureNotPdf,
  fixturePdfBlank,
  fixturePdfLongPage,
  fixturePdfMultiPage,
  fixturePdfOnePage,
} from './fixtures.ts';
import { sha256Hex } from './hash.ts';
import { loadPdfJsModule } from './loadPdfJs.ts';
import { meaningfulCharCount, normalizeExtractedPageText } from './normalizeText.ts';
import { buildFreeSpacePdfStoragePath } from './path.ts';
import {
  assertSafeKnowledgeLogPayload,
  formatKnowledgeIngestLogLine,
} from './privacyLog.ts';
import {
  parseKnowledgeIngestRequest,
  runKnowledgeIngest,
  type KnowledgeIngestDeps,
} from './runKnowledgeIngest.ts';

async function pdfjs() {
  return loadPdfJsModule();
}

describe('M0.5B path + hash', () => {
  it('derives canonical private Free Space PDF path', () => {
    expect(
      buildFreeSpacePdfStoragePath({
        userId: '11111111-1111-4111-8111-111111111111',
        sectionId: '22222222-2222-4222-8222-222222222222',
        sourceObjectId: 'obj-pdf-1',
      }),
    ).toBe(
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/obj-pdf-1/pdf/obj-pdf-1',
    );
  });

  it('SHA-256 is deterministic and matches node crypto', async () => {
    const bytes = fixturePdfOnePage();
    const a = await sha256Hex(bytes);
    const b = await sha256Hex(bytes);
    const node = createHash('sha256').update(bytes).digest('hex');
    expect(a).toBe(b);
    expect(a).toBe(node);
  });

  it('different bytes → different hash', async () => {
    const a = await sha256Hex(fixturePdfOnePage());
    const b = await sha256Hex(fixturePdfMultiPage());
    expect(a).not.toBe(b);
  });
});

describe('M0.5B normalization', () => {
  it('collapses whitespace without rewriting meaning', () => {
    expect(normalizeExtractedPageText('  Hello   world  \n\n\n  Next  ')).toBe(
      'Hello world\n\nNext',
    );
  });
});

describe('M0.5B extraction (pdfjs-dist)', () => {
  it('extracts one-page text with page number 1', async () => {
    const result = await extractPdfTextFromBytes(fixturePdfOnePage(), await pdfjs());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pageCount).toBe(1);
    expect(result.pages[0]?.pageNumber).toBe(1);
    expect(result.pages[0]?.text).toContain('Hello ZIKUK');
  });

  it('extracts multi-page text with preserved page numbers', async () => {
    const result = await extractPdfTextFromBytes(fixturePdfMultiPage(), await pdfjs());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pageCount).toBe(3);
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(result.pages[0]?.text).toContain('Page one');
    expect(result.pages[1]?.text).toContain('Page two');
    expect(result.pages[2]?.text).toContain('Page three');
  });

  it('blank PDF extracts empty pages (caller fails no_extractable_text)', async () => {
    const result = await extractPdfTextFromBytes(fixturePdfBlank(), await pdfjs());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pagesWithText).toBe(0);
    expect(result.pages.every((p) => meaningfulCharCount(p.text) === 0)).toBe(true);
  });

  it('malformed non-PDF fails safely', async () => {
    const result = await extractPdfTextFromBytes(fixtureNotPdf(), await pdfjs());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('extract_failed');
  });
});

describe('M0.5B chunking', () => {
  it('never crosses pages and is deterministic', () => {
    const pages = [
      { pageNumber: 1, text: 'Alpha paragraph one.\n\nAlpha paragraph two.' },
      { pageNumber: 2, text: 'Beta only page two content that is long enough to keep.' },
    ];
    const a = chunkPageTexts(pages);
    const b = chunkPageTexts(pages);
    expect(a).toEqual(b);
    expect(a.every((c) => c.page_number === 1 || c.page_number === 2)).toBe(true);
    expect(a.some((c) => c.text.includes('Alpha') && c.text.includes('Beta'))).toBe(false);
    for (const c of a) {
      expect(c.char_count).toBe(c.text.length);
      expect(c.char_count).toBeLessThanOrEqual(KNOWLEDGE_CHUNK_MAX_CHARS);
    }
  });

  it('splits long page into multiple ordered chunks', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Word${i} content about topic ${i}.`).join(
      ' ',
    );
    const chunks = chunkPageTexts([{ pageNumber: 1, text: long }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.chunk_index)).toEqual(chunks.map((_, i) => i));
    expect(chunks.every((c) => c.page_number === 1)).toBe(true);
  });

  it('drops empty tiny noise', () => {
    const chunks = chunkPageTexts([
      { pageNumber: 1, text: '   ' },
      { pageNumber: 2, text: 'Substantial page two text that exceeds the minimum chunk size easily.' },
    ]);
    expect(chunks.every((c) => c.page_number === 2)).toBe(true);
  });
});

describe('M0.5B request parsing / auth fields', () => {
  it('accepts minimal client body', () => {
    const parsed = parseKnowledgeIngestRequest({
      version: 1,
      sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceObjectId: 'pdf-obj-1',
    });
    expect(parsed.ok).toBe(true);
  });

  it('rejects forged authoritative client fields', () => {
    expect(
      parseKnowledgeIngestRequest({
        version: 1,
        sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceObjectId: 'pdf-obj-1',
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }).ok,
    ).toBe(false);
    expect(
      parseKnowledgeIngestRequest({
        version: 1,
        sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceObjectId: 'pdf-obj-1',
        storagePath: 'evil/path',
      }).ok,
    ).toBe(false);
    expect(
      parseKnowledgeIngestRequest({
        version: 1,
        sectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sourceObjectId: 'pdf-obj-1',
        chunks: [],
      }).ok,
    ).toBe(false);
  });
});

describe('M0.5B runKnowledgeIngest pipeline', () => {
  const sectionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const objectId = 'pdf-obj-1';
  const userId = '11111111-1111-4111-8111-111111111111';

  async function baseDeps(overrides?: Partial<KnowledgeIngestDeps>): Promise<KnowledgeIngestDeps> {
    const bytes = fixturePdfOnePage();
    return {
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
          return {
            ok: true,
            source_id: 'src-1',
            source_version: 1,
            status: 'ready',
            chunk_count: chunks?.length ?? 0,
          };
        }
        return {
          ok: true,
          source_id: 'src-1',
          source_version: 1,
          status: 'failed',
          preserved_corpus: false,
        };
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
      ...overrides,
    };
  }

  it('denies unauthenticated', async () => {
    const deps = await baseDeps();
    const res = await runKnowledgeIngest({
      authUserId: null,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('unauthenticated');
  });

  it('denies cross-user / auth mismatch', async () => {
    const deps = await baseDeps({
      loadOwnedPdfObject: vi.fn(async () => ({ ok: false as const, code: 'auth_mismatch' })),
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('auth_mismatch');
  });

  it('denies non-PDF', async () => {
    const deps = await baseDeps({
      loadOwnedPdfObject: vi.fn(async () => ({ ok: false as const, code: 'not_pdf' })),
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('not_pdf');
  });

  it('first ingest → ready with chunks', async () => {
    const deps = await baseDeps();
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.status).toBe('ready');
    expect(res.result.chunkCount).toBeGreaterThan(0);
    expect(res.result.reused).toBe(false);
    expect(deps.finalizeIngest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ready' }),
    );
    const call = vi.mocked(deps.finalizeIngest).mock.calls[0]![0]!;
    expect(call.chunks?.every((c) => c.char_count === c.text.length)).toBe(true);
    expect(typeof call.pageCount).toBe('number');
    expect(call.pageCount).toBeGreaterThanOrEqual(1);
    expect(res.result.pageCount).toBe(call.pageCount);
  });

  it('same hash ready → reused without finalize extract path', async () => {
    const deps = await baseDeps({
      beginIngest: vi.fn(async () => ({
        ok: true,
        source_id: 'src-1',
        source_version: 1,
        status: 'ready',
        idempotent: true,
      })),
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.reused).toBe(true);
    expect(res.result.status).toBe('reused');
    expect(deps.finalizeIngest).not.toHaveBeenCalled();
  });

  it('blank PDF → no_extractable_text and finalize failed', async () => {
    const deps = await baseDeps({
      downloadPdfBytes: vi.fn(async () => ({
        ok: true as const,
        bytes: fixturePdfBlank(),
      })),
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('no_extractable_text');
    expect(deps.finalizeIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'extract_failed',
      }),
    );
  });

  it('byte limit enforced', async () => {
    const deps = await baseDeps({
      downloadPdfBytes: vi.fn(async () => ({ ok: false as const, code: 'too_large' })),
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('too_large');
    expect(KNOWLEDGE_MAX_PDF_BYTES).toBeLessThanOrEqual(25 * 1024 * 1024);
  });

  it('failed ingest after begin calls finalize failed (preserve lifecycle)', async () => {
    const deps = await baseDeps({
      downloadPdfBytes: vi.fn(async () => ({
        ok: true as const,
        bytes: fixtureNotPdf(),
      })),
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(false);
    expect(deps.beginIngest).toHaveBeenCalled();
    expect(deps.finalizeIngest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('uses canonical path for download (not client path)', async () => {
    const deps = await baseDeps();
    await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(deps.downloadPdfBytes).toHaveBeenCalledWith({
      bucket: 'user-content',
      storagePath: `${userId}/${sectionId}/${objectId}/pdf/${objectId}`,
    });
  });

  it('long page fixture produces multiple chunks under max', async () => {
    const deps = await baseDeps({
      downloadPdfBytes: vi.fn(async () => ({
        ok: true as const,
        bytes: fixturePdfLongPage(),
      })),
    });
    const res = await runKnowledgeIngest({
      authUserId: userId,
      body: { version: 1, sectionId, sourceObjectId: objectId },
      deps,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.chunkCount).toBeGreaterThan(1);
  });

  it('min document chars constant is documented', () => {
    expect(KNOWLEDGE_MIN_DOCUMENT_CHARS).toBeGreaterThan(0);
  });
});

describe('M0.5B privacy logging', () => {
  it('log line contains metadata only', () => {
    const line = formatKnowledgeIngestLogLine({
      event: 'ai_knowledge_ingest',
      requestId: 'req-1',
      outcome: 'ok',
      code: 'ok',
      hasUser: true,
      hasSection: true,
      hasObject: true,
      byteLength: 1234,
      pageCount: 2,
      chunkCount: 5,
      latencyMs: 42,
    });
    expect(line).toContain('"byteLength":1234');
    expect(line).not.toContain('Hello');
    expect(assertSafeKnowledgeLogPayload(JSON.parse(line))).toBe(true);
  });

  it('rejects payloads with text/chunks keys', () => {
    expect(assertSafeKnowledgeLogPayload({ text: 'secret' })).toBe(false);
    expect(assertSafeKnowledgeLogPayload({ chunks: [] })).toBe(false);
  });
});
