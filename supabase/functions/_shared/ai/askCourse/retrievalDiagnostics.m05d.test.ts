/**
 * @vitest-environment node
 * M0.5D — retrieval diagnostics (metadata only; no policy change).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ASK_COURSE_BETA_MIN_SIMILARITY,
  ASK_COURSE_FINAL_HARD_MAX,
  ASK_COURSE_MAX_CHUNKS_PER_SOURCE,
  ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT,
  ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP,
  ASK_COURSE_MAX_RETRIEVED_CHARS,
} from './bounds.ts';
import {
  assertRetrievalDiagnosticPrivacy,
  formatAskCourseRetrievalLogLine,
} from './retrievalDiagnostics.ts';
import {
  filterAskCourseHits,
  filterAskCourseHitsWithDiagnostics,
} from './retrievalPolicy.ts';
import { runAskCoursePipeline } from './runAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import type { AiProvider } from '../providerTypes.ts';
import { runGatewayPipeline } from '../runGatewayPipeline.ts';
import type { GatewayAiContext } from '../requestTypes.ts';
import type { KnowledgeSearchHit } from './retrievalTypes.ts';
import { askCoursePdfObjectDiversityKey, askCourseSourceDiversityKey } from './retrievalTypes.ts';

const SECTION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_A = 'user-a-uuid';
const OBJ = 'ps-pdf-test-object';

function hit(
  partial: Partial<KnowledgeSearchHit> & Pick<KnowledgeSearchHit, 'similarity' | 'text'>,
): KnowledgeSearchHit {
  return {
    sourceKind: 'free_space_pdf',
    sourceObjectId: OBJ,
    notebookObjectId: null,
    fileName: 'notes.pdf',
    pageNumber: 1,
    chunkIndex: 0,
    ...partial,
  };
}

function rawRow(h: KnowledgeSearchHit) {
  return {
    source_kind: h.sourceKind,
    source_object_id: h.sourceObjectId,
    notebook_object_id: h.notebookObjectId,
    file_name: h.fileName,
    page_number: h.pageNumber,
    chunk_index: h.chunkIndex,
    text: h.text,
    similarity: h.similarity,
  };
}

describe('M0.5D retrieval diagnostics', () => {
  it('1. zero search candidates → reason=no_candidates', () => {
    const { chunks, diagnostics } = filterAskCourseHitsWithDiagnostics([]);
    expect(chunks).toEqual([]);
    expect(diagnostics.reason).toBe('no_candidates');
    expect(diagnostics.candidateCount).toBe(0);
  });

  it('2. candidates all below 0.40 → below_similarity_floor', () => {
    const { diagnostics } = filterAskCourseHitsWithDiagnostics([
      hit({ similarity: 0.39, text: 'a'.repeat(50), pageNumber: 1, chunkIndex: 0 }),
      hit({ similarity: 0.2, text: 'b'.repeat(50), pageNumber: 2, chunkIndex: 0 }),
    ]);
    expect(diagnostics.candidateCount).toBe(2);
    expect(diagnostics.afterSimilarityFloorCount).toBe(0);
    expect(diagnostics.reason).toBe('below_similarity_floor');
    expect(diagnostics.finalEvidenceCount).toBe(0);
  });

  it('3. survive floor but relative-gap stage drops weaker hits', () => {
    // Top always survives gap; weaker hit beyond 0.25 is removed at gap stage.
    const { diagnostics, chunks } = filterAskCourseHitsWithDiagnostics([
      hit({ similarity: 0.95, text: 'top'.padEnd(40, 'x'), pageNumber: 1, chunkIndex: 0 }),
      hit({
        similarity: 0.95 - ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP - 0.01,
        text: 'far'.padEnd(40, 'y'),
        pageNumber: 2,
        chunkIndex: 0,
      }),
    ]);
    expect(diagnostics.afterSimilarityFloorCount).toBe(2);
    expect(diagnostics.afterRelativeGapCount).toBe(1);
    expect(diagnostics.candidateCount).toBe(2);
    expect(chunks.length).toBe(1);
    expect(diagnostics.reason).toBe('evidence_ready');
  });

  it('4. source diversity stage counts correct (same PDF page)', () => {
    const hits: KnowledgeSearchHit[] = [];
    for (let i = 0; i < 5; i++) {
      hits.push(
        hit({
          similarity: 0.9 - i * 0.01,
          text: `c${i}`.padEnd(40, 'z'),
          pageNumber: 3,
          chunkIndex: i,
          sourceObjectId: 'same-source',
        }),
      );
    }
    const { diagnostics } = filterAskCourseHitsWithDiagnostics(hits);
    expect(diagnostics.afterRelativeGapCount).toBeGreaterThan(ASK_COURSE_MAX_CHUNKS_PER_SOURCE);
    expect(diagnostics.afterPerSourceLimitCount).toBe(ASK_COURSE_MAX_CHUNKS_PER_SOURCE);
  });

  it('4b. multi-page PDF diversity allows multiple pages but object cap applies', () => {
    const hits: KnowledgeSearchHit[] = [];
    for (let i = 0; i < 6; i++) {
      hits.push(
        hit({
          similarity: 0.9 - i * 0.01,
          text: `c${i}`.padEnd(40, 'z'),
          pageNumber: i + 1,
          chunkIndex: 0,
          sourceObjectId: 'same-pdf',
        }),
      );
    }
    const { diagnostics, chunks } = filterAskCourseHitsWithDiagnostics(hits);
    // Per-page allows all 6; secondary PDF object cap = 4.
    expect(diagnostics.afterPerSourceLimitCount).toBe(4);
    expect(chunks.length).toBeLessThanOrEqual(ASK_COURSE_FINAL_HARD_MAX);
    expect(chunks.length).toBe(Math.min(4, ASK_COURSE_FINAL_HARD_MAX));
  });

  it('5. character budget stage counts correct', () => {
    const big = 'x'.repeat(2000);
    const hits = [
      hit({ similarity: 0.95, text: big, pageNumber: 1, chunkIndex: 0, sourceObjectId: 'a' }),
      hit({ similarity: 0.94, text: big, pageNumber: 2, chunkIndex: 0, sourceObjectId: 'b' }),
      hit({ similarity: 0.93, text: big, pageNumber: 3, chunkIndex: 0, sourceObjectId: 'c' }),
    ];
    const { diagnostics } = filterAskCourseHitsWithDiagnostics(hits);
    expect(diagnostics.afterPerSourceLimitCount).toBe(3);
    expect(diagnostics.afterCharacterBudgetCount).toBeLessThan(3);
    expect(diagnostics.finalEvidenceChars).toBeLessThanOrEqual(ASK_COURSE_MAX_RETRIEVED_CHARS);
  });

  it('6–7. successful retrieval diagnostics + final chars', () => {
    const text = 'Evidence about the definition.'.padEnd(80, ' ');
    const { chunks, diagnostics } = filterAskCourseHitsWithDiagnostics([
      hit({ similarity: 0.91, text, pageNumber: 1, chunkIndex: 0 }),
      hit({ similarity: 0.85, text: text + '2', pageNumber: 2, chunkIndex: 1, sourceObjectId: 'o2' }),
    ]);
    expect(diagnostics.reason).toBe('evidence_ready');
    expect(diagnostics.finalEvidenceCount).toBe(chunks.length);
    expect(diagnostics.finalEvidenceChars).toBe(chunks.reduce((s, c) => s + c.text.length, 0));
    expect(diagnostics.topSimilarity).toBe(0.91);
    expect(diagnostics.lowestFinalSimilarity).toBeTypeOf('number');
  });

  it('8–13. diagnostic payload privacy', () => {
    const { diagnostics } = filterAskCourseHitsWithDiagnostics([
      hit({ similarity: 0.9, text: 'SECRET_CHUNK_TEXT_SHOULD_NOT_APPEAR', pageNumber: 3, chunkIndex: 1 }),
    ]);
    const line = formatAskCourseRetrievalLogLine(diagnostics);
    assertRetrievalDiagnosticPrivacy(line);
    expect(line).not.toContain('SECRET_CHUNK');
    expect(line).not.toContain('question');
    expect(line).not.toContain('answer');
    expect(line).not.toContain('embedding');
    expect(line).not.toContain(USER_A);
    expect(line).not.toContain(SECTION_A);
    expect(JSON.parse(line).similarities).toEqual([0.9]);
  });

  it('14–15. knowledge_not_found → zero gen; one beginRequest; diagnostics logged', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    const genCalls: unknown[] = [];
    const gen: AiProvider = {
      async complete(input) {
        genCalls.push(input);
        return { ok: true, text: 'nope', latencyMs: 1 };
      },
    };
    const store = createMemoryEnforcementStore();
    const beginSpy = vi.spyOn(store, 'beginRequest');
    const emb = createFakeEmbeddingProvider({ kind: 'ok' });
    const out = await runAskCoursePipeline({
      authUserId: USER_A,
      request: {
        version: 1,
        capability: 'ask_course',
        sectionId: SECTION_A,
        question: 'What is the main definition introduced in this document?',
      },
      deps: {
        loadSectionOwner: async () => ({ userId: USER_A }),
        embeddingProvider: emb,
        searchKnowledge: async () => ({
          ok: true,
          raw: [
            rawRow(hit({ similarity: 0.1, text: 'weak irrelevant', pageNumber: 1, chunkIndex: 0 })),
          ],
        }),
        loadNotebookFsoForCitation: async () => null,
        generationProvider: gen,
        routerConfig: { model: 'gpt-test' },
        enforcement: store,
      },
    });
    logSpy.mockRestore();
    expect(out.response.ok).toBe(false);
    if (!out.response.ok) expect(out.response.error.code).toBe('knowledge_not_found');
    expect(genCalls.length).toBe(0);
    expect(beginSpy).toHaveBeenCalledTimes(1);
    const retrievalLog = logs.find((l) => l.includes('ask_course_retrieval'));
    expect(retrievalLog).toBeTruthy();
    assertRetrievalDiagnosticPrivacy(retrievalLog!);
    const parsed = JSON.parse(retrievalLog!);
    expect(parsed.outcome).toBe('knowledge_not_found');
    expect(parsed.reason).toBe('below_similarity_floor');
    expect(parsed.candidateCount).toBe(1);
    expect(retrievalLog).not.toContain('What is the main definition');
    expect(retrievalLog).not.toContain('weak irrelevant');
    const outcomeLog = logs.find((l) => l.includes('ask_course_outcome'));
    expect(outcomeLog).toBeTruthy();
    expect(outcomeLog).not.toContain('What is the main definition');
  });

  it('16. Explain produces no ask_course retrieval diagnostics', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    const emb = createFakeEmbeddingProvider({ kind: 'ok' });
    const search = vi.fn(async () => ({ ok: true as const, raw: [] }));
    const ctx: GatewayAiContext = {
      version: 1,
      capturedAt: '2026-09-20T00:00:00.000Z',
      identity: { userId: USER_A },
      academic: { sectionId: SECTION_A },
      surface: {
        type: 'notebook',
        notebookObjectId: 'nb',
        pageId: 'p',
        pageKey: 'p',
      },
      focus: { kind: 'text', text: 'Euler', from: 0, to: 5, blockKind: 'paragraph' },
      surroundings: {
        truncated: false,
        blocks: [
          {
            role: 'current',
            blockKind: 'paragraph',
            content: { type: 'text', text: 'Euler theorem' },
          },
        ],
      },
    };
    await runGatewayPipeline({
      authUserId: USER_A,
      body: { version: 1, capability: 'explain_selection', context: ctx },
      provider: {
        async complete() {
          return { ok: true, text: 'ok', latencyMs: 1 };
        },
      },
      routerConfig: { model: 'gpt-test' },
      enforcement: createMemoryEnforcementStore(),
      askCourseDeps: {
        loadSectionOwner: async () => ({ userId: USER_A }),
        embeddingProvider: emb,
        searchKnowledge: search,
        loadNotebookFsoForCitation: async () => null,
      },
    });
    logSpy.mockRestore();
    expect(logs.some((l) => l.includes('ask_course_retrieval'))).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });

  it('17. retrieval output behaviorally identical to B4.1 policy reference', () => {
    /** Reference filter matching B4.1 policy (page + PDF object caps; budget then hard max). */
    function filterAskCourseHitsPreDiagnostic(hits: KnowledgeSearchHit[]) {
      const sorted = [...hits].sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity;
        if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
        return a.chunkIndex - b.chunkIndex;
      });
      if (sorted.length === 0) return [];
      const top = sorted[0]!.similarity;
      const afterFloor = sorted.filter((h) => h.similarity >= ASK_COURSE_BETA_MIN_SIMILARITY);
      const afterGap = afterFloor.filter(
        (h) => top - h.similarity <= ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP,
      );
      const perPage = new Map<string, number>();
      const perObject = new Map<string, number>();
      const diversified: KnowledgeSearchHit[] = [];
      for (const h of afterGap) {
        const pageKey = askCourseSourceDiversityKey(h);
        const pageN = perPage.get(pageKey) ?? 0;
        if (pageN >= ASK_COURSE_MAX_CHUNKS_PER_SOURCE) continue;
        const objectKey = askCoursePdfObjectDiversityKey(h);
        if (objectKey) {
          const objectN = perObject.get(objectKey) ?? 0;
          if (objectN >= ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT) continue;
          perObject.set(objectKey, objectN + 1);
        }
        perPage.set(pageKey, pageN + 1);
        diversified.push(h);
      }
      const budgeted: KnowledgeSearchHit[] = [];
      let chars = 0;
      for (const h of diversified) {
        const len = h.text.length;
        if (budgeted.length > 0 && chars + len > ASK_COURSE_MAX_RETRIEVED_CHARS) continue;
        if (budgeted.length === 0 && len > ASK_COURSE_MAX_RETRIEVED_CHARS) {
          budgeted.push({ ...h, text: h.text.slice(0, ASK_COURSE_MAX_RETRIEVED_CHARS) });
          break;
        }
        budgeted.push(h);
        chars += len;
      }
      return budgeted.slice(0, ASK_COURSE_FINAL_HARD_MAX).map((h, i) => ({
        citationIndex: i + 1,
        sourceKind: h.sourceKind,
        sourceObjectId: h.sourceObjectId,
        notebookObjectId: h.notebookObjectId,
        fileName: h.fileName,
        pageNumber: h.pageNumber,
        text: h.text,
      }));
    }

    const fixtures: KnowledgeSearchHit[][] = [
      [],
      [hit({ similarity: 0.1, text: 'weak', pageNumber: 1, chunkIndex: 0 })],
      [
        hit({ similarity: 0.95, text: 'a'.repeat(100), pageNumber: 1, chunkIndex: 0 }),
        hit({
          similarity: 0.5,
          text: 'b'.repeat(100),
          pageNumber: 2,
          chunkIndex: 0,
          sourceObjectId: 'other',
        }),
      ],
      Array.from({ length: 8 }, (_, i) =>
        hit({
          similarity: 0.9 - i * 0.02,
          text: `t${i}`.padEnd(800, 'q'),
          pageNumber: (i % 4) + 1,
          chunkIndex: i,
          sourceObjectId: i < 4 ? 's1' : 's2',
        }),
      ),
      [
        hit({
          similarity: 0.99,
          text: 'x'.repeat(ASK_COURSE_MAX_RETRIEVED_CHARS + 500),
          pageNumber: 1,
          chunkIndex: 0,
        }),
      ],
      // Budget skips middle chunk; later smaller chunks still considered
      [
        hit({ similarity: 0.99, text: 'a'.repeat(2000), pageNumber: 1, chunkIndex: 0, sourceObjectId: 'a' }),
        hit({ similarity: 0.98, text: 'b'.repeat(3000), pageNumber: 2, chunkIndex: 0, sourceObjectId: 'b' }),
        hit({ similarity: 0.97, text: 'c'.repeat(500), pageNumber: 3, chunkIndex: 0, sourceObjectId: 'c' }),
        hit({ similarity: 0.96, text: 'd'.repeat(500), pageNumber: 4, chunkIndex: 0, sourceObjectId: 'd' }),
        hit({ similarity: 0.95, text: 'e'.repeat(500), pageNumber: 5, chunkIndex: 0, sourceObjectId: 'e' }),
        hit({ similarity: 0.94, text: 'f'.repeat(500), pageNumber: 6, chunkIndex: 0, sourceObjectId: 'f' }),
      ],
    ];
    for (const hits of fixtures) {
      const expected = filterAskCourseHitsPreDiagnostic(hits);
      const actual = filterAskCourseHits(hits);
      const viaDiag = filterAskCourseHitsWithDiagnostics(hits).chunks;
      expect(actual).toEqual(expected);
      expect(viaDiag).toEqual(expected);
      expect(actual.length).toBeLessThanOrEqual(ASK_COURSE_FINAL_HARD_MAX);
    }
    expect(ASK_COURSE_BETA_MIN_SIMILARITY).toBe(0.4);
    expect(ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP).toBe(0.25);
    expect(ASK_COURSE_FINAL_HARD_MAX).toBe(5);
    expect(ASK_COURSE_MAX_CHUNKS_PER_SOURCE).toBe(2);
    expect(ASK_COURSE_MAX_CHUNKS_PER_PDF_OBJECT).toBe(4);
    expect(ASK_COURSE_MAX_RETRIEVED_CHARS).toBe(4500);
  });
});
