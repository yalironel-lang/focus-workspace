/**
 * @vitest-environment node
 * ZIKUK AI — Smart Knowledge Expansion (Phase SKE1.2 Test Suite).
 *
 * Verifies SKE1.2 server-authoritative knowledge provenance & retrieval de-pollution:
 * 1. General math question with unrelated Law PDF selection -> 'general_academic'.
 * 2. Question genuinely grounded in selected PDF text -> 'pdf_selection'.
 * 3. Mixed PDF selection and general academic explanation -> 'mixed'.
 * 4. Retrieved course chunks present -> 'course_material'.
 * 5. contextAvailable metadata correctly distinguishes received context from supported provenance.
 * 6. Retrieval de-pollution: Standalone question omits unrelated capture text from vector query.
 * 7. Retrieval preservation: Referential follow-up preserves capture text in vector query.
 * 8. Client cannot spoof or inject knowledgeTier (rejected in preflight).
 * 9. Citation integrity: No fabricated citations on general_academic, pdf_selection, or mixed.
 * 10. Teaching modes: Provenance functions across all four teaching modes.
 */

import { describe, expect, it } from 'vitest';
import { runAskCoursePipeline, type AskCourseDeps } from './runAskCourse.ts';
import { buildAskCourseRetrievalQuery } from './buildAskCourseRetrievalQuery.ts';
import {
  applyClaimLevelGrounding,
  SOURCE_ONLY_INTERPRETATION_NOTICE,
} from './evaluateGroundingProvenance.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import { preflightGatewayRequest } from '../preflightGatewayRequest.ts';
import type {
  ZikukAiAskCourseRequestV3,
  TeachingMode,
} from '../requestTypes.ts';

const VALID_SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VALID_USER_ID = 'ske12-test-user-id';
const VALID_PDF_ID = 'ske12-pdf-obj-1';

function buildMockDeps(overrides?: Partial<AskCourseDeps>): AskCourseDeps {
  return {
    loadSectionOwner: async () => ({ userId: VALID_USER_ID }),
    loadPdfCaptureSource: async () => ({
      id: VALID_PDF_ID,
      user_id: VALID_USER_ID,
      section_id: VALID_SECTION_ID,
      object: { type: 'pdf', content: { type: 'pdf', pageCount: 20 } },
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
        text: 'The divergence theorem equates the flux of a vector field through a closed surface to the volume integral of the divergence over the region inside the surface.',
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

describe('ZIKUK AI — SKE1.2 Provenance Integrity & Retrieval Suite', () => {
  it('1. classifies general math inquiry with unrelated Law PDF selection as general_academic', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'The divergence theorem states that the surface integral of a vector field over a closed boundary surface equals the volume integral of its divergence.',
        }),
      },
    });

    const req: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain the divergence theorem and its physical intuition.',
      teachingMode: 'explain',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 4,
        text: 'The doctrine of consideration in contract law requires that each party must provide something of value, either a benefit or detriment.',
      },
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
      expect(res.response.result.contextAvailable).toEqual({
        hasIndexedChunks: false,
        hasPdfCapture: true,
      });
    }
  });

  it('2. classifies answer genuinely grounded in PDF selection as pdf_selection', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'Under the doctrine of promissory estoppel, detrimental reliance may substitute for consideration if the promisor reasonably foresaw the reliance.',
        }),
      },
    });

    const req: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'What does this paragraph say about promissory estoppel?',
      teachingMode: 'explain',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 12,
        text: 'Under the doctrine of promissory estoppel, a promise without consideration is enforceable if there is reasonable, foreseeable detrimental reliance.',
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
      expect(res.response.result.sources).toEqual([]);
      expect(res.response.result.contextAvailable).toEqual({
        hasIndexedChunks: false,
        hasPdfCapture: true,
      });
    }
  });

  it('3. classifies blended/uncertain attribution as mixed when selection influence cannot be excluded', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'While the text mentions promissory estoppel, classical contract theory also recognizes moral consideration in certain civil jurisdictions, which operates under Roman law traditions.',
        }),
      },
    });

    const req: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Can you expand on how this relates to broader contract theories?',
      teachingMode: 'explain',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 12,
        text: 'Promissory estoppel provides an equitable remedy.',
      },
    };

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: req,
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('mixed');
      expect(res.response.result.contextAvailable).toEqual({
        hasIndexedChunks: false,
        hasPdfCapture: true,
      });
    }
  });

  it('4. keeps term overlap with retrieved chunks uncertain instead of course_material', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({
        ok: true as const,
        raw: [
          {
            source_kind: 'free_space_pdf',
            source_object_id: VALID_PDF_ID,
            file_name: 'Calculus.pdf',
            page_number: 8,
            chunk_index: 0,
            text: 'The Divergence Theorem states that the outward flux through S equals the integral of div F.',
            similarity: 0.88,
          },
        ],
      }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'As stated in the course materials [1], the Divergence Theorem relates surface flux to volume divergence.',
        }),
      },
    });

    const req: ZikukAiAskCourseRequestV3 = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'Explain the divergence theorem',
      teachingMode: 'explain',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 1,
        text: 'Some attached text',
      },
    };

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: req,
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('mixed');
      expect(res.response.result.sources.length).toBe(1);
      expect(res.response.result.text).not.toMatch(/\[\d+\]/);
      expect(res.response.result.contextAvailable).toEqual({
        hasIndexedChunks: true,
        hasPdfCapture: true,
      });
    }
  });

  it('5. retrieval query de-pollution: standalone question omits unrelated capture text', () => {
    const query = buildAskCourseRetrievalQuery({
      question: 'Explain the divergence theorem and its physical intuition.',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 3,
        text: 'The doctrine of consideration in contract law requires mutual assent and exchange of value.',
      },
    });

    expect(query).toBe('CURRENT QUESTION:\nExplain the divergence theorem and its physical intuition.');
    expect(query).not.toContain('doctrine of consideration');
  });

  it('6. retrieval query preservation: referential question preserves capture text', () => {
    const query = buildAskCourseRetrievalQuery({
      question: 'Explain this paragraph and give an example',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 3,
        text: 'Mean Value Theorem: If f is continuous on [a, b] and differentiable on (a, b), there exists c.',
      },
    });

    expect(query).toContain('PDF SELECTION:');
    expect(query).toContain('Mean Value Theorem');
    expect(query).toContain('QUESTION:\nExplain this paragraph and give an example');
  });

  it('7. client cannot spoof or inject knowledgeTier (rejected in preflight)', () => {
    const body = {
      version: 3,
      capability: 'ask_course',
      sectionId: VALID_SECTION_ID,
      question: 'test question',
      teachingMode: 'explain',
      knowledgeTier: 'course_material',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 1,
        text: 'test',
      },
    };

    const preflight = preflightGatewayRequest({
      body,
      authUserId: VALID_USER_ID,
    });

    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.response.error.code).toBe('invalid_request');
      expect(preflight.response.error.message).toContain('knowledgeTier');
    }
  });

  it('8. teaching modes: provenance works across all 4 modes', async () => {
    const modes: TeachingMode[] = ['explain', 'teach_me', 'just_answer', 'exam_prep'];

    for (const mode of modes) {
      const deps = buildMockDeps({
        searchKnowledge: async () => ({ ok: true as const, raw: [] }),
        generationProvider: {
          complete: async () => ({
            ok: true,
            text: `Answer in ${mode} mode for divergence theorem.`,
          }),
        },
      });

      const res = await runAskCoursePipeline({
        authUserId: VALID_USER_ID,
        request: {
          version: 3,
          capability: 'ask_course',
          sectionId: VALID_SECTION_ID,
          question: 'Explain divergence theorem',
          teachingMode: mode,
          capture: {
            sourceKind: 'free_space_pdf',
            sourceObjectId: VALID_PDF_ID,
            sectionId: VALID_SECTION_ID,
            pageNumber: 1,
            text: 'Law text about contracts',
          },
        },
        deps,
      });

      expect(res.response.ok).toBe(true);
      if (res.response.ok && res.response.result.type === 'ask_course') {
        expect(res.response.result.knowledgeTier).toBe('general_academic');
      }
    }
  });

  it('9. does not treat retrieved chunks or citation markers as verified course grounding', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({
        ok: true as const,
        raw: [
          {
            source_kind: 'free_space_pdf',
            source_object_id: VALID_PDF_ID,
            file_name: 'Contracts.pdf',
            page_number: 2,
            chunk_index: 0,
            text: 'The doctrine of consideration requires a bargained-for exchange.',
            similarity: 0.99,
          },
        ],
      }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'The divergence theorem equates flux through a closed surface to the volume integral of divergence. [1]',
        }),
      },
    });

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain the divergence theorem and its physical intuition.',
        teachingMode: 'explain',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: VALID_PDF_ID,
          sectionId: VALID_SECTION_ID,
          pageNumber: 2,
          text: 'The doctrine of consideration requires a bargained-for exchange.',
        },
      },
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('general_academic');
      expect(res.response.result.contextAvailable).toEqual({
        hasIndexedChunks: true,
        hasPdfCapture: true,
      });
      expect(res.response.result.sources).toHaveLength(1);
      expect(res.response.result.text).not.toMatch(/\[\d+\]/);
    }
  });

  it('10. explicit source-only request without supported wording is mixed, not verified', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'The divergence theorem equates flux through a closed surface to a volume integral.',
        }),
      },
    });

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain only using the course notes.',
        teachingMode: 'explain',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: VALID_PDF_ID,
          sectionId: VALID_SECTION_ID,
          pageNumber: 4,
          text: 'Promissory estoppel is an equitable doctrine.',
        },
      },
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('mixed');
      expect(res.response.result.sources).toEqual([]);
      expect(res.response.result.text).toContain('cannot be established from the available source');
      expect(res.response.result.text.toLowerCase()).not.toContain('divergence theorem');
    }
  });

  it('11. source-only retrieval keeps the selection even when the question shares no terms', () => {
    const query = buildAskCourseRetrievalQuery({
      question: 'Explain only using the course notes.',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: VALID_PDF_ID,
        sectionId: VALID_SECTION_ID,
        pageNumber: 4,
        text: 'Promissory estoppel is an equitable doctrine.',
      },
    });

    expect(query).toContain('PDF SELECTION:');
    expect(query).toContain('Promissory estoppel');
  });

  it('12. strips fabricated numbered citations when no indexed chunk was retrieved', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'Taylor series expand a smooth function around a point [1] [99].',
        }),
      },
    });

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain Taylor series',
        teachingMode: 'just_answer',
      },
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('general_academic');
      expect(res.response.result.sources).toEqual([]);
      expect(res.response.result.text).not.toMatch(/\[\d+\]/);
      expect(res.response.result.text).toContain('Taylor series');
    }
  });

  it('13. client cannot spoof contextAvailable', () => {
    const preflight = preflightGatewayRequest({
      body: {
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain divergence theorem',
        teachingMode: 'explain',
        contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
      },
      authUserId: VALID_USER_ID,
    });

    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.response.error.code).toBe('invalid_request');
      expect(preflight.response.error.message).toContain('contextAvailable');
    }
  });

  it('14. unsupported source-only request without a PDF selection is not answered from general knowledge', async () => {
    const deps = buildMockDeps({
      searchKnowledge: async () => ({
        ok: true as const,
        raw: [
          {
            source_kind: 'free_space_pdf',
            source_object_id: VALID_PDF_ID,
            file_name: 'Contracts.pdf',
            page_number: 2,
            chunk_index: 0,
            text: 'Consideration requires a bargained-for exchange.',
            similarity: 0.4,
          },
        ],
      }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: 'The exam is on 12 May according to standard university practice. [1]',
        }),
      },
    });

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'What is the exam date according to the course materials?',
        teachingMode: 'explain',
      },
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('mixed');
      expect(res.response.result.contextAvailable.hasPdfCapture).toBe(false);
      expect(res.response.result.contextAvailable.hasIndexedChunks).toBe(true);
      expect(res.response.result.text).toContain('cannot be established from the available source');
      expect(res.response.result.text).not.toContain('12 May');
      expect(res.response.result.text).not.toMatch(/\[\d+\]/);
    }
  });

  it('15. source-only request keeps a quotation from the attached PDF selection', async () => {
    const selection =
      'Promissory estoppel is an equitable doctrine that enforces a promise after detrimental reliance.';
    const deps = buildMockDeps({
      searchKnowledge: async () => ({ ok: true as const, raw: [] }),
      generationProvider: {
        complete: async () => ({
          ok: true,
          text: `${selection} [PDF selection]`,
        }),
      },
    });

    const res = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Answer using only the selected text.',
        teachingMode: 'just_answer',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: VALID_PDF_ID,
          sectionId: VALID_SECTION_ID,
          pageNumber: 4,
          text: selection,
        },
      },
      deps,
    });

    expect(res.response.ok).toBe(true);
    if (res.response.ok && res.response.result.type === 'ask_course') {
      expect(res.response.result.knowledgeTier).toBe('pdf_selection');
      expect(res.response.result.text).toContain(selection);
      expect(res.response.result.text).toContain('[PDF selection]');
      expect(res.response.result.text).not.toMatch(/\[\d+\]/);
    }
  });

  it('16. citation integrity across general, PDF selection, mixed, and course material', async () => {
    const quotedChunk = 'The Divergence Theorem states that the outward flux through S equals the integral of div F.';

    const general = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain Taylor series',
        teachingMode: 'explain',
      },
      deps: buildMockDeps({
        searchKnowledge: async () => ({ ok: true as const, raw: [] }),
        generationProvider: {
          complete: async () => ({ ok: true, text: 'A Taylor series is a local polynomial approximation [1] [PDF selection].' }),
        },
      }),
    });
    if (general.response.ok && general.response.result.type === 'ask_course') {
      expect(general.response.result.knowledgeTier).toBe('general_academic');
      expect(general.response.result.text).not.toMatch(/\[\d+\]|\[PDF selection\]/i);
    }

    const pdf = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'What does this paragraph say about promissory estoppel?',
        teachingMode: 'explain',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: VALID_PDF_ID,
          sectionId: VALID_SECTION_ID,
          pageNumber: 4,
          text: 'Under the doctrine of promissory estoppel, detrimental reliance can make a promise enforceable.',
        },
      },
      deps: buildMockDeps({
        searchKnowledge: async () => ({ ok: true as const, raw: [] }),
        generationProvider: {
          complete: async () => ({
            ok: true,
            text: 'Under the doctrine of promissory estoppel, detrimental reliance can make a promise enforceable. [PDF selection] [2]',
          }),
        },
      }),
    });
    if (pdf.response.ok && pdf.response.result.type === 'ask_course') {
      expect(pdf.response.result.knowledgeTier).toBe('pdf_selection');
      expect(pdf.response.result.text).toContain('[PDF selection]');
      expect(pdf.response.result.text).not.toMatch(/\[\d+\]/);
    }

    const mixed = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Can you expand on how this relates to broader contract theories?',
        teachingMode: 'explain',
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: VALID_PDF_ID,
          sectionId: VALID_SECTION_ID,
          pageNumber: 4,
          text: 'Promissory estoppel provides an equitable remedy.',
        },
      },
      deps: buildMockDeps({
        searchKnowledge: async () => ({ ok: true as const, raw: [] }),
        generationProvider: {
          complete: async () => ({
            ok: true,
            text: 'Promissory estoppel also appears in broader civil-law writing. [1] [PDF selection]',
          }),
        },
      }),
    });
    if (mixed.response.ok && mixed.response.result.type === 'ask_course') {
      expect(mixed.response.result.knowledgeTier).toBe('mixed');
      expect(mixed.response.result.text).not.toMatch(/\[\d+\]/);
      expect(mixed.response.result.text).not.toMatch(/\[PDF selection\]/i);
    }

    const course = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain the divergence theorem',
        teachingMode: 'explain',
      },
      deps: buildMockDeps({
        searchKnowledge: async () => ({
          ok: true as const,
          raw: [
            {
              source_kind: 'free_space_pdf',
              source_object_id: VALID_PDF_ID,
              file_name: 'Calculus.pdf',
              page_number: 8,
              chunk_index: 0,
              text: quotedChunk,
              similarity: 0.9,
            },
          ],
        }),
        generationProvider: {
          complete: async () => ({
            ok: true,
            text: `${quotedChunk} [1] Further commentary is unsupported [99].`,
          }),
        },
      }),
    });
    if (course.response.ok && course.response.result.type === 'ask_course') {
      expect(course.response.result.knowledgeTier).toBe('course_material');
      expect(course.response.result.text).toContain(quotedChunk);
      expect(course.response.result.text).toContain('[1]');
      expect(course.response.result.text).not.toContain('[99]');
      expect(course.response.result.sources).toHaveLength(1);
    }
  });

  it('17. source-only claim matrix keeps explanations and rejects unsupported claims', async () => {
    const divergence = 'The Divergence Theorem states that the outward flux through S equals the integral of div F.';
    const estoppel = 'Promissory estoppel is an equitable doctrine that enforces a promise after detrimental reliance.';
    const formula = "f'(c) = (f(b) - f(a)) / (b - a)";
    const penalty = 'The penalty for late submission is 5 marks.';

    async function ask(input: {
      question: string;
      answer: string;
      capture?: string;
      chunk?: string;
      mode?: TeachingMode;
    }) {
      const res = await runAskCoursePipeline({
        authUserId: VALID_USER_ID,
        request: {
          version: input.capture ? 3 : 2,
          capability: 'ask_course',
          sectionId: VALID_SECTION_ID,
          question: input.question,
          teachingMode: input.mode ?? 'explain',
          ...(input.capture
            ? {
                capture: {
                  sourceKind: 'free_space_pdf' as const,
                  sourceObjectId: VALID_PDF_ID,
                  sectionId: VALID_SECTION_ID,
                  pageNumber: 4,
                  text: input.capture,
                },
              }
            : {}),
        },
        deps: buildMockDeps({
          searchKnowledge: async () => ({
            ok: true as const,
            raw: input.chunk
              ? [
                  {
                    source_kind: 'free_space_pdf',
                    source_object_id: VALID_PDF_ID,
                    file_name: 'Course.pdf',
                    page_number: 2,
                    chunk_index: 0,
                    text: input.chunk,
                    similarity: 0.9,
                  },
                ]
              : [],
          }),
          generationProvider: {
            complete: async () => ({ ok: true, text: input.answer }),
          },
        }),
      });
      expect(res.response.ok).toBe(true);
      if (!res.response.ok || res.response.result.type !== 'ask_course') {
        throw new Error('expected ask_course success');
      }
      return res.response.result;
    }

    const paraphrase = await ask({
      question: 'Explain this using only the selected text.',
      capture: divergence,
      answer: 'The theorem says the total flux leaving a closed surface equals the integral of the divergence inside the volume.',
    });
    expect(paraphrase.knowledgeTier).toBe('mixed');
    expect(paraphrase.text).toContain('total flux leaving a closed surface');
    expect(paraphrase.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
    expect(paraphrase.text).not.toMatch(/\[\d+\]/);
    expect(paraphrase.contextAvailable).toEqual({ hasIndexedChunks: false, hasPdfCapture: true });

    const math = await ask({
      question: 'Explain using only the selected text.',
      capture: formula,
      answer: 'There is a point c where the instantaneous rate of change equals the average rate of change from a to b.',
    });
    expect(math.knowledgeTier).toBe('mixed');
    expect(math.text).toContain('instantaneous rate of change');
    expect(math.text).toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
    expect(math.knowledgeTier).not.toBe('pdf_selection');

    const legal = await ask({
      question: 'Simplify this using only the selected text.',
      capture: estoppel,
      answer: 'If someone relies on a promise and is worse off, equity can hold the promisor to it.',
    });
    expect(legal.knowledgeTier).toBe('mixed');
    expect(legal.text).toContain('relies on a promise');
    expect(legal.text).toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);

    const translation = await ask({
      question: 'Explain only using the selected text.',
      capture: 'Le théorème de la divergence relie le flux sortant à la divergence.',
      answer: 'The divergence theorem relates outward flux to divergence.',
    });
    expect(translation.knowledgeTier).toBe('mixed');
    expect(translation.text).toContain('relates outward flux');
    expect(translation.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
    expect(translation.knowledgeTier).not.toBe('general_academic');

    const translatedScript = await ask({
      question: 'What does the selection say? Answer from the selected text only.',
      capture: '散度定理把通过闭合曲面的通量与内部散度联系在一起。',
      answer: 'The divergence theorem connects the flux through a closed surface with the divergence inside it.',
    });
    expect(translatedScript.knowledgeTier).toBe('mixed');
    expect(translatedScript.text).toContain('connects the flux');
    expect(translatedScript.text).toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);

    const examDate = await ask({
      question: 'What is the exam date according to the course materials?',
      chunk: 'Consideration requires a bargained-for exchange.',
      answer: 'The exam is on 12 May. Consideration requires a bargained-for exchange.',
    });
    expect(examDate.knowledgeTier).toBe('mixed');
    expect(examDate.text).not.toContain('12 May');
    expect(examDate.text).toContain('bargained-for exchange');
    expect(examDate.text).toContain('cannot be established from the available source');

    const grading = await ask({
      question: 'What does the text say about the grading policy?',
      capture: estoppel,
      answer: 'Late work loses 10 percent of the grade. Promissory estoppel is an equitable doctrine that enforces a promise after detrimental reliance.',
    });
    expect(grading.text).not.toContain('10 percent');
    expect(grading.text).toContain('equitable doctrine');
    expect(grading.text).toContain('cannot be established from the available source');
    expect(grading.knowledgeTier).toBe('mixed');

    const unrelated = await ask({
      question: 'Explain only using the course notes.',
      capture: estoppel,
      answer: 'The divergence theorem equates flux through a closed surface to a volume integral.',
    });
    expect(unrelated.knowledgeTier).toBe('mixed');
    expect(unrelated.text).toContain('cannot be established from the available source');
    expect(unrelated.text.toLowerCase()).not.toContain('divergence');

    const reversed = await ask({
      question: 'Answer using only the selected text.',
      capture: divergence,
      answer: 'The outward flux through S does not equal the integral of div F.',
    });
    expect(reversed.text).not.toContain('does not equal');
    expect(reversed.text).toContain('cannot be established from the available source');
    expect(reversed.knowledgeTier).toBe('mixed');

    const wrongNumber = await ask({
      question: 'What is the penalty according to the course materials?',
      chunk: penalty,
      answer: 'The penalty for late submission is 50 marks.',
    });
    expect(wrongNumber.text).not.toContain('50');
    expect(wrongNumber.text).toContain('cannot be established from the available source');

    const causal = await ask({
      question: 'Answer using only the selected text.',
      capture: 'Promissory estoppel is an equitable doctrine.',
      answer: 'Promissory estoppel is an equitable doctrine because courts want to punish promisors.',
    });
    expect(causal.text).not.toContain('punish');
    expect(causal.text).toContain('equitable doctrine');
    expect(causal.text).toContain('cannot be established from the available source');
    expect(causal.knowledgeTier).toBe('mixed');

    const mixedQualification = await ask({
      question: 'Explain this using only the selected text.',
      capture: divergence,
      answer:
        'The theorem says the total flux leaving a closed surface equals the integral of the divergence inside the volume. The exam is on 12 May.',
    });
    expect(mixedQualification.knowledgeTier).toBe('mixed');
    expect(mixedQualification.text).toContain('total flux leaving a closed surface');
    expect(mixedQualification.text).not.toContain('12 May');
    expect(mixedQualification.text.match(/cannot be established/g)).toEqual(['cannot be established']);
    expect(mixedQualification.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);

    const cited = await ask({
      question: 'Explain the divergence theorem',
      chunk: divergence,
      answer: `${divergence} [1] Further commentary is unsupported [99].`,
    });
    expect(cited.knowledgeTier).toBe('course_material');
    expect(cited.text).toContain('[1]');
    expect(cited.text).not.toContain('[99]');

    const stripped = await ask({
      question: 'Explain Taylor series',
      answer: 'A Taylor series is a local polynomial approximation [1] [99].',
    });
    expect(stripped.knowledgeTier).toBe('general_academic');
    expect(stripped.text).not.toMatch(/\[\d+\]/);
    expect(stripped.text).toContain('Taylor series');

    for (const mode of ['explain', 'teach_me', 'just_answer', 'exam_prep'] as const) {
      const modeResult = await ask({
        question: 'Explain this using only the selected text.',
        capture: divergence,
        mode,
        answer: 'The theorem says the total flux leaving a closed surface equals the integral of the divergence inside the volume.',
      });
      expect(modeResult.knowledgeTier).toBe('mixed');
      expect(modeResult.text).toContain('total flux leaving a closed surface');
      expect(modeResult.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
    }
  });

  it('keeps academic Markdown when no course fact is removed, and still removes one', () => {
    const quoted = 'Saving adds to the capital stock.';
    const answer = [
      '**Growth model**',
      '',
      `${quoted} [1]`,
      '',
      '### Step 1. Define the production function',
      '',
      'The economy produces output from capital and labour.',
      '',
      '- Physical capital',
      '- Labour',
      '',
      'If f\'(k) > n + g + δ, the economy has too little capital.',
      '',
      '```',
      'k = 1',
      '```',
    ].join('\n');

    const preserved = applyClaimLevelGrounding({
      question: 'Explain the model step by step.',
      answerText: answer,
      chunks: [{ citationIndex: 1, text: quoted }],
      captureText: '',
      contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
    });
    expect(preserved.knowledgeTier).toBe('course_material');
    expect(preserved.text).toBe(answer);

    const mixed = applyClaimLevelGrounding({
      question: 'Explain the model step by step.',
      answerText: 'The model explains economic growth.',
      chunks: [{ citationIndex: 1, text: 'Chapter notes on economic growth.' }],
      captureText: '',
      contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
    });
    expect(mixed.knowledgeTier).toBe('mixed');
    expect(mixed.text).toBe('The model explains economic growth.');

    const withFact = `${answer}\n\nThe exam is on 12 May.`;
    const removed = applyClaimLevelGrounding({
      question: 'Explain the model step by step.',
      answerText: withFact,
      chunks: [{ citationIndex: 1, text: quoted }],
      captureText: '',
      contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
    });
    expect(removed.text).toBe(answer);
    expect(removed.text).not.toContain('12 May');
    expect(removed.text).toContain('### Step 1. Define the production function');
    expect(removed.text).toContain('- Physical capital');
    expect(removed.text).toContain('[1]');
    expect(removed.knowledgeTier).toBe('course_material');
  });

  it('omits standalone retrieval-status sentences without weakening academic checks', () => {
    const question = 'According to the PDF, what is the cyclical part of real GDP?';
    const answer =
      'According to the PDF, the cyclical part of real GDP is: Real GDP − trend real GDP.';
    const corpus = 'The cyclical part of real GDP is real GDP less trend real GDP.';
    const contextAvailable = { hasIndexedChunks: true, hasPdfCapture: false } as const;
    const base = {
      question,
      chunks: [{ citationIndex: 1, text: corpus }],
      captureText: '',
      contextAvailable,
    };

    const withStatus = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} Retrieved pages: 1–6.`,
    });
    expect(withStatus.text).toBe(answer);
    expect(withStatus.text).not.toContain('unsupported part');
    expect(withStatus.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
    expect(withStatus.knowledgeTier).toBe('course_material');

    const withStatusWords = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} Pages 1-6 were retrieved.`,
    });
    expect(withStatusWords.text).toBe(answer);
    expect(withStatusWords.knowledgeTier).toBe('course_material');

    const withClaim = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} Nominal wages determine the contract.`,
    });
    expect(withClaim.text).toContain(answer);
    expect(withClaim.text).not.toContain('Nominal wages');
    expect(withClaim.text).toContain(
      'The unsupported part cannot be established from the available source.',
    );
    expect(withClaim.knowledgeTier).toBe('mixed');

    const limitation = SOURCE_ONLY_INTERPRETATION_NOTICE;
    const withLimitation = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} ${limitation}`,
    });
    expect(withLimitation.text).toContain(answer);
    expect(withLimitation.text.match(/not established as a direct statement/g)).toEqual([
      'not established as a direct statement',
    ]);
    expect(withLimitation.text).not.toContain('unsupported part');

    const pageSentence = applyClaimLevelGrounding({
      ...base,
      answerText:
        'Page 2 states that the cyclical part of real GDP is real GDP less trend real GDP.',
    });
    expect(pageSentence.text).toContain('Page 2 states that');
    expect(pageSentence.knowledgeTier).toBe('course_material');

    const changedOnPage = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} Page 2 states that the penalty is 50 marks.`,
    });
    expect(changedOnPage.text).toContain(answer);
    expect(changedOnPage.text).not.toContain('50');
    expect(changedOnPage.text).toContain(
      'The unsupported part cannot be established from the available source.',
    );

    const embedded = applyClaimLevelGrounding({
      ...base,
      answerText:
        'Retrieved pages include the definition of the cyclical part of real GDP as real GDP less trend real GDP.',
    });
    expect(embedded.text.toLowerCase()).toContain('retrieved pages include');

    const ordinary = applyClaimLevelGrounding({
      question: 'What is monetary policy?',
      answerText: 'Saving adds to the capital stock. Retrieved pages: 1–6.',
      chunks: [{ citationIndex: 1, text: 'Saving adds to the capital stock.' }],
      captureText: '',
      contextAvailable,
    });
    expect(ordinary.text).toBe('Saving adds to the capital stock.');
    expect(ordinary.knowledgeTier).toBe('course_material');
    expect(ordinary.text).not.toContain('unsupported');

    const missing = applyClaimLevelGrounding({
      question,
      answerText: answer,
      chunks: [],
      captureText: '',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: false },
    });
    expect(missing.text).toContain('No PDF selection or course material was available');
    expect(missing.text).not.toContain('Real GDP');
    expect(missing.knowledgeTier).toBe('mixed');
  });

  it('keeps a multiple-choice label only when that option states the supported answer', () => {
    const question = 'According to the PDF, what is the cyclical part of real GDP?';
    const explanation =
      'The cyclical part of real GDP is: Real GDP − Trend real GDP.';
    const contextAvailable = { hasIndexedChunks: true, hasPdfCapture: false } as const;
    const matched = [
      'Question 1. What is the cyclical part of real GDP?',
      'The cyclical part of real GDP is real GDP less trend real GDP.',
      '(a) government spending',
      '(b) real GDP less trend real GDP',
      '(c) nominal GDP',
      'Question 2. What is fiscal policy?',
      '(a) taxes',
      '(b) government spending',
      '(c) interest rates',
    ].join('\n');
    const base = {
      question,
      chunks: [{ citationIndex: 1, text: matched }],
      captureText: '',
      contextAvailable,
    };

    const correct = applyClaimLevelGrounding({
      ...base,
      answerText: `${explanation} So the correct answer is (b).`,
    });
    expect(correct.text).toContain(explanation);
    expect(correct.text).toContain('So the correct answer is (b).');
    expect(correct.text).not.toContain('unsupported part');
    expect(correct.text).not.toContain(SOURCE_ONLY_INTERPRETATION_NOTICE);
    expect(correct.knowledgeTier).toBe('course_material');

    const worded = applyClaimLevelGrounding({
      ...base,
      answerText: `${explanation} The answer is B.`,
    });
    expect(worded.text).toContain('The answer is B.');
    expect(worded.knowledgeTier).toBe('course_material');

    const optionPhrase = applyClaimLevelGrounding({
      ...base,
      answerText: `${explanation} Option (b) is correct.`,
    });
    expect(optionPhrase.text).toContain('Option (b) is correct.');
    expect(optionPhrase.knowledgeTier).toBe('course_material');

    const wrongLetter = applyClaimLevelGrounding({
      ...base,
      answerText: `${explanation} So the correct answer is (c).`,
    });
    expect(wrongLetter.text).toContain(explanation);
    expect(wrongLetter.text).not.toContain('(c)');
    expect(wrongLetter.text).toContain(
      'The unsupported part cannot be established from the available source.',
    );
    expect(wrongLetter.knowledgeTier).toBe('mixed');

    const elsewhere = [
      'Question 1. What is the cyclical part of real GDP?',
      'The cyclical part of real GDP is real GDP less trend real GDP.',
      'Question 2. Which reading mentions part (b)?',
      '(a) the introduction',
      '(b) the appendix',
    ].join('\n');
    const otherQuestion = applyClaimLevelGrounding({
      ...base,
      chunks: [{ citationIndex: 1, text: elsewhere }],
      answerText: `${explanation} So the correct answer is (b).`,
    });
    expect(otherQuestion.text).toBe(explanation);
    expect(otherQuestion.text).not.toContain('(b)');
    expect(otherQuestion.text).not.toContain('unsupported part');
    expect(otherQuestion.knowledgeTier).toBe('course_material');

    const missingContext = applyClaimLevelGrounding({
      ...base,
      chunks: [{
        citationIndex: 1,
        text: 'The cyclical part of real GDP is real GDP less trend real GDP.',
      }],
      answerText: `${explanation} So the correct answer is (b).`,
    });
    expect(missingContext.text).toBe(explanation);
    expect(missingContext.knowledgeTier).toBe('course_material');
    expect(missingContext.text).not.toContain('unsupported');

    const unlabeled = applyClaimLevelGrounding({
      ...base,
      answerText: explanation,
    });
    expect(unlabeled.text).toBe(explanation);
    expect(unlabeled.knowledgeTier).toBe('course_material');

    const unrelated = applyClaimLevelGrounding({
      ...base,
      answerText: `${explanation} Hydrogen bonds stabilize the alpha helix.`,
    });
    expect(unrelated.text).toContain(explanation);
    expect(unrelated.text).not.toContain('Hydrogen bonds');
    expect(unrelated.text).toContain(
      'The unsupported part cannot be established from the available source.',
    );
    expect(unrelated.knowledgeTier).toBe('mixed');

    const letterOnly = applyClaimLevelGrounding({
      ...base,
      chunks: [{ citationIndex: 1, text: 'See part (b) of another document. The cyclical part of real GDP is real GDP less trend real GDP.' }],
      answerText: `${explanation} The answer is B.`,
    });
    expect(letterOnly.text).toBe(explanation);
    expect(letterOnly.knowledgeTier).toBe('course_material');
  });

  it('drops span-status sentences and an echoed unsupported notice when the academic claims are supported', () => {
    const question = 'According to the PDF, what is the cyclical part of real GDP?';
    const definition = 'The cyclical part of real GDP is: Real GDP − Trend real GDP.';
    const option = 'So the correct answer is (b) real GDP less trend real GDP.';
    const answer = `${definition} ${option}`;
    const notice = 'The unsupported part cannot be established from the available source.';
    const corpus = [
      'Question 1. What is the cyclical part of real GDP?',
      'The cyclical part of real GDP is real GDP less trend real GDP.',
      '(a) government spending',
      '(b) real GDP less trend real GDP',
      '(c) nominal GDP',
      'Question 2. What is fiscal policy?',
      '(b) government spending',
    ].join('\n');
    const base = {
      question,
      chunks: [{ citationIndex: 1, text: corpus }],
      captureText: '',
      contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false } as const,
    };

    const supported = applyClaimLevelGrounding({ ...base, answerText: answer });
    expect(supported.text).toContain(definition);
    expect(supported.text).toContain(option);
    expect(supported.text).not.toContain('unsupported part');
    expect(supported.knowledgeTier).toBe('course_material');

    const inSpan = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} The requested question is in the retrieved span.`,
    });
    expect(inSpan.text).toContain(definition);
    expect(inSpan.text).toContain(option);
    expect(inSpan.text).not.toContain('retrieved span');
    expect(inSpan.text).not.toContain('unsupported part');
    expect(inSpan.knowledgeTier).toBe('course_material');

    const appears = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} The question appears in the retrieved pages.`,
    });
    expect(appears.text).toContain(option);
    expect(appears.text).not.toContain('retrieved pages');
    expect(appears.knowledgeTier).toBe('course_material');

    const echoed = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} ${notice}`,
    });
    expect(echoed.text).toContain(definition);
    expect(echoed.text).toContain(option);
    expect(echoed.text).not.toContain('unsupported part');
    expect(echoed.knowledgeTier).toBe('course_material');

    const spanAndUnsupported = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} The requested question is in the retrieved span. Hydrogen bonds stabilize the alpha helix.`,
    });
    expect(spanAndUnsupported.text).toContain(definition);
    expect(spanAndUnsupported.text).not.toContain('retrieved span');
    expect(spanAndUnsupported.text).not.toContain('Hydrogen bonds');
    expect(spanAndUnsupported.text).toContain(notice);
    expect(spanAndUnsupported.knowledgeTier).toBe('mixed');

    const echoedWithRejection = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} Hydrogen bonds stabilize the alpha helix. ${notice}`,
    });
    expect(echoedWithRejection.text).toContain(option);
    expect(echoedWithRejection.text).not.toContain('Hydrogen bonds');
    expect(echoedWithRejection.text.match(/unsupported part cannot be established/g)).toEqual([
      'unsupported part cannot be established',
    ]);
    expect(echoedWithRejection.knowledgeTier).toBe('mixed');

    const wrongLetter = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} So the correct answer is (c). ${notice}`,
    });
    expect(wrongLetter.text).toContain(definition);
    expect(wrongLetter.text).not.toContain('(c)');
    expect(wrongLetter.text).toContain(notice);
    expect(wrongLetter.knowledgeTier).toBe('mixed');

    const changedNumber = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} The penalty is 50 marks.`,
    });
    expect(changedNumber.text).toContain(definition);
    expect(changedNumber.text).not.toContain('50');
    expect(changedNumber.text).toContain(notice);
    expect(changedNumber.knowledgeTier).toBe('mixed');

    const uncertainty = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} The source does not state a numerical value.`,
    });
    expect(uncertainty.text).toContain(definition);
    expect(uncertainty.text).toContain('does not state a numerical value');
    expect(uncertainty.text).not.toContain('unsupported part');
    expect(uncertainty.knowledgeTier).toBe('mixed');

    const absent = applyClaimLevelGrounding({
      ...base,
      answerText: `${answer} The requested question is not in the retrieved span.`,
    });
    expect(absent.text).toContain(definition);
    expect(absent.text.toLowerCase()).toContain('not in the retrieved span');
    expect(absent.knowledgeTier).toBe('mixed');

    const embedded = applyClaimLevelGrounding({
      ...base,
      answerText:
        'The requested question is in the retrieved span and the cyclical part of real GDP is real GDP less trend real GDP.',
    });
    expect(embedded.text.toLowerCase()).toContain('retrieved span');

    const otherDocument = applyClaimLevelGrounding({
      ...base,
      chunks: [{
        citationIndex: 1,
        text: [
          'Question 1. What is the cyclical part of real GDP?',
          'The cyclical part of real GDP is real GDP less trend real GDP.',
          'Question 2. Which reading mentions part (b)?',
          '(b) the appendix',
        ].join('\n'),
      }],
      answerText: `${definition} So the correct answer is (b). The requested question is in the retrieved span.`,
    });
    expect(otherDocument.text).toBe(definition);
    expect(otherDocument.text).not.toContain('(b)');
    expect(otherDocument.text).not.toContain('unsupported part');
    expect(otherDocument.knowledgeTier).toBe('course_material');

    const missing = applyClaimLevelGrounding({
      question,
      answerText: `${answer} ${notice}`,
      chunks: [],
      captureText: '',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: false },
    });
    expect(missing.text).toContain('No PDF selection or course material was available');
    expect(missing.text).not.toContain('Real GDP');
    expect(missing.knowledgeTier).toBe('mixed');
  });

  it('keeps a supported answer when one page contains several choice sets', () => {
    const question = 'According to the PDF, what is the cyclical part of real GDP?';
    const definition = 'The cyclical part of real GDP is real GDP less trend real GDP.';
    const notice = 'The unsupported part cannot be established from the available source.';
    const corpus = [
      'The cyclical part of real GDP is real GDP less trend real GDP.',
      '(a) trend real GDP less measured output',
      '(b) real GDP less trend real GDP',
      '(c) nominal GDP plus trend real GDP',
      '(d) trend real GDP without a residual',
      'A later question asks about fiscal policy.',
      '(a) taxes on wages',
      '(b) government spending',
      '(c) the interest rate',
      '(d) the exchange rate',
    ].join('\n');
    const base = {
      question,
      chunks: [{ citationIndex: 1, text: corpus }],
      captureText: '',
      contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false } as const,
    };

    const exact = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} The correct option is (b).`,
    });
    expect(exact.text).toContain(definition);
    expect(exact.text).toContain('The correct option is (b).');
    expect(exact.text).not.toContain(notice);
    expect(exact.knowledgeTier).toBe('course_material');

    const equivalent = applyClaimLevelGrounding({
      ...base,
      answerText: 'The cyclical part of real GDP is real GDP minus trend real GDP.',
    });
    expect(equivalent.text).toContain('minus trend real GDP');
    expect(equivalent.text).not.toContain(notice);
    expect(equivalent.knowledgeTier).toBe('course_material');

    const symbolic = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} \\( y - \\bar{y} \\).`,
    });
    expect(symbolic.text).toContain(definition);
    expect(symbolic.text).not.toContain(notice);
    expect(symbolic.knowledgeTier).toBe('course_material');

    const labeled = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} So the correct answer is (b).`,
    });
    expect(labeled.text).toContain('So the correct answer is (b).');
    expect(labeled.text).not.toContain(notice);
    expect(labeled.knowledgeTier).toBe('course_material');

    const narrated = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} Relevant passages were retrieved from this PDF. This is not limited to the visible page.`,
    });
    expect(narrated.text).toContain(definition);
    expect(narrated.text).not.toContain('Relevant passages');
    expect(narrated.text).not.toContain('visible page');
    expect(narrated.text).not.toContain(notice);
    expect(narrated.knowledgeTier).toBe('course_material');

    const afterNotice = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} ${notice} The correct option is (b).`,
    });
    expect(afterNotice.text).toContain(definition);
    expect(afterNotice.text).toContain('The correct option is (b).');
    expect(afterNotice.text).not.toContain(notice);
    expect(afterNotice.knowledgeTier).toBe('course_material');

    const wrongLetter = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} The correct option is (c).`,
    });
    expect(wrongLetter.text).toContain(definition);
    expect(wrongLetter.text).not.toContain('(c)');
    expect(wrongLetter.text).toContain(notice);
    expect(wrongLetter.knowledgeTier).toBe('mixed');

    const wrongNumber = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} The penalty is 50 marks.`,
    });
    expect(wrongNumber.text).toContain(definition);
    expect(wrongNumber.text).not.toContain('50');
    expect(wrongNumber.text).toContain(notice);
    expect(wrongNumber.knowledgeTier).toBe('mixed');

    const extra = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} Hydrogen bonds stabilize the alpha helix.`,
    });
    expect(extra.text).toContain(definition);
    expect(extra.text).not.toContain('Hydrogen bonds');
    expect(extra.text).toContain(notice);
    expect(extra.knowledgeTier).toBe('mixed');

    const wrongSymbol = applyClaimLevelGrounding({
      ...base,
      answerText: `${definition} \\( y = 99 \\).`,
    });
    expect(wrongSymbol.text).toContain(definition);
    expect(wrongSymbol.text).not.toContain('99');
    expect(wrongSymbol.text).toContain(notice);

    const ordinary = applyClaimLevelGrounding({
      question: 'What is the cyclical part of real GDP?',
      answerText: definition,
      chunks: base.chunks,
      captureText: '',
      contextAvailable: base.contextAvailable,
    });
    expect(ordinary.text).toBe(definition);
    expect(ordinary.text).not.toContain(notice);
    expect(ordinary.knowledgeTier).toBe('course_material');

    const empty = applyClaimLevelGrounding({
      question,
      answerText: `${definition} The correct option is (b).`,
      chunks: [],
      captureText: '',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: false },
    });
    expect(empty.text).toContain('No PDF selection or course material was available');
    expect(empty.text).not.toContain('real GDP less trend');
    expect(empty.knowledgeTier).toBe('mixed');
  });

  it('grounds an incomplete nonempty answer once and keeps the incomplete flag', async () => {
    const quoted = 'Saving adds to the capital stock.';
    let calls = 0;
    const out = await runAskCoursePipeline({
      authUserId: VALID_USER_ID,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: VALID_SECTION_ID,
        question: 'Explain the model step by step.',
        teachingMode: 'explain',
      },
      deps: buildMockDeps({
        searchKnowledge: async () => ({
          ok: true as const,
          raw: [
            {
              source_kind: 'free_space_pdf',
              source_object_id: VALID_PDF_ID,
              file_name: 'Growth.pdf',
              page_number: 3,
              chunk_index: 0,
              text: quoted,
              similarity: 0.9,
            },
          ],
        }),
        generationProvider: {
          complete: async () => {
            calls += 1;
            return {
              ok: true as const,
              text: `${quoted} [1]\n\nThe exam is on 12 May.`,
              rawModel: 'test-model',
              latencyMs: 5,
              generationIncomplete: true,
            };
          },
        },
      }),
    });
    expect(calls).toBe(1);
    expect(out.response.ok).toBe(true);
    if (!out.response.ok || out.response.result.type !== 'ask_course') return;
    expect(out.response.result.generationIncomplete).toBe(true);
    expect(out.response.result.text).toContain(quoted);
    expect(out.response.result.text).toContain('[1]');
    expect(out.response.result.text).not.toContain('12 May');
    expect(out.response.result.knowledgeTier).toBe('course_material');
    expect(out.response.result.sources).toHaveLength(1);
  });
});
