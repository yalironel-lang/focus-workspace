import { describe, it, expect } from 'vitest';
import { runAskCoursePipeline } from './runAskCourse.ts';
import type { ZikukAiAskCourseRequestV2, ZikukAiAskCourseRequestV3 } from '../requestTypes.ts';
import type { AskCourseDeps } from './runAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';

const USER_ID = 'fdf687c3-6580-4c96-a49e-63455dd439a4';
const SECTION_ID = '15beb545-f132-42f7-adbf-cea8b65af0d2';
const PDF_ID = 'ps-pdf-1791982692066-dlr36';

const CHUNK_PAGE_2 =
  'Recommended Readings Barro, R. J., Chu, A. C., & Cozzi, G. (2017). Intermediate Macroeconomics . ' +
  'Cengage Learning EMEA. Chapter 7, 8, 9 and 10. Multiple Choice Questions ' +
  '1. The cyclical part of real GDP is ... (a) trend real GDP less real GDP. (b) real GDP less trend real GDP. ' +
  '(c) real GDP divided by trend real GDP. (d) trend real GDP divided by real GDP. ' +
  '2. An equilibrium business-cycle model ... (a) uses shocks to GDP to find equilibrium conditions.';

function mockDeps(options: {
  chunks?: { citationIndex: number; text: string; fileName: string; pageNumber: number }[];
  answerText: string;
}): AskCourseDeps {
  const chunks = options.chunks ?? [];
  return {
    loadSectionOwner: async () => ({ userId: USER_ID }),
    loadPdfCaptureSource: async () => ({
      id: PDF_ID,
      user_id: USER_ID,
      section_id: SECTION_ID,
      object: { type: 'pdf', content: { type: 'pdf', pageCount: 20 } },
    }),
    loadNotebookFsoForCitation: async () => null,
    embeddingProvider: createFakeEmbeddingProvider({
      fixedEmbedding: new Array(1536).fill(0.01),
      usage: { inputTokens: 10 },
    }),
    searchKnowledge: async () => ({
      ok: true,
      raw: chunks.map((c) => ({
        source_kind: 'free_space_pdf',
        source_object_id: PDF_ID,
        file_name: c.fileName,
        page_number: c.pageNumber,
        chunk_index: 0,
        text: c.text,
        similarity: 0.95,
      })),
    }),
    generationProvider: {
      complete: async () => ({
        ok: true,
        text: options.answerText,
        usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
        latencyMs: 50,
      }),
    },
    routerConfig: { model: 'test-model' } as any,
    enforcement: createMemoryEnforcementStore({
      plan: 'pro',
      dailyLimit: 100,
    }),
  };
}

describe('ZIKUK AI — Phase 7G.1 Final Attribution Heuristic Hardening Suite', () => {
  it('1. GDP general definition with tangential PDF retrieval is classified as general_academic', async () => {
    const question = 'What is GDP? Answer in one sentence.';
    const answer =
      'GDP (gross domestic product) is the total market value of final goods and services produced within a country over a given period.';

    const deps = mockDeps({
      chunks: [{ citationIndex: 1, text: CHUNK_PAGE_2, fileName: 'Problem Set 4 Solutions.pdf', pageNumber: 2 }],
      answerText: answer,
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION_ID,
      question,
      teachingMode: 'explain',
    };

    const out = await runAskCoursePipeline({ authUserId: USER_ID, request: req, deps });
    expect(out.response.ok).toBe(true);
    if (out.response.ok && out.response.result.type === 'ask_course') {
      expect(out.response.result.knowledgeTier).toBe('general_academic');
      expect(out.response.result.contextAvailable).toEqual({
        hasIndexedChunks: true,
        hasPdfCapture: false,
      });
      expect(out.response.result.text).not.toMatch(/\[\d+\]/);
    }
  });

  it('2. Multiple incidental shared words without actual source support stay general_academic', async () => {
    const question = 'Explain how competitive markets determine equilibrium prices.';
    // Answer shares multiple vocabulary words with the chunk (market, price, cost, production, firms, equilibrium)
    const answer =
      'In competitive markets, equilibrium prices are determined where market supply equals market demand. ' +
      'Individual firms act as price takers and choose their production level where marginal cost equals market price.';

    const tangentialChunk =
      'Problem Set 2: Microeconomics Exercises. Exercise 4: Consider a market with 10 identical competitive firms. ' +
      'Each firm has a short-run total cost curve given by TC(q) = 50 + 2q^2. Calculate equilibrium quantity when market price is 20.';

    const deps = mockDeps({
      chunks: [{ citationIndex: 1, text: tangentialChunk, fileName: 'Problem Set 2.pdf', pageNumber: 4 }],
      answerText: answer,
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION_ID,
      question,
      teachingMode: 'explain',
    };

    const out = await runAskCoursePipeline({ authUserId: USER_ID, request: req, deps });
    expect(out.response.ok).toBe(true);
    if (out.response.ok && out.response.result.type === 'ask_course') {
      // Must NOT be treated as mixed or course_material simply because generic economic terms overlap
      expect(out.response.result.knowledgeTier).toBe('general_academic');
      expect(out.response.result.text).not.toMatch(/\[\d+\]/);
    }
  });

  it('3. Directly supported cyclical GDP formula from Problem Set 4 is classified as course_material', async () => {
    const question = 'According to Problem Set 4, what is the cyclical part of real GDP?';
    const chunkText =
      'Problem Set 4 Solutions. Question 1. The cyclical part of real GDP is ... ' +
      'Solution: The cyclical part of real GDP is real GDP less trend real GDP.';
    const answer = 'The cyclical part of real GDP is real GDP less trend real GDP [1].';

    const deps = mockDeps({
      chunks: [{ citationIndex: 1, text: chunkText, fileName: 'Problem Set 4 Solutions.pdf', pageNumber: 2 }],
      answerText: answer,
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION_ID,
      question,
      teachingMode: 'explain',
    };

    const out = await runAskCoursePipeline({ authUserId: USER_ID, request: req, deps });
    expect(out.response.ok).toBe(true);
    if (out.response.ok && out.response.result.type === 'ask_course') {
      expect(out.response.result.knowledgeTier).toBe('course_material');
      expect(out.response.result.text).toContain('[1]');
      expect(out.response.result.sources).toHaveLength(1);
      expect(out.response.result.sources[0].fileName).toBe('Problem Set 4 Solutions.pdf');
      expect(out.response.result.sources[0].pageNumber).toBe(2);
    }
  });

  it('3b. Benchmark Rubric: Problem Set 4 unkeyed multiple-choice passage produces mixed tier when selecting option (b)', async () => {
    // Verified Ground Truth: The passage on Page 2 lists MCQ options (a)-(d) but has no inline solution key.
    // Repeating option (b) and deriving the formula requires academic reasoning, which correctly yields 'mixed' tier.
    const question = 'According to Problem Set 4, what is the cyclical part of real GDP?';
    const answer =
      'The cyclical part of real GDP is Real GDP minus Trend real GDP. ' +
      'Thus, the correct answer is (b) real GDP less trend real GDP.';

    const deps = mockDeps({
      chunks: [{ citationIndex: 1, text: CHUNK_PAGE_2, fileName: 'Problem Set 4 Solutions.pdf', pageNumber: 2 }],
      answerText: answer,
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION_ID,
      question,
      teachingMode: 'explain',
    };

    const out = await runAskCoursePipeline({ authUserId: USER_ID, request: req, deps });
    expect(out.response.ok).toBe(true);
    if (out.response.ok && out.response.result.type === 'ask_course') {
      expect(out.response.result.knowledgeTier).toBe('mixed');
      expect(out.response.result.sources).toHaveLength(1);
      expect(out.response.result.sources[0].fileName).toBe('Problem Set 4 Solutions.pdf');
      expect(out.response.result.sources[0].pageNumber).toBe(2);
      expect(out.response.result.text).toContain('not a statement from the PDF');
    }
  });

  it('4. Explicit student-highlighted source content is classified as pdf_selection', async () => {
    const highlightedText =
      'Solution: The steady state capital per worker satisfies s * f(k) = (n + g + delta) * k.';
    const question = 'What condition does this equation establish?';
    const answer =
      'The steady state capital per worker satisfies s * f(k) = (n + g + delta) * k [pdf selection]. ' +
      'This establishes the balance between investment and capital dilution.';

    const deps = mockDeps({
      chunks: [],
      answerText: answer,
    });

    const req: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: SECTION_ID,
      question,
      teachingMode: 'explain',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: PDF_ID,
        sectionId: SECTION_ID,
        pageNumber: 4,
        text: highlightedText,
        textKind: 'native_selection',
      },
    };

    const out = await runAskCoursePipeline({ authUserId: USER_ID, request: req, deps });
    expect(out.response.ok).toBe(true);
    if (out.response.ok && out.response.result.type === 'ask_course') {
      expect(['pdf_selection', 'mixed']).toContain(out.response.result.knowledgeTier);
      expect(out.response.result.contextAvailable.hasPdfCapture).toBe(true);
    }
  });

  it('5. Mixed grounded and general academic explanations are classified as mixed with preserved citation', async () => {
    const question = 'What is the cyclical part of real GDP and how is it used in macroeconomics?';
    const chunkText =
      'Problem Set 4 Solutions. Question 1. The cyclical part of real GDP is ... ' +
      'Solution: The cyclical part of real GDP is real GDP less trend real GDP.';
    const answer =
      'The cyclical part of real GDP is real GDP less trend real GDP [1]. ' +
      'In macroeconomic analysis, this measure helps economists isolate short-run business cycle fluctuations from long-run economic growth trends.';

    const deps = mockDeps({
      chunks: [{ citationIndex: 1, text: chunkText, fileName: 'Problem Set 4 Solutions.pdf', pageNumber: 2 }],
      answerText: answer,
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION_ID,
      question,
      teachingMode: 'explain',
    };

    const out = await runAskCoursePipeline({ authUserId: USER_ID, request: req, deps });
    expect(out.response.ok).toBe(true);
    if (out.response.ok && out.response.result.type === 'ask_course') {
      expect(out.response.result.knowledgeTier).toBe('mixed');
      expect(out.response.result.text).toContain('The cyclical part of real GDP is real GDP less trend real GDP [1].');
      expect(out.response.result.sources).toHaveLength(1);
    }
  });

  it('6. Valid PDF citation navigation preserves citation index mapping and metadata', async () => {
    const chunks = [
      { citationIndex: 1, text: 'Solution: The first formula is a + b = c.', fileName: 'Notes A.pdf', pageNumber: 5 },
      { citationIndex: 2, text: 'Solution: The second formula is x - y = z.', fileName: 'Notes B.pdf', pageNumber: 12 },
    ];
    const answer = 'The first formula is a + b = c [1]. The second formula is x - y = z [2].';

    const deps = mockDeps({
      chunks,
      answerText: answer,
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION_ID,
      question: 'State both formulas.',
      teachingMode: 'explain',
    };

    const out = await runAskCoursePipeline({ authUserId: USER_ID, request: req, deps });
    expect(out.response.ok).toBe(true);
    if (out.response.ok && out.response.result.type === 'ask_course') {
      expect(['course_material', 'mixed']).toContain(out.response.result.knowledgeTier);
      expect(out.response.result.text).toContain('[1]');
      expect(out.response.result.text).toContain('[2]');
      expect(out.response.result.sources).toHaveLength(2);
      expect(out.response.result.sources[0].index).toBe(1);
      expect(out.response.result.sources[0].fileName).toBe('Notes A.pdf');
      expect(out.response.result.sources[0].pageNumber).toBe(5);
      expect(out.response.result.sources[1].index).toBe(2);
      expect(out.response.result.sources[1].fileName).toBe('Notes B.pdf');
      expect(out.response.result.sources[1].pageNumber).toBe(12);
    }
  });
});
