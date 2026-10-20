/**
 * @vitest-environment node
 * ZIKUK AI — Tutor Teaching Quality V1 (Phase TQ1.2 Teaching Mode Regression Suite).
 *
 * Verifies:
 * 1. TeachingMode wire contract & validation (v2 & v3 allow; v1 forbids).
 * 2. Invalid modes rejected with 'invalid_request'.
 * 3. Omitted mode preserves exact TQ1.1 default behavior.
 * 4. Mode-specific prompt directives for explain, teach_me, just_answer, exam_prep.
 * 5. teach_me non-withholding exception clause ("respect explicit user request").
 * 6. exam_prep anti-fabrication boundary ("never invent professor requirements").
 * 7. Retrieval query hygiene (zero mode contamination in embedding input text).
 * 8. Full runAskCoursePipeline execution across modes with mock providers.
 */

import { describe, expect, it } from 'vitest';
import { runAskCoursePipeline, type AskCourseDeps } from './runAskCourse.ts';
import {
  buildAskCourseMessages,
  getTeachingModeDirective,
  assertSourcesIndependentOfModelText,
} from './promptAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import { validateZikukAiRequest } from '../validateRequest.ts';
import {
  VALID_TEACHING_MODES,
  isTeachingMode,
  type ZikukAiAskCourseRequestV3,
  type ZikukAiAskCourseRequestV2,
  type TeachingMode,
} from '../requestTypes.ts';
import type { PromptCourseChunk } from './retrievalTypes.ts';

const VALID_SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VALID_USER_ID = 'user-test-uuid';
const VALID_PDF_ID = 'pdf-obj-123';

function buildMockDeps(overrides?: Partial<AskCourseDeps>): AskCourseDeps {
  return {
    loadSectionOwner: async (_secId: string) => ({ userId: VALID_USER_ID }),
    loadPdfCaptureSource: async (input) => {
      if (
        input.userId === VALID_USER_ID &&
        input.sectionId === VALID_SECTION_ID &&
        input.sourceObjectId === VALID_PDF_ID
      ) {
        return {
          id: VALID_PDF_ID,
          user_id: VALID_USER_ID,
          section_id: VALID_SECTION_ID,
          object: {
            type: 'pdf',
            content: {
              type: 'pdf',
              pageCount: 20,
            },
          },
        };
      }
      return null;
    },
    embeddingProvider: createFakeEmbeddingProvider({
      fixedEmbedding: new Array(1536).fill(0.01),
      usage: { inputTokens: 12 },
    }),
    searchKnowledge: async () => ({
      ok: true as const,
      raw: [
        {
          similarity: 0.85,
          source_kind: 'free_space_pdf',
          source_object_id: VALID_PDF_ID,
          file_name: 'test_course.pdf',
          page_number: 1,
          chunk_index: 0,
          text: 'Course syllabus and foundational concepts.',
        },
      ],
    }),
    loadNotebookFsoForCitation: async () => null,
    generationProvider: {
      complete: async () => ({
        ok: true,
        text: 'Mode-aware tutor response [1].',
        usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
        rawModel: 'test-model',
        latencyMs: 120,
      }),
    },
    routerConfig: {
      model: 'test-model',
    },
    enforcement: createMemoryEnforcementStore({
      plan: 'pro',
      dailyLimit: 100,
    }),
    ...overrides,
  };
}

const mockChunk: PromptCourseChunk = {
  citationIndex: 1,
  sourceKind: 'free_space_pdf',
  sourceObjectId: VALID_PDF_ID,
  fileName: 'calculus.pdf',
  pageNumber: 4,
  text: 'Mean Value Theorem: If f is continuous on [a,b] and differentiable on (a,b)...',
};

describe('TQ1.2: TeachingMode Wire Contract & Validation', () => {
  it('recognizes all four valid teaching modes with isTeachingMode guard', () => {
    expect(VALID_TEACHING_MODES).toEqual(['explain', 'teach_me', 'just_answer', 'exam_prep']);
    for (const mode of VALID_TEACHING_MODES) {
      expect(isTeachingMode(mode)).toBe(true);
    }
    expect(isTeachingMode('random_mode')).toBe(false);
    expect(isTeachingMode('')).toBe(false);
    expect(isTeachingMode(null)).toBe(false);
    expect(isTeachingMode(123)).toBe(false);
  });

  it('validates ask_course v2 with each valid teachingMode', () => {
    for (const mode of VALID_TEACHING_MODES) {
      const res = validateZikukAiRequest({
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain this concept.',
        teachingMode: mode,
      });
      expect(res.ok).toBe(true);
      if (res.ok && res.request.capability === 'ask_course' && res.request.version === 2) {
        expect(res.request.teachingMode).toBe(mode);
      }
    }
  });

  it('validates ask_course v3 with each valid teachingMode', () => {
    for (const mode of VALID_TEACHING_MODES) {
      const res = validateZikukAiRequest({
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain this concept.',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: VALID_PDF_ID,
          sectionId: VALID_SECTION_ID,
          pageNumber: 2,
          text: 'Captured theorem excerpt.',
        },
        teachingMode: mode,
      });
      expect(res.ok).toBe(true);
      if (res.ok && res.request.capability === 'ask_course' && res.request.version === 3) {
        expect(res.request.teachingMode).toBe(mode);
      }
    }
  });

  it('accepts v2 and v3 when teachingMode is omitted (backward compatibility)', () => {
    const resV2 = validateZikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain this concept.',
    });
    expect(resV2.ok).toBe(true);
    if (resV2.ok && resV2.request.capability === 'ask_course' && resV2.request.version === 2) {
      expect(resV2.request.teachingMode).toBeUndefined();
    }

    const resV3 = validateZikukAiRequest({
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain this concept.',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 2,
        text: 'Captured theorem excerpt.',
      },
    });
    expect(resV3.ok).toBe(true);
    if (resV3.ok && resV3.request.capability === 'ask_course' && resV3.request.version === 3) {
      expect(resV3.request.teachingMode).toBeUndefined();
    }
  });

  it('rejects invalid teachingMode with code invalid_request', () => {
    const invalidModes = ['socratic', 'quiz', 'summary', '', 123, null, false];
    for (const invalid of invalidModes) {
      const res = validateZikukAiRequest({
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain this.',
        teachingMode: invalid,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('invalid_request');
        expect(res.message).toBe('Invalid teachingMode.');
      }
    }
  });

  it('rejects teachingMode in v1 request as unsupported field', () => {
    const res = validateZikukAiRequest({
      version: 1,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain this.',
      teachingMode: 'explain',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('invalid_request');
      expect(res.message).toBe('Unsupported field: teachingMode.');
    }
  });
});

describe('TQ1.2: System Prompt Mode Directives', () => {
  it('returns empty directive when mode is omitted or undefined (exact TQ1.1 preservation)', () => {
    expect(getTeachingModeDirective(undefined)).toBe('');

    const msgsWithNoMode = buildAskCourseMessages({
      question: 'Explain MVT.',
      chunks: [mockChunk],
    });
    const msgsExplicitUndefined = buildAskCourseMessages({
      question: 'Explain MVT.',
      chunks: [mockChunk],
      teachingMode: undefined,
    });
    expect(msgsWithNoMode[0]!.content).toBe(msgsExplicitUndefined[0]!.content);
    expect(msgsWithNoMode[0]!.content).not.toContain('TEACHING MODE —');
  });

  it('injects explain directive with intuition and examples', () => {
    const directive = getTeachingModeDirective('explain');
    expect(directive).toContain('TEACHING MODE — EXPLAIN:');
    expect(directive).toContain('clear, structured academic explanations');
    expect(directive).toContain('intuition, concrete examples, and appropriate depth');

    const msgs = buildAskCourseMessages({
      question: 'Explain MVT.',
      chunks: [mockChunk],
      teachingMode: 'explain',
    });
    expect(msgs[0]!.content).toContain('TEACHING MODE — EXPLAIN:');
  });

  it('injects teach_me directive with Socratic checkpoints, single question rule, and explicit solution exception', () => {
    const directive = getTeachingModeDirective('teach_me');
    expect(directive).toContain('TEACHING MODE — TEACH ME:');
    expect(directive).toContain('interactive step-by-step tutoring rather than immediately solving the problem');
    expect(directive).toContain('guide the student through exactly one meaningful step or checkpoint');
    expect(directive).toContain('ask exactly one focused question, and wait for the student\'s response');
    expect(directive).toContain('Do not reveal the complete solution, full calculation, or final answer by default');
    expect(directive).toContain('Questions such as "How do I find c?", "How do I solve this?", or asking for help with an exercise must trigger guided tutoring, NOT the complete solution');
    expect(directive).toContain('EXCEPTION: If and only if the student explicitly asks for the complete solution or full answer');

    const msgs = buildAskCourseMessages({
      question: 'Help me understand this exercise.',
      chunks: [mockChunk],
      teachingMode: 'teach_me',
    });
    expect(msgs[0]!.content).toContain('TEACHING MODE — TEACH ME:');
  });

  it('TQ1.2.4B: verifies teach_me directive distinguishes between "How do I find c?" and explicit full solution requests', () => {
    const directive = getTeachingModeDirective('teach_me');
    
    // "How do I find c?" triggers guided tutoring, not immediate answer
    expect(directive).toMatch(/Questions such as "How do I find c\?".*trigger guided tutoring, NOT the complete solution/);
    
    // Explicit demand exception
    expect(directive).toMatch(/EXCEPTION: If and only if the student explicitly asks for the complete solution or full answer.*provide the complete answer/);
  });

  it('TQ1.2.4B: Workspace Chat v2 correctly applies teachingMode with follow-up recentTurns context', () => {
    const msgs = buildAskCourseMessages({
      question: 'What is the next step?',
      chunks: [mockChunk],
      recentTurns: [
        { role: 'user', content: 'How do I find c for MVT?' },
        { role: 'assistant', content: 'First verify if f is continuous and differentiable.' },
      ],
      teachingMode: 'teach_me',
    });

    const systemPrompt = msgs[0]!.content;
    expect(systemPrompt).toContain('TEACHING MODE — TEACH ME:');
    expect(systemPrompt).toContain('In follow-up turns, adapt to the student\'s answer and guide the next step');

    const userContent = msgs[1]!.content;
    expect(userContent).toContain('CURRENT QUESTION:');
    expect(userContent).toContain('What is the next step?');
    expect(userContent).toContain('RECENT CONVERSATION');
    expect(userContent).toContain('How do I find c for MVT?');
    expect(userContent).toContain('First verify if f is continuous and differentiable.');
  });

  it('injects just_answer directive with concise, direct answer guidance', () => {
    const directive = getTeachingModeDirective('just_answer');
    expect(directive).toContain('TEACHING MODE — JUST ANSWER:');
    expect(directive).toContain('concise, accurate, and direct answers with minimal preamble');
    expect(directive).toContain('without unnecessary conversational filler');

    const msgs = buildAskCourseMessages({
      question: 'What is the value of c?',
      chunks: [mockChunk],
      teachingMode: 'just_answer',
    });
    expect(msgs[0]!.content).toContain('TEACHING MODE — JUST ANSWER:');
  });

  it('injects exam_prep directive with assessment pitfalls and strict anti-fabrication boundary', () => {
    const directive = getTeachingModeDirective('exam_prep');
    expect(directive).toContain('TEACHING MODE — EXAM PREP:');
    expect(directive).toContain('exam-oriented explanations');
    expect(directive).toContain('common misconceptions, student traps, and evidence-grounded assessment guidance');
    expect(directive).toContain('short practice check or exam-style question');
    // Grounding integrity:
    expect(directive).toContain('Never invent professor-specific requirements, grading rubrics, or exam dates');

    const msgs = buildAskCourseMessages({
      question: 'How is Fuller tested on the final?',
      chunks: [mockChunk],
      teachingMode: 'exam_prep',
    });
    expect(msgs[0]!.content).toContain('TEACHING MODE — EXAM PREP:');
    expect(msgs[0]!.content).toContain('Never invent professor-specific requirements');
  });

  it('applies mode directives across all three message types (V1, V2, V3_TUTOR)', () => {
    // V3 (PDF capture)
    const msgsV3 = buildAskCourseMessages({
      question: 'Explain selection.',
      chunks: [mockChunk],
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 4,
        text: 'PDF captured text',
      },
      teachingMode: 'exam_prep',
    });
    expect(msgsV3[0]!.content).toContain('ZIKUK\'s contextual PDF academic tutor');
    expect(msgsV3[0]!.content).toContain('TEACHING MODE — EXAM PREP:');

    // V2 (Multi-turn Workspace Chat)
    const msgsV2 = buildAskCourseMessages({
      question: 'What about step 2?',
      chunks: [mockChunk],
      recentTurns: [
        { role: 'user', content: 'Step 1' },
        { role: 'assistant', content: 'Step 1 explanation' },
      ],
      teachingMode: 'teach_me',
    });
    expect(msgsV2[0]!.content).toContain('ZIKUK\'s course-aware academic tutor');
    expect(msgsV2[0]!.content).toContain('TEACHING MODE — TEACH ME:');

    // V1 / Initial turn in workspace chat
    const msgsV1 = buildAskCourseMessages({
      question: 'What is inflation?',
      chunks: [mockChunk],
      teachingMode: 'just_answer',
    });
    expect(msgsV1[0]!.content).toContain('TEACHING MODE — JUST ANSWER:');
  });
});

describe('TQ1.2: Retrieval Query Hygiene', () => {
  it('ensures embedding input query is NEVER contaminated with teachingMode instructions', async () => {
    let embeddedInput = '';

    const deps = buildMockDeps({
      embeddingProvider: {
        async embed(input) {
          embeddedInput = input.inputs[0] ?? '';
          return {
            ok: true,
            embeddings: [new Array(1536).fill(0.01)],
            usage: { inputTokens: 10 },
          };
        },
      },
    });

    const v3Request: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'How do I solve this step-by-step?',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 4,
        text: 'Formula: f(b) - f(a) = f\'(c)(b - a)',
      },
      teachingMode: 'teach_me',
    };

    await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: v3Request,
      deps,
    });

    expect(embeddedInput).toContain('Formula: f(b) - f(a)');
    expect(embeddedInput).toContain('How do I solve this step-by-step?');
    // Strict hygiene:
    expect(embeddedInput).not.toContain('teach_me');
    expect(embeddedInput).not.toContain('TEACHING MODE');
    expect(embeddedInput).not.toContain('Socratic');
    expect(embeddedInput).not.toContain('checkpoint');
  });
});

describe('TQ1.2: Pipeline Execution Across All Modes', () => {
  for (const mode of VALID_TEACHING_MODES) {
    it(`executes runAskCoursePipeline with mode "${mode}" successfully`, async () => {
      let capturedSystemPrompt = '';

      const deps = buildMockDeps({
        generationProvider: {
          complete: async (input) => {
            const sys = input.messages.find((m) => m.role === 'system');
            capturedSystemPrompt = sys?.content ?? '';
            return {
              ok: true,
              text: `Grounded answer in ${mode} mode: Course syllabus and foundational concepts [1].`,
              usage: { inputTokens: 60, outputTokens: 30, totalTokens: 90 },
              rawModel: 'test-model',
              latencyMs: 100,
            };
          },
        },
      });

      const request: ZikukAiAskCourseRequestV3 = {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Solve this exercise.',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: VALID_PDF_ID,
          sectionId: VALID_SECTION_ID,
          pageNumber: 1,
          text: 'Captured exercise text.',
        },
        teachingMode: mode,
      };

      const result = await runAskCoursePipeline({
        authUserId: VALID_USER_ID,
        request,
        deps,
      });

      expect(result.response.ok).toBe(true);
      if (result.response.ok && result.response.result.type === 'ask_course') {
        expect(result.response.result.text).toContain(`in ${mode} mode`);
        expect(result.response.result.text).toContain('Course syllabus and foundational concepts [1]');
      }
      expect(capturedSystemPrompt).toContain(getTeachingModeDirective(mode));
    });
  }
});
