/**
 * @vitest-environment node
 * LaTeX subtraction and ordinary-question attribution.
 */
import { describe, expect, it } from 'vitest';
import { applyClaimLevelGrounding } from './evaluateGroundingProvenance.ts';

const QUESTION = 'What is the cyclical part of real GDP?';
const CHOICES =
  'The cyclical part of real GDP is ... (a) trend real GDP less real GDP. (b) real GDP less trend real GDP. (c) nominal GDP plus trend real GDP.';
const PROSE = 'The cyclical part of real GDP is real GDP less trend real GDP.';
const CORRECT = '\\text{real GDP} - \\text{trend real GDP}.';
const REVERSED = '\\text{trend real GDP} - \\text{real GDP}.';
const UNICODE = '\\text{real GDP} − \\text{trend real GDP}.';
const PLUS = '\\text{real GDP} + \\text{trend real GDP}.';

function judge(question: string, answerText: string, corpus: string) {
  return applyClaimLevelGrounding({
    question,
    answerText,
    chunks: [{ citationIndex: 1, text: corpus }],
    contextAvailable: { hasIndexedChunks: true, hasPdfCapture: false },
  });
}

describe('G2.21 LaTeX relations on ordinary questions', () => {
  it('labels a correct LaTeX subtraction that exists only as a choice', () => {
    const result = judge(QUESTION, CORRECT, CHOICES);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('real GDP');
    expect(result.text).toContain('This repeats a listed option');
    expect(result.knowledgeTier).not.toBe('course_material');
  });

  it('keeps a reversed LaTeX subtraction without calling it course material', () => {
    const result = judge(QUESTION, REVERSED, CHOICES);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('trend real GDP');
    expect(result.text).toContain('not independently verified');
  });

  it('keeps LaTeX addition without calling it course material', () => {
    const result = judge(QUESTION, PLUS, CHOICES);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('+');
    expect(result.text).toContain('not independently verified');
  });

  it('accepts a Unicode minus as the same subtraction', () => {
    const result = judge(QUESTION, UNICODE, CHOICES);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('−');
    expect(result.text).not.toContain('general academic reasoning');
  });

  it('does not mark a formula as unverified when the prose states it', () => {
    const stated = `The cyclical part of real GDP is ${CORRECT}`;
    const result = judge(QUESTION, stated, PROSE);
    expect(result.text).toContain('real GDP');
    expect(result.text).toContain('trend real GDP');
    expect(result.text).not.toContain('not independently verified');
    expect(result.text).not.toContain('does not state it');
  });

  it('keeps a negative quantity when the source states that sign', () => {
    const source = 'The derivative of x squared is -2x.';
    const asked = 'What is the derivative of x squared?';
    const same = judge(asked, source, source);
    expect(same.knowledgeTier).toBe('course_material');
    expect(same.text).toContain('-2x');

    const word = judge(asked, 'The derivative of x squared is negative 2x.', source);
    expect(word.knowledgeTier).toBe('course_material');

    const flipped = judge(asked, 'The derivative of x squared is 2x.', source);
    expect(flipped.knowledgeTier).not.toBe('course_material');
    expect(flipped.text).toContain('2x');

    const sourceOnly = judge(
      'According to the PDF, what is the derivative of x squared?',
      'The derivative of x squared is 2x.',
      source,
    );
    expect(sourceOnly.text).not.toContain('is 2x.');
  });

  it('does not let a quotation promote a following unsupported formula', () => {
    const answer = `${PROSE} ${PLUS}`;
    const result = judge(QUESTION, answer, PROSE);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('real GDP less trend real GDP');
    expect(result.text).toContain('+');
    expect(result.text).toContain('not independently verified');
  });

  it('keeps one supported sentence beside one unsupported sentence', () => {
    const answer = `${PROSE}\n\nThe cyclical gap is ${PLUS}`;
    const result = judge(QUESTION, answer, PROSE);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('real GDP less trend real GDP');
    expect(result.text).toContain('cyclical gap');
    expect(result.text).toContain('not independently verified');
  });

  it('keeps an ordinary reversed formula and removes it for a source-only question', () => {
    const answer = `The cyclical part of real GDP is ${REVERSED}`;
    const ordinary = judge(QUESTION, answer, PROSE);
    expect(ordinary.knowledgeTier).toBe('mixed');
    expect(ordinary.text).toContain('trend real GDP');

    const sourceOnly = judge(`According to the PDF, ${QUESTION}`, answer, PROSE);
    expect(sourceOnly.knowledgeTier).not.toBe('course_material');
    expect(sourceOnly.text).not.toContain('trend real GDP -');
    expect(sourceOnly.text).toContain('does not state it');
  });

  it('does not let one quotation cover an unsupported sentence that has no relation', () => {
    const source = 'Consideration requires a bargained-for exchange.';
    const answer = `${source} Sticky wages explain the remaining adjustment.`;
    const result = judge('What does consideration require?', answer, source);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain(source.replace(/\.$/, ''));
    expect(result.text).toContain('Sticky wages');
    expect(result.text).toContain('goes beyond a direct statement');
  });
});
