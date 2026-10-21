/**
 * @vitest-environment node
 * One claim-evidence decision. A strong badge requires every substantive
 * claim to be supported. A quoted span does not cover a new claim.
 */
import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_EXPLANATION_NOTICE,
  applyClaimLevelGrounding,
  OPTION_REPEAT_NOTICE,
} from './evaluateGroundingProvenance.ts';

const QUOTATION = 'Consideration requires a bargained-for exchange.';
const COMMA_SOURCE = 'Offer, acceptance, and consideration form a contract.';
const OFFER = 'An offer is a manifestation of willingness to enter a bargain.';
const PARAPHRASE_SOURCE =
  'Under the doctrine of promissory estoppel, a promise without consideration is enforceable if there is reasonable, foreseeable detrimental reliance.';
const PARAPHRASE =
  'Under the doctrine of promissory estoppel, detrimental reliance may substitute for consideration if the promisor reasonably foresaw the reliance.';

function judge(input: {
  question: string;
  answerText: string;
  chunk?: string;
  capture?: string;
}) {
  return applyClaimLevelGrounding({
    question: input.question,
    answerText: input.answerText,
    chunks: input.chunk ? [{ citationIndex: 1, text: input.chunk }] : [],
    captureText: input.capture ?? '',
    contextAvailable: {
      hasIndexedChunks: Boolean(input.chunk),
      hasPdfCapture: Boolean(input.capture),
    },
  });
}

describe('G2.26 shared claim-evidence decision', () => {
  it('withholds selected-text attribution when the same sentence adds a claim', () => {
    const answer = `${QUOTATION.replace(/\.$/, '')}, and sticky wages explain the remaining adjustment. [PDF selection]`;
    const result = judge({
      question: 'What does this paragraph say about consideration?',
      answerText: answer,
      capture: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('sticky wages');
    expect(result.text).toContain('[PDF selection]');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('withholds source-only attribution when a quotation adds a claim', () => {
    const answer = `${QUOTATION.replace(/\.$/, '')}, and sticky wages explain the remaining adjustment.`;
    const result = judge({
      question: 'According to the PDF, what does consideration require?',
      answerText: answer,
      chunk: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain(QUOTATION.replace(/\.$/, ''));
    expect(result.text).toContain('sticky wages');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('withholds course material when a new clause reuses a source stem', () => {
    const answer = `${QUOTATION.replace(/\.$/, '')}, and sticky wages explain this exchange.`;
    const result = judge({
      question: 'What does consideration require?',
      answerText: answer,
      chunk: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('sticky wages');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('withholds course material when an addition has no comma or conjunction', () => {
    const answer = 'Consideration requires a bargained-for exchange through sticky wage adjustment.';
    const result = judge({
      question: 'What does consideration require?',
      answerText: answer,
      chunk: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('sticky wage adjustment');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('keeps a fully supported multi-sentence answer', () => {
    const source = `${QUOTATION} ${OFFER}`;
    const answer = [`### Formation`, '', QUOTATION, '', OFFER].join('\n');
    const result = judge({
      question: 'What does consideration require?',
      answerText: answer,
      chunk: source,
    });
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toBe(answer);
  });

  it('keeps a fully supported sentence that contains commas', () => {
    const result = judge({
      question: 'What forms a contract?',
      answerText: COMMA_SOURCE,
      chunk: COMMA_SOURCE,
    });
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toBe(COMMA_SOURCE);
  });

  it('keeps a faithful paraphrase of the selected text', () => {
    const result = judge({
      question: 'What does this paragraph say about promissory estoppel?',
      answerText: PARAPHRASE,
      capture: PARAPHRASE_SOURCE,
    });
    expect(result.knowledgeTier).toBe('pdf_selection');
    expect(result.text).toBe(PARAPHRASE);
  });

  it('keeps a quoted negative and withholds a reversed relation', () => {
    const source = 'The derivative of x squared is -2x.';
    const asked = 'What is the derivative of x squared?';
    const same = judge({
      question: asked,
      answerText: 'The derivative of x squared is negative 2x.',
      chunk: source,
    });
    expect(same.knowledgeTier).toBe('course_material');
    expect(same.text).toContain('negative 2x');

    const flipped = judge({ question: asked, answerText: 'The derivative of x squared is 2x.', chunk: source });
    expect(flipped.knowledgeTier).not.toBe('course_material');

    const reversed = judge({
      question: 'According to the PDF, what is the derivative of x squared?',
      answerText: 'The derivative of x squared is 2x.',
      chunk: source,
    });
    expect(reversed.text).not.toContain('is 2x.');
  });

  it('withholds course material from an unkeyed choice formula', () => {
    const choices =
      'The cyclical part of real GDP is ... (a) trend real GDP less real GDP. (b) real GDP less trend real GDP.';
    const formula = '\\text{real GDP} - \\text{trend real GDP}.';
    const result = judge({
      question: 'What is the cyclical part of real GDP?',
      answerText: formula,
      chunk: choices,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain(OPTION_REPEAT_NOTICE);
  });

  it('keeps an explicit source-keyed relation and drops the reversed one', () => {
    const keyed =
      'The correct answer is (b). The cyclical part of real GDP is real GDP less trend real GDP. (a) trend real GDP less real GDP. (b) real GDP less trend real GDP.';
    const stated = 'The cyclical part of real GDP is real GDP less trend real GDP.';
    const ordinary = judge({
      question: 'What is the cyclical part of real GDP?',
      answerText: stated,
      chunk: keyed,
    });
    expect(ordinary.knowledgeTier).toBe('course_material');
    expect(ordinary.text).toBe(stated);

    const reversed = judge({
      question: 'According to the PDF, what is the cyclical part of real GDP?',
      answerText: 'The cyclical part of real GDP is trend real GDP less real GDP.',
      chunk: keyed,
    });
    expect(reversed.knowledgeTier).not.toBe('course_material');
    expect(reversed.text).not.toContain('trend real GDP less real GDP');
  });

  it('keeps a citation when every selected sentence is in the selection', () => {
    const capture = `${QUOTATION} ${OFFER}`;
    const answer = `${QUOTATION} [PDF selection] ${OFFER}`;
    const result = judge({
      question: 'What does this paragraph say about formation?',
      answerText: answer,
      capture,
    });
    expect(result.knowledgeTier).toBe('pdf_selection');
    expect(result.text).toContain('[PDF selection]');
    expect(result.text).toContain(OFFER);
  });

  it('keeps a quotation beside a derived explanation and distinguishes it', () => {
    const answer = `${QUOTATION} [1] Sticky wages explain the remaining adjustment.`;
    const result = judge({
      question: 'What does consideration require?',
      answerText: answer,
      chunk: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('[1]');
    expect(result.text).toContain('Sticky wages');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('does not treat a heading or a transition as an unsupported claim', () => {
    const answer = `${QUOTATION}\n\nIn other words:\n\n### Illustration`;
    const result = judge({
      question: 'What does consideration require?',
      answerText: answer,
      chunk: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toContain('In other words:');
    expect(result.text).toContain('### Illustration');
    expect(result.text).not.toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });
});
