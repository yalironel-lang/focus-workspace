/**
 * @vitest-environment node
 * Derived academic answers stay distinct from source evidence.
 */

import { describe, expect, it } from 'vitest';
import {
  applyClaimLevelGrounding,
  DERIVED_REASONING_NOTICE,
  OPTION_REPEAT_NOTICE,
} from './evaluateGroundingProvenance.ts';

const WHAT = 'According to the PDF, what is the cyclical part of real GDP?';
const CONTEXT = { hasIndexedChunks: true, hasPdfCapture: false } as const;
const CORRECT = 'The cyclical part of real GDP is real GDP less trend real GDP.';
const REVERSED = 'The cyclical part of real GDP is trend real GDP less real GDP.';
const PLUS = 'The cyclical part of real GDP is real GDP plus trend real GDP.';
const PROSE = [
  'Question 1. What is the cyclical part of real GDP?',
  'The cyclical part of real GDP is real GDP less trend real GDP.',
  '(a) real GDP plus trend real GDP',
  '(b) real GDP less trend real GDP',
  '(c) trend real GDP less real GDP',
].join('\n');
const CHOICES = [
  'Question 1. What is the cyclical component?',
  'Select one of the following expressions.',
  '(a) real GDP plus trend real GDP',
  '(b) real GDP less trend real GDP',
  '(c) trend real GDP less real GDP',
].join('\n');

function judge(question: string, answerText: string, corpus: string) {
  return applyClaimLevelGrounding({
    question,
    answerText,
    chunks: [{ citationIndex: 1, text: corpus }],
    captureText: '',
    contextAvailable: CONTEXT,
  });
}

describe('source-stated relations stay source evidence', () => {
  it('keeps a correct subtraction and rejects the reversed and plus forms', () => {
    const correct = judge(WHAT, CORRECT, PROSE);
    expect(correct.knowledgeTier).toBe('course_material');
    expect(correct.text).toContain('real GDP less trend real GDP');
    expect(correct.text).not.toContain(DERIVED_REASONING_NOTICE);

    const cited = judge(WHAT, `${CORRECT.replace(/\.$/, '')} [1].`, PROSE);
    expect(cited.knowledgeTier).toBe('course_material');
    expect(cited.text).toContain('real GDP less trend real GDP');
    expect(cited.text).not.toContain(DERIVED_REASONING_NOTICE);

    const reversed = judge(WHAT, REVERSED, PROSE);
    expect(reversed.knowledgeTier).toBe('mixed');
    expect(reversed.text).not.toContain('trend real GDP less real GDP');

    const plus = judge(WHAT, PLUS, PROSE);
    expect(plus.knowledgeTier).toBe('mixed');
    expect(plus.text).not.toContain('plus');

    const numbered = judge(WHAT, 'The cyclical part of real GDP is real GDP less trend real GDP 2.', PROSE);
    expect(numbered.knowledgeTier).toBe('mixed');
    expect(numbered.text).not.toContain('real GDP less trend real GDP 2');
  });
});

describe('conflicting choices without a key are not source solutions', () => {
  it('labels the selected subtraction, reversal, or sum as unverified reasoning', () => {
    for (const answer of [CORRECT, REVERSED, PLUS, `${CORRECT.replace(/\.$/, '')} [1].`]) {
      const result = judge(WHAT, answer, CHOICES);
      expect(result.knowledgeTier).toBe('mixed');
      expect(result.text).toContain(OPTION_REPEAT_NOTICE);
      expect(result.text).not.toContain('general academic reasoning');
      expect(result.text).not.toContain('[1]');
      expect(result.text).not.toContain('verified solution');
    }
    const bare = judge(WHAT, '(b) real GDP less trend real GDP.', CHOICES);
    expect(bare.knowledgeTier).toBe('mixed');
    expect(bare.text).toContain(OPTION_REPEAT_NOTICE);
    expect(bare.knowledgeTier).not.toBe('course_material');
  });

  it('does not verify a letter when the model only repeats an option', () => {
    const result = judge(WHAT, `${CORRECT} So the correct answer is (b).`, CHOICES);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain(OPTION_REPEAT_NOTICE);
    expect(result.text).not.toContain('So the correct answer is (b).');
  });
});

describe('an explicit answer key can establish or reject a relation', () => {
  const keyed = [
    'Question 1. What is the cyclical component?',
    'The correct answer is (b).',
    '(a) real GDP plus trend real GDP',
    '(b) real GDP less trend real GDP',
    '(c) trend real GDP less real GDP',
  ].join('\n');

  it('accepts the keyed subtraction and removes a conflicting one', () => {
    const correct = judge(WHAT, CORRECT, keyed);
    expect(correct.knowledgeTier).toBe('course_material');
    expect(correct.text).toContain('real GDP less trend real GDP');
    expect(correct.text).not.toContain(DERIVED_REASONING_NOTICE);

    const reversed = judge(WHAT, REVERSED, keyed);
    expect(reversed.knowledgeTier).toBe('mixed');
    expect(reversed.text).not.toContain('trend real GDP less real GDP');

    const plus = judge(WHAT, PLUS, keyed);
    expect(plus.knowledgeTier).toBe('mixed');
    expect(plus.text).not.toContain('plus');
  });

  it('ignores a key phrase written inside a choice line', () => {
    const decoy = [
      'Question 1. What is the cyclical component?',
      'Select one of the following expressions.',
      '(a) real GDP plus trend real GDP',
      '(b) the correct answer is (b) real GDP less trend real GDP',
      '(c) trend real GDP less real GDP',
    ].join('\n');
    const result = judge(WHAT, CORRECT, decoy);
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain(OPTION_REPEAT_NOTICE);
  });
});

describe('general academic claims are labeled and unsafe claims stay removed', () => {
  it('keeps a doctrinal explanation without a citation or an invented exam date', () => {
    const corpus = 'Question 1. Discuss consideration.\nA contract is an agreement.';
    const result = judge(
      'According to the PDF, what is consideration?',
      'Consideration requires a bargained-for exchange [1]. The exam is on Friday.',
      corpus,
    );
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('bargained-for exchange');
    expect(result.text).not.toContain('[1]');
    expect(result.text).not.toContain('Friday');
    expect(result.text).toContain(DERIVED_REASONING_NOTICE);
    expect(result.knowledgeTier).not.toBe('course_material');
  });

  it('keeps an unstated polynomial root as unverified reasoning', () => {
    const result = judge(
      'According to the PDF, what are the roots?',
      'The roots are 2 and -2.',
      'Solve f(x) = x^2 - 4.',
    );
    expect(result.knowledgeTier).toBe('mixed');
    expect(result.text).toContain('The roots are 2 and -2.');
    expect(result.text).toContain(DERIVED_REASONING_NOTICE);
  });

  it('does not add a final answer the model did not write', () => {
    const teach = judge(WHAT, 'Start by identifying the two quantities being compared.', CHOICES);
    expect(teach.text).not.toContain('real GDP less trend real GDP');
    const prep = judge(WHAT, 'Try the question before looking at a worked result.', CHOICES);
    expect(prep.text).not.toContain('real GDP less trend real GDP');
  });
});
