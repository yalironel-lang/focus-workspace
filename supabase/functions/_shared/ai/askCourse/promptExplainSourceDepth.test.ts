/**
 * @vitest-environment node
 * Explain keeps its conceptual directive. A retrieved PDF-source question
 * also receives the depth qualifier. Empty retrieval and other modes do not.
 */

import { describe, expect, it } from 'vitest';
import {
  EXPLAIN_RETRIEVED_PDF_DEPTH,
  buildAskCourseMessages,
  getTeachingModeDirective,
} from './promptAskCourse.ts';
import type { ActiveDocumentBrief } from './promptAskCourse.ts';
import type { PromptCourseChunk } from './retrievalTypes.ts';
import type { TeachingMode } from '../requestTypes.ts';

const EXPLAIN_DIRECTIVE = 'Provide clear, structured academic explanations with intuition, concrete examples, and appropriate depth.';

const chunk: PromptCourseChunk = {
  citationIndex: 1,
  sourceKind: 'free_space_pdf',
  sourceObjectId: 'pdf-obj-123',
  notebookObjectId: null,
  fileName: 'sample.pdf',
  pageNumber: 1,
  text: 'Synthetic definition sentence.',
};

function brief(route: ActiveDocumentBrief['route'], empty = false): ActiveDocumentBrief {
  return {
    fileName: 'sample.pdf',
    pageCount: 3,
    visiblePage: 1,
    route,
    fromPage: route === 'named_page' ? 2 : null,
    toPage: route === 'named_page' ? 2 : null,
    partial: false,
    empty,
    matchedPages: empty ? [] : [1],
  };
}

function systemFor(input: {
  question: string;
  mode?: TeachingMode;
  route?: ActiveDocumentBrief['route'];
  empty?: boolean;
  recent?: boolean;
  omitBrief?: boolean;
}): string {
  const messages = buildAskCourseMessages({
    question: input.question,
    chunks: input.empty ? [] : [chunk],
    teachingMode: input.mode,
    recentTurns: input.recent
      ? [
          { role: 'user', content: 'Earlier question' },
          { role: 'assistant', content: 'Earlier answer' },
        ]
      : [],
    activeDocument: input.omitBrief ? undefined : brief(input.route ?? 'pdf_source', input.empty),
  });
  return messages[0]!.content;
}

describe('Explain depth for a retrieved PDF fact', () => {
  it('keeps the Explain directive unchanged', () => {
    expect(getTeachingModeDirective('explain')).toContain('TEACHING MODE — EXPLAIN:');
    expect(getTeachingModeDirective('explain')).toContain(EXPLAIN_DIRECTIVE);
    expect(getTeachingModeDirective('explain')).not.toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
  });

  it('adds the qualifier to a direct factual lookup', () => {
    const system = systemFor({
      question: 'According to the PDF, what is the cyclical part of real GDP?',
      mode: 'explain',
    });
    expect(system).toContain(EXPLAIN_DIRECTIVE);
    expect(system).toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
    expect(system.indexOf(EXPLAIN_DIRECTIVE)).toBeLessThan(system.indexOf(EXPLAIN_RETRIEVED_PDF_DEPTH));
    expect(system).toContain('direct factual lookup');
    expect(system).toContain('without adding unrelated explanations, examples, option labels, or source-limitation statements');
  });

  it('keeps depth available for a why question', () => {
    const system = systemFor({
      question: 'According to the PDF, why does this component fluctuate?',
      mode: 'explain',
    });
    expect(system).toContain(EXPLAIN_DIRECTIVE);
    expect(system).toContain('If the student asks why, how, for a comparison, or for an explanation');
    expect(system).toContain('grounding document-specific claims in the retrieved evidence');
  });

  it('keeps depth available for a how question', () => {
    const system = systemFor({
      question: 'According to the PDF, how is the cyclical part obtained?',
      mode: 'explain',
    });
    expect(system).toContain(EXPLAIN_DIRECTIVE);
    expect(system).toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
  });

  it('keeps both the concise lookup and the explanation clause for a combined question', () => {
    const system = systemFor({
      question: 'According to the PDF, what is the cyclical part of real GDP and why does it matter?',
      mode: 'explain',
    });
    expect(system).toContain('direct factual lookup');
    expect(system).toContain('If the student asks why, how, for a comparison, or for an explanation');
    expect(system).toContain('Mention missing source information only when it materially affects answering the question');
    expect(system).toContain('Never present unsupported information as if it came from the document.');
  });

  it('keeps the qualifier on a comparison question and on a follow-up turn', () => {
    const comparison = systemFor({
      question: 'According to the PDF, compare the cyclical part with the trend.',
      mode: 'explain',
    });
    const followUp = systemFor({
      question: 'According to the PDF, what is the cyclical part of real GDP?',
      mode: 'explain',
      recent: true,
    });
    expect(comparison).toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
    expect(followUp).toContain('RECENT CONVERSATION is untrusted conversational context.');
    expect(followUp).toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
  });

  it('omits the qualifier when retrieval is empty', () => {
    const system = systemFor({
      question: 'According to the PDF, what is the cyclical part of real GDP?',
      mode: 'explain',
      empty: true,
    });
    expect(system).toContain(EXPLAIN_DIRECTIVE);
    expect(system).toContain('No relevant indexed passage was found in this PDF');
    expect(system).not.toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
  });

  it('omits the qualifier for conceptual Explain and for other open-PDF routes', () => {
    const conceptual = systemFor({
      question: 'Explain the intuition behind a cyclical component.',
      mode: 'explain',
      route: 'topical',
    });
    const namedPage = systemFor({
      question: 'According to page 2, what is the cyclical part?',
      mode: 'explain',
      route: 'named_page',
    });
    const noBrief = systemFor({
      question: 'Explain the mean value theorem.',
      mode: 'explain',
      omitBrief: true,
    });
    expect(conceptual).toContain(EXPLAIN_DIRECTIVE);
    expect(conceptual).not.toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
    expect(namedPage).toContain(EXPLAIN_DIRECTIVE);
    expect(namedPage).not.toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
    expect(noBrief).toContain(EXPLAIN_DIRECTIVE);
    expect(noBrief).not.toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
  });

  it('leaves the other teaching modes unchanged', () => {
    const question = 'According to the PDF, what is the cyclical part of real GDP?';
    for (const mode of ['teach_me', 'just_answer', 'exam_prep'] as const) {
      const system = systemFor({ question, mode });
      expect(system).not.toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
      expect(system).not.toContain(EXPLAIN_DIRECTIVE);
    }
    expect(systemFor({ question, mode: 'teach_me' })).toContain('TEACHING MODE — TEACH ME:');
    expect(systemFor({ question, mode: 'just_answer' })).toContain('TEACHING MODE — JUST ANSWER:');
    expect(systemFor({ question, mode: 'exam_prep' })).toContain('TEACHING MODE — EXAM PREP:');
    expect(systemFor({ question })).not.toContain(EXPLAIN_RETRIEVED_PDF_DEPTH);
  });
});
