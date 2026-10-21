/**
 * @vitest-environment node
 * Sign, subject, and option-repeat safeguards.
 */

import { describe, expect, it } from 'vitest';
import {
  applyClaimLevelGrounding,
  DERIVED_REASONING_NOTICE,
  OPTION_REPEAT_NOTICE,
} from './evaluateGroundingProvenance.ts';

const CONTEXT = { hasIndexedChunks: true, hasPdfCapture: false } as const;
const GDP = 'According to the PDF, what is the cyclical part of real GDP?';
const DERIVATIVE = 'According to the PDF, what is the derivative of x squared?';
const STATED = 'The derivative of x squared is 2x.';
const PROSE = [
  'The cyclical part of real GDP is real GDP less trend real GDP.',
  '(a) real GDP plus trend real GDP',
  '(b) real GDP less trend real GDP',
  '(c) trend real GDP less real GDP',
].join('\n');
const CHOICES = [
  'Select one of the following expressions.',
  '(a) real GDP plus trend real GDP',
  '(b) real GDP less trend real GDP',
  '(c) trend real GDP less real GDP',
].join('\n');
const KEY = [
  'The correct answer is (b).',
  '(a) real GDP plus trend real GDP',
  '(b) real GDP less trend real GDP',
  '(c) trend real GDP less real GDP',
].join('\n');

function judge(question: string, answer: string, corpus: string) {
  return applyClaimLevelGrounding({
    question,
    answerText: answer,
    chunks: [{ citationIndex: 1, text: corpus }],
    captureText: '',
    contextAvailable: CONTEXT,
  });
}

function removed(text: string): boolean {
  return text.startsWith('This cannot be established');
}

describe('G2.17 sign, operator, and subject audit', () => {
  it('keeps an exact stated derivative as course material', () => {
    const result = judge(DERIVATIVE, STATED, STATED);
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toContain('is 2x');
    expect(result.text).not.toContain(DERIVED_REASONING_NOTICE);
  });

  it('rejects an ASCII sign flip', () => {
    const result = judge(DERIVATIVE, 'The derivative of x squared is -2x.', STATED);
    expect(removed(result.text)).toBe(true);
    expect(result.knowledgeTier).not.toBe('course_material');
    expect(result.text).not.toContain('-2x');
  });

  it('rejects the word negative when the source quantity is unsigned', () => {
    const result = judge(DERIVATIVE, 'The derivative of x squared is negative 2x.', STATED);
    expect(removed(result.text)).toBe(true);
    expect(result.knowledgeTier).not.toBe('course_material');
    expect(result.text).not.toContain('negative 2x');
  });

  it('rejects a Unicode minus sign flip', () => {
    const result = judge(DERIVATIVE, 'The derivative of x squared is −2x.', STATED);
    expect(removed(result.text)).toBe(true);
    expect(result.knowledgeTier).not.toBe('course_material');
    expect(result.text).not.toContain('−2x');
  });

  it('keeps a negative expression when the source has the same sign', () => {
    const signed = 'The derivative of x squared is -2x.';
    const same = judge(DERIVATIVE, signed, signed);
    expect(same.knowledgeTier).toBe('course_material');
    expect(same.text).toContain('-2x');

    const word = judge(DERIVATIVE, 'The derivative of x squared is negative 2x.', signed);
    expect(word.knowledgeTier).toBe('course_material');
    expect(word.text).toContain('negative 2x');

    const flipped = judge(DERIVATIVE, 'The derivative of x squared is 2x.', signed);
    expect(removed(flipped.text)).toBe(true);
    expect(flipped.text).not.toContain('is 2x.');
  });

  it('rejects a parsed negation, a changed operator, a reversal, and a new number', () => {
    const negated = judge(DERIVATIVE, 'The derivative of x squared is not 2x.', STATED);
    expect(removed(negated.text)).toBe(true);
    expect(negated.knowledgeTier).not.toBe('course_material');

    const plus = judge(GDP, 'The cyclical part of real GDP is real GDP plus trend real GDP.', PROSE);
    expect(removed(plus.text)).toBe(true);

    const reversed = judge(GDP, 'The cyclical part of real GDP is trend real GDP less real GDP.', PROSE);
    expect(removed(reversed.text)).toBe(true);

    const numbered = judge(GDP, 'The cyclical part of real GDP is real GDP less trend real GDP 2.', PROSE);
    expect(removed(numbered.text)).toBe(true);
  });

  it('rejects a nominal, potential, or gross subject change', () => {
    for (const answer of [
      'The cyclical part of real GDP is nominal GDP less trend real GDP.',
      'The cyclical part of real GDP is potential GDP less trend real GDP.',
      'The cyclical part of real GDP is gross GDP less trend real GDP.',
    ]) {
      const result = judge(GDP, answer, PROSE);
      expect(removed(result.text)).toBe(true);
      expect(result.knowledgeTier).not.toBe('course_material');
      expect(result.text).not.toContain(answer.replace(/\.$/, ''));
    }
  });

  it('keeps nominal GDP when the source states nominal GDP', () => {
    const stated = 'The cyclical part of real GDP is nominal GDP less trend real GDP.';
    const result = judge(GDP, stated, stated);
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toContain('nominal GDP less trend real GDP');
  });
});

describe('G2.17 choice, key, and source regression audit', () => {
  it('labels a bare option differently from an academic explanation', () => {
    const bare = judge(GDP, '(b) real GDP less trend real GDP.', CHOICES);
    const explained = judge(
      GDP,
      'The cyclical component is the deviation from trend, so it is real GDP less trend real GDP.',
      CHOICES,
    );
    expect(bare.knowledgeTier).toBe('mixed');
    expect(bare.text).toContain(OPTION_REPEAT_NOTICE);
    expect(bare.text).not.toContain('general academic reasoning');
    expect(explained.knowledgeTier).toBe('mixed');
    expect(explained.text).toContain(DERIVED_REASONING_NOTICE);
    expect(explained.text).not.toContain(OPTION_REPEAT_NOTICE);
    expect(bare.knowledgeTier).not.toBe('course_material');
    expect(explained.knowledgeTier).not.toBe('course_material');
  });

  it('rejects a relation that contradicts a prose key and keeps the keyed relation', () => {
    const wrong = judge(GDP, 'The cyclical part of real GDP is trend real GDP less real GDP.', KEY);
    expect(removed(wrong.text)).toBe(true);
    expect(wrong.knowledgeTier).not.toBe('course_material');

    const right = judge(GDP, 'The cyclical part of real GDP is real GDP less trend real GDP.', KEY);
    expect(right.knowledgeTier).toBe('course_material');
    expect(right.text).not.toContain(DERIVED_REASONING_NOTICE);
  });

  it('keeps a stated subtraction, including a valid citation, as course material', () => {
    const plain = judge(GDP, 'The cyclical part of real GDP is real GDP less trend real GDP.', PROSE);
    expect(plain.knowledgeTier).toBe('course_material');
    expect(plain.text).not.toContain(DERIVED_REASONING_NOTICE);

    const cited = judge(GDP, 'The cyclical part of real GDP is real GDP less trend real GDP [1].', PROSE);
    expect(cited.knowledgeTier).toBe('course_material');
    expect(cited.text).toContain('[1]');
    expect(cited.text).not.toContain(DERIVED_REASONING_NOTICE);
  });
});
