/**
 * @vitest-environment node
 * ZIKUK AI — Smart Knowledge Expansion (Phase SKE1.1 Unit Test Suite).
 *
 * Verifies:
 * 1. Zero retrieval chunks + teachingMode -> Succeeds with knowledgeTier: 'general_academic' and sources: [].
 * 2. Retrieved chunks that support the answer -> knowledgeTier: 'course_material' and sources: [...].
 * 3. PDF capture with 0 retrieval chunks and a grounded answer -> knowledgeTier: 'pdf_selection'.
 * 4. Zero retrieval chunks + no teachingMode (legacy) -> Fails closed with 'knowledge_not_found'.
 * 5. Prompt format when chunks are empty injects general academic fallback guidance into COURSE MATERIAL.
 * 6. System prompt contains SMART KNOWLEDGE EXPANSION instructions.
 */

import { describe, expect, it } from 'vitest';
import { ADDITIONAL_EXPLANATION_NOTICE } from './evaluateGroundingProvenance.ts';
import { runAskCoursePipeline, type AskCourseDeps } from './runAskCourse.ts';
import { buildAskCourseMessages } from './promptAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import { validateZikukAiRequest } from '../validateRequest.ts';
import type {
  ZikukAiAskCourseRequestV2,
  ZikukAiAskCourseRequestV3,
  TeachingMode,
} from '../requestTypes.ts';

const VALID_SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_USER_ID = 'ske-test-user-id';
const VALID_PDF_ID = 'ske-pdf-obj-1';

function buildMockDeps(overrides?: Partial<AskCourseDeps>): AskCourseDeps {
  return {
    loadSectionOwner: async () => ({ userId: VALID_USER_ID }),
    loadPdfCaptureSource: async () => ({
      id: VALID_PDF_ID,
      user_id: VALID_USER_ID,
      section_id: VALID_SECTION_ID,
      object: { type: 'pdf', content: { type: 'pdf', pageCount: 10 } },
    }),
    loadNotebookFsoForCitation: async () => null,
    embeddingProvider: createFakeEmbeddingProvider({
      fixedEmbedding: new Array(1536).fill(0.01),
      usage: { inputTokens: 12 },
    }),
    searchKnowledge: async () => ({ ok: true as const, raw: [] }),
    generationProvider: {
      complete: async () => ({
        ok: true,
        text: 'This is an authoritative academic explanation.',
        latencyMs: 42,
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      }),
    },
    enforcement: createMemoryEnforcementStore({
      plan: 'pro',
      dailyLimit: 100,
    }),
    routerConfig: { model: 'test-model' },
    ...overrides,
  };
}

describe('ZIKUK AI — Smart Knowledge Expansion (SKE1.1)', () => {
  it('1. expands knowledge when retrieval returns 0 chunks and teachingMode is provided', async () => {
    let capturedMessages: unknown = null;
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async (input) => {
          capturedMessages = input.messages;
          return {
            ok: true,
            text: 'Green’s Theorem states that for a positively oriented, piecewise-smooth simple closed curve C...',
            latencyMs: 30,
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          };
        },
      },
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'What is Green’s Theorem in calculus?',
      teachingMode: 'explain',
    };

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: req,
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.sources).toEqual([]);
      expect(res.response.result.knowledgeTier).toBe('general_academic');
      expect(res.response.result.text).toContain('Green’s Theorem');
      expect(res.response.meta?.retrievalHitCount).toBe(0);
      expect(res.response.meta?.knowledgeTier).toBe('general_academic');
    }

    expect(res.meta.knowledgeTier).toBe('general_academic');
    expect(res.meta.retrievalHitCount).toBe(0);
    expect(Array.isArray(capturedMessages)).toBe(true);
  });

  it('2. operates across all teaching modes on zero-hit queries (teach_me, exam_prep, just_answer)', async () => {
    const modes: TeachingMode[] = ['teach_me', 'exam_prep', 'just_answer'];

    for (const mode of modes) {
      const deps = buildMockDeps({
        searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      });

      const req: ZikukAiAskCourseRequestV2 = {
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain Keynesian multiplier',
        teachingMode: mode,
      };

      const res = await runAskCoursePipeline({
        authUserId: VALID_USER_ID,
        request: req,
        deps,
      });

      expect(res.response.ok).toBe(true);
      if (res.response.ok && res.response.result.type === 'ask_course') {
        expect(res.response.result.knowledgeTier).toBe('general_academic');
        expect(res.response.result.sources).toEqual([]);
      }
    }
  });

  it('3. withholds course material when the answer adds a claim the chunk does not state', async () => {
    const rawHit = {
      similarity: 0.85,
      source_kind: 'free_space_pdf',
      source_object_id: VALID_PDF_ID,
      file_name: 'Calculus3.pdf',
      page_number: 3,
      chunk_index: 0,
      text: 'Green’s Theorem equation (9.4) in lecture notes.',
    };

    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [rawHit] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: "Green's Theorem equation (9.4) in lecture notes relates a line integral to a double integral.",
          latencyMs: 42,
          usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        }),
      },
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'What is Green’s Theorem?',
      teachingMode: 'explain',
    };

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: req,
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('mixed');
      expect(res.response.result.text).toContain('line integral');
      expect(res.response.result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
      expect(res.response.result.sources.length).toBe(1);
      expect(res.response.result.sources[0]?.sourceKind).toBe('free_space_pdf');
    }
  });

  it('4. returns pdf_selection tier when PDF capture is present and grounded with 0 chunks (SKE1.2)', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'The quadratic equation f(x) = x^2 - 4 represents a parabola with roots at x = 2 and x = -2.',
          latencyMs: 42,
          usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
        }),
      },
    });

    const req: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain this equation',
      teachingMode: 'explain',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 1,
        text: 'f(x) = x^2 - 4',
      },
    };

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: req,
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('pdf_selection');
      expect(res.response.result.contextAvailable).toEqual({
        hasIndexedChunks: false,
        hasPdfCapture: true,
      });
    }
  });

  it('5. preserves legacy fail-closed knowledge_not_found when teachingMode is omitted on zero-hit queries', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'General question without teachingMode or capture',
    };

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: req,
      deps,
    });

    expect(res.response.ok).toBe(false);
    if (!res.response.ok) {
      expect(res.response.error.code).toBe('knowledge_not_found');
    }
  });

  it('6. buildAskCourseMessages inserts clear general academic instruction when chunks are empty', () => {
    const msgs = buildAskCourseMessages({
      question: 'Explain Ohm’s law',
      chunks: [],
      teachingMode: 'explain',
    });

    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toContain('SMART KNOWLEDGE EXPANSION');
    expect(msgs[1].content).toContain('No course-specific material indexed for this query');
  });

  it('7. strictly rejects client requests attempting to spoof knowledgeTier with invalid_request', () => {
    const spoofAttempt = {
      version: 2,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Can I force the tier?',
      teachingMode: 'explain',
      knowledgeTier: 'course_material',
    };

    const res = validateZikukAiRequest(spoofAttempt);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('invalid_request');
      expect(res.message).toContain('Unsupported field: knowledgeTier');
    }
  });

  it('8. system prompt enforces missing syllabus policy, explicit source-only, and fictional concept boundaries', () => {
    const msgs = buildAskCourseMessages({
      question: 'What is the late submission penalty?',
      chunks: [],
      teachingMode: 'explain',
    });

    const sysPrompt = msgs[0].content;
    // Missing syllabus / course logistics
    expect(sysPrompt).toContain('state factually and politely that lecture/syllabus notes for this topic are not in the uploaded materials');
    // Source-only requests
    expect(sysPrompt).toContain('SOURCE-SPECIFIC REQUESTS & EXPLICIT SOURCE-ONLY INQUIRIES');
    expect(sysPrompt).toContain('state clearly and respectfully what is or is not covered in the notes without speculating');
    // Unknown or fabricated concepts
    expect(sysPrompt).toContain('UNKNOWN OR FABRICATED CONCEPTS');
    expect(sysPrompt).toContain('clarify clearly that it is not recognized in established scholarship');
  });

  it('9. citation integrity: zero numbered citations when chunks are empty', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'General explanation of Taylor series without any citations.',
          latencyMs: 30,
          usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
        }),
      },
    });

    const req: ZikukAiAskCourseRequestV2 = {
      version: 2,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain Taylor series',
      teachingMode: 'explain',
    };

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: req,
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.sources).toHaveLength(0);
      expect(res.response.result.knowledgeTier).toBe('general_academic');
    }
  });

  it('10. preserves pedagogical mode directives under zero-chunk expansion across all four modes', () => {
    const modes: TeachingMode[] = ['explain', 'teach_me', 'just_answer', 'exam_prep'];

    for (const mode of modes) {
      const msgs = buildAskCourseMessages({
        question: 'Solve x^2 = 4',
        chunks: [],
        teachingMode: mode,
      });

      expect(msgs).toHaveLength(2);
      const sys = msgs[0].content;
      switch (mode) {
        case 'teach_me':
          expect(sys).toContain('TEACHING MODE — TEACH ME:');
          expect(sys).toContain('Do not reveal the complete solution');
          expect(sys).toContain('ask exactly one focused question');
          break;
        case 'just_answer':
          expect(sys).toContain('TEACHING MODE — JUST ANSWER:');
          expect(sys).toContain('minimal preamble');
          break;
        case 'exam_prep':
          expect(sys).toContain('TEACHING MODE — EXAM PREP:');
          expect(sys).toContain('do NOT reveal the correct answer or explanation before the student attempts');
          break;
        case 'explain':
          expect(sys).toContain('TEACHING MODE — EXPLAIN:');
          expect(sys).toContain('clear, structured academic explanations');
          break;
      }
    }
  });
});
