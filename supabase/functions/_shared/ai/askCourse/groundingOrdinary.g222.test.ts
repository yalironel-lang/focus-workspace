/**
 * @vitest-environment node
 * One quoted sentence does not make the rest of an ordinary answer course material.
 */
import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_EXPLANATION_NOTICE,
  applyClaimLevelGrounding,
} from './evaluateGroundingProvenance.ts';

const CONSIDERATION = 'Consideration requires a bargained-for exchange.';
const OFFER = 'An offer is a manifestation of willingness to enter a bargain.';
const QUESTION = 'What does consideration require?';

function judge(question: string, answerText: string, corpus: string) {
  return applyClaimLevelGrounding({
    question,
    answerText,
    chunks: [{ citationIndex: 1, text: corpus }],
    contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
  });
}

describe('G2.22 ordinary attribution stays with the supported sentence', () => {
  it('keeps a quotation and distinguishes a following factual claim', () => {
    const answer = `${CONSIDERATION} [1] Sticky wages explain the remaining adjustment.`;
    const result = judge(QUESTION, answer, CONSIDERATION);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain(CONSIDERATION.replace(/\.$/, ''));
    expect(result.text).toContain('[1]');
    expect(result.text).toContain('Sticky wages');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('keeps a quotation and distinguishes an unsupported legal doctrine', () => {
    const answer = `${CONSIDERATION} Promissory estoppel supplies a substitute for consideration.`;
    const result = judge(QUESTION, answer, CONSIDERATION);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('Promissory estoppel');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('keeps a quotation and distinguishes an unsupported conceptual explanation', () => {
    const answer = `${CONSIDERATION} This bargain is what makes a promise enforceable.`;
    const result = judge(QUESTION, answer, CONSIDERATION);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('enforceable');
    expect(result.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('keeps a fully supported multi-sentence answer as course material', () => {
    const source = `${CONSIDERATION} ${OFFER}`;
    const answer = [`### Formation`, '', CONSIDERATION, '', OFFER].join('\n');
    const result = judge(QUESTION, answer, source);
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toBe(answer);
    expect(result.text).not.toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('keeps a quotation followed by a harmless transition', () => {
    const answer = `${CONSIDERATION}\n\nIn other words:\n\n### Illustration`;
    const result = judge(QUESTION, answer, CONSIDERATION);
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toContain('In other words:');
    expect(result.text).toContain('### Illustration');
    expect(result.text).not.toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('still withholds course material from the choice-only GDP formula', () => {
    const choices =
      'The cyclical part of real GDP is ... (a) trend real GDP less real GDP. (b) real GDP less trend real GDP.';
    const formula = '\\text{real GDP} - \\text{trend real GDP}.';
    const result = judge('What is the cyclical part of real GDP?', formula, choices);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('real GDP');
    expect(result.text).toContain('not independently verified');
    expect(result.knowledgeTier).not.toBe('course_material');
  });

  it('accepts a source-keyed formula and rejects the opposite choice', () => {
    const keyed =
      'The correct answer is (b). The cyclical part of real GDP is real GDP less trend real GDP. (a) trend real GDP less real GDP. (b) real GDP less trend real GDP.';
    const stated = 'The cyclical part of real GDP is real GDP less trend real GDP.';
    const ordinary = judge('What is the cyclical part of real GDP?', stated, keyed);
    expect(ordinary.knowledgeTier).toBe('course_material');
    expect(ordinary.text).toBe(stated);

    const reversed = judge(
      'According to the PDF, what is the cyclical part of real GDP?',
      'The cyclical part of real GDP is trend real GDP less real GDP.',
      keyed,
    );
    expect(reversed.knowledgeTier).not.toBe('course_material');
    expect(reversed.text).not.toContain('trend real GDP less real GDP');
  });

  it('keeps a stated negative and withholds the flipped sign', () => {
    const source = 'The derivative of x squared is -2x.';
    const asked = 'What is the derivative of x squared?';
    const same = judge(asked, source, source);
    expect(same.knowledgeTier).toBe('course_material');
    expect(same.text).toBe(source);

    const flipped = judge(asked, 'The derivative of x squared is 2x.', source);
    expect(flipped.knowledgeTier).not.toBe('course_material');

    const sourceOnly = judge(
      'According to the PDF, what is the derivative of x squared?',
      'The derivative of x squared is 2x.',
      source,
    );
    expect(sourceOnly.text).not.toContain('is 2x.');
  });
});
