/**
 * @vitest-environment node
 * Strong attribution stays on supported wording. An extra clause or sentence
 * makes the answer mixed and leaves the wording in place.
 */
import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_EXPLANATION_NOTICE,
  applyClaimLevelGrounding,
} from './evaluateGroundingProvenance.ts';

const QUOTATION = 'Consideration requires a bargained-for exchange.';
const COMMA_SOURCE = 'Offer, acceptance, and consideration form a contract.';
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

describe('G2.24 strong attribution boundaries', () => {
  it('keeps a fully supported sentence that contains commas', () => {
    const result = judge({
      question: 'What forms a contract?',
      answerText: COMMA_SOURCE,
      chunk: COMMA_SOURCE,
    });
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toBe(COMMA_SOURCE);
    expect(result.text).not.toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('keeps a paraphrase that still uses the source wording', () => {
    const result = judge({
      question: 'What does this paragraph say about promissory estoppel?',
      answerText: PARAPHRASE,
      capture: PARAPHRASE_SOURCE,
    });
    expect(result.knowledgeTier).toBe('pdf_selection');
    expect(result.text).toBe(PARAPHRASE);
    expect(result.text).not.toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('keeps a quoted negative quantity and withholds the flipped sign', () => {
    const source = 'The derivative of x squared is -2x.';
    const asked = 'What is the derivative of x squared?';
    const same = judge({ question: asked, answerText: 'The derivative of x squared is negative 2x.', chunk: source });
    expect(same.knowledgeTier).toBe('course_material');
    expect(same.text).toContain('negative 2x');
    expect(same.text).not.toContain(ADDITIONAL_EXPLANATION_NOTICE);

    const flipped = judge({ question: asked, answerText: 'The derivative of x squared is 2x.', chunk: source });
    expect(flipped.knowledgeTier).not.toBe('course_material');

    const sourceOnly = judge({
      question: 'According to the PDF, what is the derivative of x squared?',
      answerText: 'The derivative of x squared is 2x.',
      chunk: source,
    });
    expect(sourceOnly.text).not.toContain('is 2x.');
  });

  it('keeps two selected sentences that are both in the selection', () => {
    const second = 'An offer is a manifestation of willingness to enter a bargain.';
    const capture = `${QUOTATION} ${second}`;
    const answer = `${QUOTATION} [PDF selection] ${second}`;
    const result = judge({
      question: 'What does this paragraph say about formation?',
      answerText: answer,
      capture,
    });
    expect(result.knowledgeTier).toBe('pdf_selection');
    expect(result.text).toContain('[PDF selection]');
    expect(result.text).toContain(second);
    expect(result.text).not.toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('withholds pdf selection when a legal explanation is not in the selection', () => {
    const answer = `${QUOTATION} [PDF selection] Promissory estoppel supplies a substitute for consideration.`;
    const result = judge({
      question: 'What does this paragraph say about consideration?',
      answerText: answer,
      capture: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('[PDF selection]');
    expect(result.text).toContain('Promissory estoppel');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('withholds course material when an economics claim follows the quotation', () => {
    const answer = `${QUOTATION.replace(/\.$/, '')}, and sticky wages explain the remaining adjustment.`;
    const result = judge({
      question: 'What does consideration require?',
      answerText: answer,
      chunk: QUOTATION,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('sticky wages');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('still withholds course material from the choice-only GDP formula', () => {
    const choices =
      'The cyclical part of real GDP is ... (a) trend real GDP less real GDP. (b) real GDP less trend real GDP.';
    const formula = '\\text{real GDP} - \\text{trend real GDP}.';
    const result = judge({
      question: 'What is the cyclical part of real GDP?',
      answerText: formula,
      chunk: choices,
    });
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('real GDP');
    expect(result.text).toContain('not independently verified');
  });
});
