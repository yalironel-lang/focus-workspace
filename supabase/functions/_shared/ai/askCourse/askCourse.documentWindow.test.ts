/**
 * @vitest-environment node
 * M2.5b — grounded teaching from the open PDF.
 */
import { describe, expect, it } from 'vitest';
import { validateZikukAiRequest } from '../validateRequest.ts';
import { runAskCoursePipeline, type AskCourseDeps, type LoadDocumentWindow } from './runAskCourse.ts';
import { createFakeEmbeddingProvider } from '../knowledge/fakeEmbeddingProvider.ts';
import { createMemoryEnforcementStore } from '../enforcement.ts';
import type { AiProvider } from '../providerTypes.ts';
import type { ChatMessage } from '../promptExplainSelection.ts';
import type { DocumentWindowChunk } from './documentWindow.ts';

const SECTION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = 'user-1';
const PDF = 'pdf-problem-set-4';

function ownedPdf() {
  return {
    id: PDF,
    user_id: USER,
    section_id: SECTION,
    object: { type: 'pdf', content: { type: 'pdf', pageCount: 30 } },
  };
}

function row(page: number, text: string, index = 0): DocumentWindowChunk {
  return {
    sourceObjectId: PDF,
    fileName: 'Problem Set 4 Solutions.pdf',
    pageCount: 30,
    pageNumber: page,
    chunkIndex: index,
    text,
  };
}

function harness(loader?: LoadDocumentWindow) {
  const searchCalls: unknown[] = [];
  const windowCalls: unknown[] = [];
  const messages: ChatMessage[][] = [];
  const enforcement = createMemoryEnforcementStore({ plan: 'pro', dailyLimit: 100 });
  const provider: AiProvider = {
    complete: async (input) => {
      messages.push(input.messages);
      return {
        ok: true,
        text: 'Question 1 asks for the equilibrium. Start from the given equation.',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        rawModel: 'test-model',
        latencyMs: 1,
      };
    },
  };
  const deps: AskCourseDeps = {
    loadSectionOwner: async () => ({ userId: USER }),
    loadPdfCaptureSource: async () => ownedPdf(),
    enforcement,
    embeddingProvider: createFakeEmbeddingProvider({ kind: 'ok' }),
    generationProvider: provider,
    routerConfig: { model: 'test-model' },
    searchKnowledge: async (input) => {
      searchCalls.push(input);
      return {
        ok: true,
        raw: [
          {
            source_id: 'src',
            source_kind: 'free_space_pdf',
            source_object_id: 'other-pdf',
            notebook_object_id: null,
            file_name: 'Lecture.pdf',
            page_number: 2,
            chunk_index: 0,
            text: 'Monetary policy changes the interest rate.',
            similarity: 0.9,
          },
        ],
      };
    },
    loadDocumentWindow: loader
      ? async (input) => {
          windowCalls.push(input);
          return loader(input);
        }
      : undefined,
  };
  return { deps, searchCalls, windowCalls, messages };
}

const active = { sourceKind: 'free_space_pdf' as const, sourceObjectId: PDF, pageNumber: 6 };

describe('ask_course document window', () => {
  it('grounds a walkthrough in the start of the open PDF', async () => {
    const { deps, searchCalls, windowCalls, messages } = harness(async () => ({
      ok: true,
      rows: [row(1, 'Question 1. Find the equilibrium price.'), row(2, 'Question 2. Compute surplus.')],
    }));
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Teach me this PDF question by question',
        teachingMode: 'teach_me',
        activeDocument: active,
        documentCursor: { sourceObjectId: PDF, resumeFromPage: 20 },
      },
      deps,
    });
    expect(searchCalls).toHaveLength(0);
    expect(windowCalls[0]).toMatchObject({ userId: USER, sectionId: SECTION, sourceObjectId: PDF, pageFrom: 1 });
    expect(result.response.ok).toBe(true);
    if (!result.response.ok || result.response.result.type !== 'ask_course') throw new Error('expected answer');
    expect(result.response.result.documentWindow).toMatchObject({
      fileName: 'Problem Set 4 Solutions.pdf',
      pageCount: 30,
      fromPage: 1,
      toPage: 2,
      resumeFromPage: 2,
    });
    expect(result.response.result.sources.map((source) => source.pageNumber)).toEqual([1, 2]);
    const prompt = messages[0]?.map((message) => message.content).join('\n') ?? '';
    expect(prompt).toContain('Problem Set 4 Solutions.pdf');
    expect(prompt).toContain('retrieved pages: 1–2 of 30');
    expect(prompt).toContain('visible page: 6');
    expect(prompt).toContain('not a reading of the entire PDF');
    expect(prompt).toContain('Never ask the student to upload');
    expect(prompt).not.toContain('resumeFromPage');
  });

  it('retrieves page 3 for the visible-page QA sentence', async () => {
    const { deps, searchCalls, windowCalls, messages } = harness(async () => ({
      ok: true,
      rows: [row(3, 'x'.repeat(1940)), row(4, 'Question on the next page.')],
    }));
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question:
          'Explain the first question on my currently visible PDF page. Tell me which page you are using.',
        teachingMode: 'explain',
        activeDocument: { ...active, pageNumber: 3 },
      },
      deps,
    });
    expect(searchCalls).toHaveLength(0);
    expect(windowCalls[0]).toMatchObject({ pageFrom: 3, pageTo: 4 });
    if (!result.response.ok || result.response.result.type !== 'ask_course') throw new Error('expected answer');
    expect(result.response.result.sources.map((source) => source.pageNumber)).toEqual([3]);
    const prompt = messages[0]?.map((message) => message.content).join('\n') ?? '';
    expect(prompt).toContain('retrieved pages: 3 of 30');
    expect(prompt).toContain('Page content was retrieved');
    expect(prompt).not.toContain('Say that the indexed text for the requested pages is missing');
  });

  it('prioritizes the visible page', async () => {
    const { deps, windowCalls, messages } = harness(async () => ({
      ok: true,
      rows: [row(6, 'x'.repeat(900)), row(7, 'Question on the next page.')],
    }));
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Explain question 2 on this page',
        teachingMode: 'explain',
        activeDocument: active,
      },
      deps,
    });
    expect(windowCalls[0]).toMatchObject({ pageFrom: 6, pageTo: 7 });
    if (!result.response.ok || result.response.result.type !== 'ask_course') throw new Error('expected answer');
    expect(result.response.result.sources.map((source) => source.pageNumber)).toEqual([6]);
    expect(messages[0]?.map((message) => message.content).join('\n')).toContain('retrieved pages: 6 of 30');
  });

  it('advances from the stored window, not from a cited page', async () => {
    const { deps, windowCalls } = harness(async (input) => ({
      ok: true,
      rows: [row(input.pageFrom, 'Question 3 continues here.')],
    }));
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Next question',
        teachingMode: 'teach_me',
        activeDocument: active,
        documentCursor: { sourceObjectId: PDF, resumeFromPage: 3 },
      },
      deps,
    });
    expect(windowCalls[0]).toMatchObject({ pageFrom: 3 });
    if (!result.response.ok || result.response.result.type !== 'ask_course') throw new Error('expected answer');
    expect(result.response.result.sources[0]?.pageNumber).toBe(3);
    expect(result.response.result.documentWindow?.resumeFromPage).toBe(4);
  });

  it('starts again at page 1 when next is asked without a cursor', async () => {
    const { deps, windowCalls } = harness(async () => ({ ok: true, rows: [row(1, 'Question 1.')] }));
    await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Next question',
        teachingMode: 'teach_me',
        activeDocument: active,
      },
      deps,
    });
    expect(windowCalls[0]).toMatchObject({ pageFrom: 1 });
  });

  it('explains missing text instead of searching the section', async () => {
    const { deps, searchCalls, messages } = harness(async () => ({ ok: true, rows: [] }));
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Teach me this PDF question by question',
        teachingMode: 'teach_me',
        activeDocument: active,
      },
      deps,
    });
    expect(searchCalls).toHaveLength(0);
    expect(result.response.ok).toBe(true);
    const prompt = messages[0]?.map((message) => message.content).join('\n') ?? '';
    expect(prompt).toContain('no readable indexed text');
    expect(prompt).toContain('Say that the indexed text for the requested pages is missing');
    expect(prompt).toContain('Do not invent');
  });

  it('rejects another user PDF before the window is read', async () => {
    const calls: unknown[] = [];
    const { deps } = harness(async (input) => {
      calls.push(input);
      return { ok: true, rows: [row(1, 'secret')] };
    });
    deps.loadPdfCaptureSource = async () => ({ ...ownedPdf(), user_id: 'someone-else' });
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Teach me this PDF question by question',
        teachingMode: 'teach_me',
        activeDocument: active,
      },
      deps,
    });
    expect(result.response.ok).toBe(false);
    if (result.response.ok) throw new Error('expected rejection');
    expect(result.response.error.code).toBe('not_found');
    expect(calls).toHaveLength(0);
  });

  it('keeps capture text beside the page window', async () => {
    const { deps, messages } = harness(async () => ({
      ok: true,
      rows: [row(2, 'Indexed question 2 on the visible page.')],
    }));
    await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 3,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Explain question 2 on this page',
        teachingMode: 'explain',
        activeDocument: { ...active, pageNumber: 2 },
        capture: {
          sourceKind: 'free_space_pdf',
          sourceObjectId: PDF,
          sectionId: SECTION,
          pageNumber: 2,
          text: 'Captured sentence from question 2.',
        },
      },
      deps,
    });
    const prompt = messages[0]?.map((message) => message.content).join('\n') ?? '';
    expect(prompt).toContain('Captured sentence from question 2.');
    expect(prompt).toContain('Indexed question 2 on the visible page.');
  });

  it('keeps section-wide retrieval for a general question', async () => {
    const { deps, searchCalls, windowCalls, messages } = harness(async () => ({
      ok: true,
      rows: [row(6, 'cover text', 0)],
    }));
    await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'What is monetary policy?',
        teachingMode: 'explain',
        activeDocument: active,
      },
      deps,
    });
    expect(searchCalls).toHaveLength(1);
    expect(windowCalls[0]).toMatchObject({ pageFrom: 6, limit: 1 });
    const prompt = messages[0]?.map((message) => message.content).join('\n') ?? '';
    expect(prompt).toContain('section-wide course retrieval');
    expect(prompt).toContain('Page content was not requested');
    expect(prompt).toContain('Monetary policy changes the interest rate.');
    expect(prompt).not.toContain('retrieved pages:');
    expect(prompt).not.toContain('Say that the indexed text for the requested pages is missing');
  });

  it('accepts an older Tutor request with no document fields', () => {
    const parsed = validateZikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION,
      question: 'What is inflation?',
      teachingMode: 'explain',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.request.capability !== 'ask_course' || parsed.request.version === 1) return;
    expect(parsed.request.activeDocument).toBeUndefined();
    expect(parsed.request.documentCursor).toBeUndefined();
  });

  it('rejects a cursor that tries to name a page outside the contract', () => {
    const parsed = validateZikukAiRequest({
      version: 2,
      capability: 'ask_course',
      sectionId: SECTION,
      question: 'Next question',
      documentCursor: { sourceObjectId: PDF, resumeFromPage: 0, fileName: 'forged.pdf' },
    });
    expect(parsed.ok).toBe(false);
  });

  it('enforces the retrieval character budget', async () => {
    const { deps } = harness(async () => ({
      ok: true,
      rows: [row(1, 'a'.repeat(3000)), row(1, 'b'.repeat(3000), 1), row(2, 'c'.repeat(3000))],
    }));
    const result = await runAskCoursePipeline({
      authUserId: USER,
      request: {
        version: 2,
        capability: 'ask_course',
        sectionId: SECTION,
        question: 'Teach me this document',
        teachingMode: 'teach_me',
        activeDocument: active,
      },
      deps,
    });
    if (!result.response.ok || result.response.result.type !== 'ask_course') throw new Error('expected answer');
    expect(result.response.result.documentWindow).toMatchObject({
      fromPage: 1,
      toPage: 1,
      resumeFromPage: 1,
      partial: true,
    });
    expect(result.response.result.sources).toHaveLength(1);
  });
});
