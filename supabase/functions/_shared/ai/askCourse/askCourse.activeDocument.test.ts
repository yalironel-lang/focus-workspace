/**
 * @vitest-environment node
 * M2.5a — active document identity is authorized and is not retrieval.
 */
import { describe, expect, it } from 'vitest';
import { validateZikukAiRequest } from '../validateRequest.ts';
import { runAskCoursePipeline, type AskCourseDeps } from './runAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import type { AiProvider } from '../providerTypes.ts';

const SECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = 'user-1';
const PDF = 'pdf-problem-set-4';

function ownedPdf(pageCount = 30) {
  return {
    id: PDF,
    user_id: USER,
    section_id: SECTION,
    object: { type: 'pdf', content: { type: 'pdf', pageCount } },
  };
}

function deps(overrides?: Partial<AskCourseDeps>): AskCourseDeps & { searchCalls: unknown[]; beginCalls: number } {
  const searchCalls: unknown[] = [];
  let beginCalls = 0;
  const enforcement = createMemoryEnforcementStore({ plan: 'pro', dailyLimit: 100 });
  const originalBegin = enforcement.beginRequest.bind(enforcement);
  enforcement.beginRequest = async (...args) => {
    beginCalls += 1;
    return originalBegin(...args);
  };
  const provider: AiProvider = {
    complete: async () => ({
      ok: true,
      text: 'General explanation.',
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      rawModel: 'test-model',
      latencyMs: 1,
    }),
  };
  const base: AskCourseDeps = {
    loadSectionOwner: async () => ({ userId: USER }),
    loadPdfCaptureSource: async (input) => {
      if (input.userId === USER && input.sectionId === SECTION && input.sourceObjectId === PDF) {
        return ownedPdf();
      }
      return null;
    },
    embeddingProvider: createFakeEmbeddingProvider({ kind: 'ok' }),
    searchKnowledge: async (input) => {
      searchCalls.push(input);
      return { ok: true, raw: [] };
    },
    loadNotebookFsoForCitation: async () => null,
    generationProvider: provider,
    routerConfig: { model: 'test-model' },
    enforcement,
    ...overrides,
  };
  return {
    ...base,
    searchCalls,
    get beginCalls() {
      return beginCalls;
    },
  };
}

describe('active document contract', () => {
  it('accepts v2 with identity and rejects a client title', () => {
    const ok = validateZikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION,
      question: 'Teach me this PDF.',
      teachingMode: 'teach_me',
      activeDocument: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: PDF,
        pageNumber: 4,
      },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok && ok.request.capability === 'ask_course' && ok.request.version === 2) {
      expect(ok.request.activeDocument).toEqual({
        sourceKind: 'free_space_pdf',
        sourceObjectId: PDF,
        pageNumber: 4,
      });
    }

    const titled = validateZikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION,
      question: 'Teach me this PDF.',
      activeDocument: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: PDF,
        pageNumber: 4,
        fileName: 'Problem Set 4 Solutions.pdf',
      },
    });
    expect(titled.ok).toBe(false);
    if (!titled.ok) expect(titled.code).toBe('invalid_request');
  });

  it('keeps Ask ZIKUK v2 valid without an active document', () => {
    const res = validateZikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION,
      question: 'What is monetary policy?',
      teachingMode: 'explain',
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.request.capability === 'ask_course' && res.request.version === 2) {
      expect(res.request.activeDocument).toBeUndefined();
    }
  });

  it('keeps a capture and the open page as separate fields', () => {
    const res = validateZikukAiRequest({
      version: 3,
      capability: 'ask_course',
      sectionId: SECTION,
      question: 'Explain this selection.',
      capture: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: PDF,
        sectionId: SECTION,
        pageNumber: 2,
        text: 'Question 2. Solve for equilibrium.',
      },
      activeDocument: {
        sourceKind: 'free_space_pdf',
        sourceObjectId: PDF,
        pageNumber: 8,
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.request.capability === 'ask_course' && res.request.version === 3) {
      expect(res.request.capture.pageNumber).toBe(2);
      expect(res.request.capture.text).toContain('Question 2');
      expect(res.request.activeDocument?.pageNumber).toBe(8);
    }
  });

  it('rejects another user PDF and a page past the document', async () => {
    const foreign = deps();
    const denied = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Teach me this PDF.',
        activeDocument: { sourceKind: 'free_space_pdf', sourceObjectId: 'someone-elses-pdf', pageNumber: 1 },
      },
      deps: foreign,
    });
    expect(denied.response.ok).toBe(false);
    if (!denied.response.ok) {
      expect(denied.response.error.code).toBe('not_found');
      expect(denied.response.error.message).toBe('That PDF is not available in this course.');
    }
    expect(foreign.beginCalls).toBe(0);
    expect(foreign.searchCalls).toHaveLength(0);

    const pastEnd = deps();
    const overflow = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Teach me this PDF.',
        activeDocument: { sourceKind: 'free_space_pdf', sourceObjectId: PDF, pageNumber: 99 },
      },
      deps: pastEnd,
    });
    expect(overflow.response.ok).toBe(false);
    expect(pastEnd.searchCalls).toHaveLength(0);
  });

  it('does not section-search a document walk when the window loader is absent', async () => {
    const harness = deps();
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Teach me this PDF question by question.',
        teachingMode: 'teach_me',
        activeDocument: { sourceKind: 'free_space_pdf', sourceObjectId: PDF, pageNumber: 4 },
      },
      deps: harness,
    });
    expect(result.response.ok).toBe(true);
    expect(harness.searchCalls).toHaveLength(0);
    const embedder = harness.embeddingProvider as { calls: { inputs: string[] }[] };
    expect(embedder.calls).toHaveLength(0);
    if (result.response.ok && result.response.result.type === 'ask_course') {
      expect(result.response.result.documentWindow).toBeUndefined();
    }
  });
});
