/**
 * @vitest-environment node
 * M1.0B B4.1 — retrieval hardening regression matrix.
 */

import { describe, expect, it } from 'vitest';
import {
  ASK_COURSE_BETA_MIN_SIMILARITY,
  ASK_COURSE_FINAL_HARD_MAX,
  ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT,
  ASK_COURSE_MAX_CHUNKS_PER_SOURCE,
  ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP,
  ASK_COURSE_MAX_RETRIEVED_CHARS,
  ASK_COURSE_RPC_CANDIDATE_LIMIT,
} from './bounds.ts';
import { filterAskCourseHits, filterAskCourseHitsWithDiagnostics } from './retrievalPolicy.ts';
import {
  askCoursePdfObjectDiversityKey,
  askCourseSourceDiversityKey,
  type KnowledgeSearchHit,
} from './retrievalTypes.ts';
import { buildPdfEmbeddingText } from '../knowledge/chunkPages.ts';
import { embeddingInputForChunk, type IndexableChunk } from '../knowledge/batchChunks.ts';
import { KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS } from '../knowledge/bounds.ts';
import { meaningfulCharCount } from '../knowledge/normalizeText.ts';

function pdfHit(
  partial: Partial<KnowledgeSearchHit> &
    Pick<KnowledgeSearchHit, 'similarity' | 'text' | 'pageNumber' | 'sourceObjectId'>,
): KnowledgeSearchHit {
  return {
    sourceKind: 'free_space_pdf',
    notebookObjectId: null,
    fileName: '1.C. Mean Value Theorem.pdf',
    chunkIndex: 0,
    ...partial,
  };
}

function nbHit(
  partial: Partial<KnowledgeSearchHit> &
    Pick<KnowledgeSearchHit, 'similarity' | 'text' | 'sourceObjectId' | 'notebookObjectId'>,
): KnowledgeSearchHit {
  return {
    sourceKind: 'notebook_page',
    fileName: null,
    pageNumber: 1,
    chunkIndex: 0,
    notebookTitle: 'Notes',
    pageTitle: 'MVT',
    ...partial,
  };
}

describe('M1.0B B4.1 retrieval-text design', () => {
  const fileName = '1.C. Mean Value Theorem.pdf';

  it('sparse/ultra-short pages get body-only embed input (no filename cue)', () => {
    const sparse = 'Mean Value Theorem';
    expect(meaningfulCharCount(sparse)).toBeLessThanOrEqual(
      KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS,
    );
    const embed = buildPdfEmbeddingText({ fileName, text: sparse });
    expect(embed).toBe(sparse);
    expect(embed.startsWith(fileName)).toBe(false);
  });

  it('rich pages get light filename cue without page number', () => {
    const body = [
      'If f is continuous on [a,b] and differentiable on (a,b), then there exists',
      'c in (a,b) such that f\'(c)=(f(b)-f(a))/(b-a). This is the Mean Value Theorem',
      'conclusion relating the derivative at an interior point to the secant slope.',
    ].join(' ');
    expect(meaningfulCharCount(body)).toBeGreaterThan(KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS);
    const embed = buildPdfEmbeddingText({ fileName, text: body });
    expect(embed.startsWith(`${fileName}\n`)).toBe(true);
    expect(embed).toContain(body);
    expect(embed).not.toMatch(/— page /);
  });

  it('stored/canonical chunk text is unchanged; embed seam applies cue', () => {
    const body = 'x'.repeat(KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS + 20);
    const chunk: IndexableChunk = {
      id: 'c1',
      page_number: 3,
      chunk_index: 0,
      text: body,
      source_version: 1,
      fileName,
    };
    expect(embeddingInputForChunk(chunk)).toBe(`${fileName}\n${body}`);
    expect(chunk.text).toBe(body);
  });

  it('classic/recovery consistency: no fileName → body-only (notebook or missing)', () => {
    const body = 'x'.repeat(200);
    expect(
      embeddingInputForChunk({
        id: 'c1',
        page_number: 1,
        chunk_index: 0,
        text: body,
        source_version: 1,
      }),
    ).toBe(body);
  });
});

describe('M1.0B B4.1 diversity + caps matrix', () => {
  it('constants: floor, gap, budget, hard max, rpc, caps', () => {
    expect(ASK_COURSE_BETA_MIN_SIMILARITY).toBe(0.4);
    expect(ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP).toBe(0.25);
    expect(ASK_COURSE_MAX_RETRIEVED_CHARS).toBe(4500);
    expect(ASK_COURSE_FINAL_HARD_MAX).toBe(5);
    expect(ASK_COURSE_RPC_CANDIDATE_LIMIT).toBe(12);
    expect(ASK_COURSE_RPC_CANDIDATE_LIMIT).toBeGreaterThan(ASK_COURSE_FINAL_HARD_MAX);
    expect(ASK_COURSE_MAX_CHUNKS_PER_SOURCE).toBe(2);
    expect(ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT).toBe(4);
  });

  it('per-page cap: max 2 chunks per PDF page', () => {
    const hits = [0, 1, 2, 3].map((i) =>
      pdfHit({
        similarity: 0.9 - i * 0.01,
        text: `same-page-${i}`.padEnd(40, 'z'),
        pageNumber: 3,
        chunkIndex: i,
        sourceObjectId: 'pdf-a',
      }),
    );
    const { chunks } = filterAskCourseHitsWithDiagnostics(hits);
    expect(chunks.length).toBe(ASK_COURSE_MAX_CHUNKS_PER_SOURCE);
    expect(chunks.every((c) => c.pageNumber === 3)).toBe(true);
  });

  it('per-object secondary cap: one PDF cannot fill all final slots alone beyond 4', () => {
    const hits = Array.from({ length: 8 }, (_, i) =>
      pdfHit({
        similarity: 0.92 - i * 0.01,
        text: `p${i}`.padEnd(40, 'z'),
        pageNumber: i + 1,
        sourceObjectId: 'monopoly-pdf',
      }),
    );
    const { diagnostics, chunks } = filterAskCourseHitsWithDiagnostics(hits);
    expect(diagnostics.afterPerSourceLimitCount).toBe(ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT);
    expect(chunks.length).toBeLessThanOrEqual(ASK_COURSE_FINAL_HARD_MAX);
    expect(chunks.length).toBe(
      Math.min(ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT, ASK_COURSE_FINAL_HARD_MAX),
    );
  });

  it('mixed PDF + Notebook: stronger Notebook is not crowded out by many moderate PDF pages', () => {
    const hits: KnowledgeSearchHit[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        pdfHit({
          similarity: 0.72 - i * 0.01,
          text: `pdf-mod-${i} mean value`.padEnd(80, ' '),
          pageNumber: i + 1,
          sourceObjectId: 'long-pdf',
          fileName: 'lecture.pdf',
        }),
      ),
      nbHit({
        similarity: 0.88,
        text: 'Notebook: f continuous on [a,b], differentiable on (a,b), exists c with f\'(c)=(f(b)-f(a))/(b-a).',
        sourceObjectId: 'page-strong',
        notebookObjectId: 'nb-1',
      }),
    ];
    const { chunks } = filterAskCourseHitsWithDiagnostics(hits);
    expect(chunks.some((c) => c.sourceKind === 'notebook_page')).toBe(true);
    const nb = chunks.find((c) => c.sourceKind === 'notebook_page')!;
    expect(nb.citationIndex).toBe(1);
    const pdfCount = chunks.filter((c) => c.sourceKind === 'free_space_pdf').length;
    expect(pdfCount).toBeLessThanOrEqual(ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT);
    expect(chunks.length).toBeLessThanOrEqual(ASK_COURSE_FINAL_HARD_MAX);
  });

  it('Notebook-only retrieval unchanged by PDF object cap', () => {
    const hits = Array.from({ length: 4 }, (_, i) =>
      nbHit({
        similarity: 0.9 - i * 0.02,
        text: `nb-${i}`.padEnd(50, 'n'),
        sourceObjectId: `page-${i}`,
        notebookObjectId: 'nb-only',
      }),
    );
    const { chunks } = filterAskCourseHitsWithDiagnostics(hits);
    expect(chunks.length).toBe(Math.min(4, ASK_COURSE_FINAL_HARD_MAX));
    expect(chunks.every((c) => c.sourceKind === 'notebook_page')).toBe(true);
  });

  it('multiple PDFs: each object has independent secondary cap', () => {
    const hits = [
      ...[1, 2, 3].map((p, i) =>
        pdfHit({
          similarity: 0.9 - i * 0.01,
          text: `a-${p}`.padEnd(40, 'a'),
          pageNumber: p,
          sourceObjectId: 'pdf-a',
        }),
      ),
      ...[1, 2, 3].map((p, i) =>
        pdfHit({
          similarity: 0.85 - i * 0.01,
          text: `b-${p}`.padEnd(40, 'b'),
          pageNumber: p,
          sourceObjectId: 'pdf-b',
          fileName: 'other.pdf',
        }),
      ),
    ];
    const { chunks } = filterAskCourseHitsWithDiagnostics(hits);
    const a = chunks.filter((c) => c.sourceObjectId === 'pdf-a').length;
    const b = chunks.filter((c) => c.sourceObjectId === 'pdf-b').length;
    expect(a).toBeLessThanOrEqual(ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT);
    expect(b).toBeLessThanOrEqual(ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT);
    expect(chunks.length).toBeLessThanOrEqual(ASK_COURSE_FINAL_HARD_MAX);
  });

  it('short PDF + long multi-page + repetitive: floor/gap/budget still apply', () => {
    const hits = [
      pdfHit({
        similarity: 0.95,
        text: 'short'.padEnd(40, 's'),
        pageNumber: 1,
        sourceObjectId: 'short-pdf',
        fileName: 'short.pdf',
      }),
      ...Array.from({ length: 5 }, (_, i) =>
        pdfHit({
          similarity: 0.7,
          text: 'repeat '.repeat(200),
          pageNumber: i + 1,
          sourceObjectId: 'long-rep',
          fileName: 'rep.pdf',
        }),
      ),
      pdfHit({
        similarity: 0.2,
        text: 'irrelevant below floor'.padEnd(40, 'x'),
        pageNumber: 99,
        sourceObjectId: 'noise',
      }),
    ];
    const { diagnostics, chunks } = filterAskCourseHitsWithDiagnostics(hits);
    expect(diagnostics.afterSimilarityFloorCount).toBeGreaterThan(0);
    expect(chunks.every((c) => c.pageNumber !== 99)).toBe(true);
    const totalChars = chunks.reduce((s, c) => s + c.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(ASK_COURSE_MAX_RETRIEVED_CHARS);
  });

  it('strong top-hit preservation + deterministic ordering', () => {
    const hits = [
      pdfHit({
        similarity: 0.91,
        text: 'second'.padEnd(40, 'b'),
        pageNumber: 2,
        sourceObjectId: 'p',
        chunkIndex: 0,
      }),
      pdfHit({
        similarity: 0.95,
        text: 'top'.padEnd(40, 'a'),
        pageNumber: 1,
        sourceObjectId: 'p',
        chunkIndex: 0,
      }),
      pdfHit({
        similarity: 0.91,
        text: 'tie-lower-page'.padEnd(40, 'c'),
        pageNumber: 3,
        sourceObjectId: 'p',
        chunkIndex: 0,
      }),
    ];
    const a = filterAskCourseHits(hits);
    const b = filterAskCourseHits(hits);
    expect(a).toEqual(b);
    expect(a[0]?.text.startsWith('top')).toBe(true);
  });

  it('citation/page provenance preserved on prompt chunks', () => {
    const hits = [
      pdfHit({
        similarity: 0.9,
        text: 'theorem body'.padEnd(40, 't'),
        pageNumber: 3,
        sourceObjectId: 'mvt',
        fileName: '1.C. Mean Value Theorem.pdf',
      }),
    ];
    const { chunks } = filterAskCourseHitsWithDiagnostics(hits);
    expect(chunks[0]?.fileName).toBe('1.C. Mean Value Theorem.pdf');
    expect(chunks[0]?.pageNumber).toBe(3);
    expect(chunks[0]?.text).not.toMatch(/— page /);
  });

  it('diversity keys: page vs object', () => {
    const h = pdfHit({
      similarity: 0.9,
      text: 'x'.padEnd(40, 'x'),
      pageNumber: 3,
      sourceObjectId: 'obj',
    });
    expect(askCourseSourceDiversityKey(h)).toBe('free_space_pdf::obj::3');
    expect(askCoursePdfObjectDiversityKey(h)).toBe('free_space_pdf_object::obj');
    expect(
      askCoursePdfObjectDiversityKey(
        nbHit({
          similarity: 0.9,
          text: 'n'.padEnd(40, 'n'),
          sourceObjectId: 'pg',
          notebookObjectId: 'nb',
        }),
      ),
    ).toBeNull();
  });

  it('recovered + native pages same PDF: both pages can enter under object cap', () => {
    const hits = [
      pdfHit({
        similarity: 0.9,
        text: 'native title page'.padEnd(40, 'n'),
        pageNumber: 1,
        sourceObjectId: 'mixed-method',
      }),
      pdfHit({
        similarity: 0.88,
        text: 'recovered theorem page'.padEnd(40, 'r'),
        pageNumber: 3,
        sourceObjectId: 'mixed-method',
      }),
    ];
    const { chunks } = filterAskCourseHitsWithDiagnostics(hits);
    expect(chunks.map((c) => c.pageNumber).sort()).toEqual([1, 3]);
  });
});
