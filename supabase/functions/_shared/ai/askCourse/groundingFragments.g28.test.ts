/**
 * @vitest-environment node
 * Harmless fragments and clear en-dash subtraction. Academic rejections stay.
 */

import { describe, expect, it } from 'vitest';
import {
  applyClaimLevelGrounding,
  CONTRADICTED_OPTION_NOTICE,
  mathRelationSupport,
  splitClaims,
  OPTION_REPEAT_NOTICE,
  SOURCE_ONLY_INTERPRETATION_NOTICE,
} from './evaluateGroundingProvenance.ts';

const WHAT = 'According to the PDF, what is the cyclical part of real GDP?';
const TRUE_POLAR = 'According to the PDF, is real GDP less trend real GDP?';
const FALSE_POLAR = 'According to the PDF, is real GDP plus trend real GDP?';
const REVERSED_POLAR = 'According to the PDF, is trend real GDP less real GDP?';
const FORMULA = 'The cyclical part of real GDP is: Real GDP − Trend real GDP.';
const CORPUS = [
  'Question 1. What is the cyclical part of real GDP?',
  'The cyclical part of real GDP is real GDP less trend real GDP.',
  '(a) government spending',
  '(b) real GDP less trend real GDP',
  '(c) nominal GDP plus trend real GDP',
].join('\n');
const CONTEXT = { hasIndexedChunks: true, hasPdfCapture: false } as const;
const UNSUPPORTED_NOTICE = 'The unsupported part cannot be established from the available source.';

function judge(question: string, answerText: string, corpus = CORPUS) {
  return applyClaimLevelGrounding({
    question,
    answerText,
    chunks: [{ citationIndex: 1, text: corpus }],
    captureText: '',
    contextAvailable: CONTEXT,
  });
}

describe('G2.8 fragment and notation handling', () => {
  it('keeps a correct subtraction without an unsupported notice', () => {
    const result = judge(WHAT, FORMULA);
    expect(result.knowledgeTier).toBe('course_material');
    expect(result.text).toContain('Real GDP − Trend real GDP');
    expect(result.text).not.toContain('unsupported part');
    expect(mathRelationSupport(FORMULA, CORPUS)).toBe('equivalent');
  });

  it('does not split or reject a standalone i.e. after a correct formula', () => {
    expect(splitClaims('Real GDP less trend real GDP. i.e. the same difference.')).toEqual([
      'Real GDP less trend real GDP.',
      'i.e. the same difference.',
    ]);
    const kept = judge(WHAT, `${FORMULA}\ni.e.`);
    expect(kept.knowledgeTier).toBe('course_material');
    expect(kept.text).toContain(FORMULA);
    expect(kept.text).not.toContain('i.e.');
    expect(kept.text).not.toContain(UNSUPPORTED_NOTICE);

    const attached = judge(WHAT, `${FORMULA} i.e. wages are sticky.`);
    expect(attached.text).toContain(FORMULA);
    expect(attached.text).not.toContain('wages');
    expect(attached.text).toContain(UNSUPPORTED_NOTICE);
    expect(attached.knowledgeTier).toBe('mixed');
  });

  it('omits harmless discourse fragments and still rejects a wage or exam claim', () => {
    const discourse = judge(WHAT, `${FORMULA}\nFor example.\nNote.`);
    expect(discourse.knowledgeTier).toBe('course_material');
    expect(discourse.text).toContain(FORMULA);
    expect(discourse.text).not.toContain('For example');
    expect(discourse.text).not.toContain(UNSUPPORTED_NOTICE);

    const wage = judge(WHAT, `${FORMULA} Sticky wages determine the contract.`);
    expect(wage.text).toContain(FORMULA);
    expect(wage.text).not.toContain('Sticky wages');
    expect(wage.text).toContain(UNSUPPORTED_NOTICE);
    expect(wage.knowledgeTier).toBe('mixed');

    const exam = judge(WHAT, `${FORMULA} The final exam is on Friday.`);
    expect(exam.text).toContain(FORMULA);
    expect(exam.text).not.toContain('exam');
    expect(exam.text).toContain(UNSUPPORTED_NOTICE);
    expect(exam.knowledgeTier).toBe('mixed');
  });

  it('checks yes and no against true and false mathematical questions', () => {
    const yesTrue = judge(TRUE_POLAR, 'Yes.');
    expect(yesTrue.text).toBe('Yes.');
    expect(yesTrue.knowledgeTier).toBe('course_material');
    expect(yesTrue.text).not.toContain(UNSUPPORTED_NOTICE);

    const noTrue = judge(TRUE_POLAR, 'No.');
    expect(noTrue.knowledgeTier).toBe('mixed');
    expect(noTrue.text).not.toBe('No.');
    expect(noTrue.text).not.toContain('course_material');

    const yesFalse = judge(FALSE_POLAR, 'Yes.');
    expect(yesFalse.knowledgeTier).toBe('mixed');
    expect(yesFalse.text).not.toBe('Yes.');

    const noFalse = judge(FALSE_POLAR, 'No.');
    expect(noFalse.text).toBe('No.');
    expect(noFalse.knowledgeTier).toBe('course_material');

    const yesReversed = judge(REVERSED_POLAR, 'Yes.');
    expect(yesReversed.knowledgeTier).toBe('mixed');
    expect(yesReversed.text).not.toBe('Yes.');

    const noReversed = judge(REVERSED_POLAR, 'No.');
    expect(noReversed.text).toBe('No.');
    expect(noReversed.knowledgeTier).toBe('course_material');

    const yesToWhat = judge(WHAT, 'Yes.');
    expect(yesToWhat.knowledgeTier).toBe('mixed');
    expect(yesToWhat.text).not.toBe('Yes.');

    const formulaAndNo = judge(WHAT, `${FORMULA} No.`);
    expect(formulaAndNo.text).toContain(FORMULA);
    expect(formulaAndNo.text).not.toContain('No.');
    expect(formulaAndNo.text).toContain(UNSUPPORTED_NOTICE);
    expect(formulaAndNo.knowledgeTier).toBe('mixed');
  });

  it('treats a clear en dash as subtraction and leaves punctuation dashes alone', () => {
    const mathematical = judge(WHAT, 'Real GDP – Trend real GDP.');
    expect(mathematical.knowledgeTier).toBe('course_material');
    expect(mathematical.text).toContain('Real GDP – Trend real GDP.');
    expect(mathematical.text).not.toContain(UNSUPPORTED_NOTICE);
    expect(mathRelationSupport('Real GDP – Trend real GDP.', CORPUS)).toBe('equivalent');
    expect(mathRelationSupport('Trend real GDP – Real GDP.', CORPUS)).toBe('contradiction');

    const reversed = judge(WHAT, 'The cyclical part of real GDP is trend real GDP – real GDP.');
    expect(reversed.knowledgeTier).toBe('mixed');
    expect(reversed.text).not.toContain('trend real GDP – real GDP');

    const plus = judge(WHAT, 'The cyclical part of real GDP is real GDP plus trend real GDP.');
    expect(plus.knowledgeTier).toBe('mixed');
    expect(plus.text).not.toContain('plus');

    const aside = 'The cyclical component – unlike nominal output – is discussed beside the definition.';
    expect(mathRelationSupport(aside, CORPUS)).toBe('none');
    const punctuated = judge(WHAT, aside);
    expect(punctuated.knowledgeTier).not.toBe('course_material');
    expect(punctuated.text).not.toContain(UNSUPPORTED_NOTICE);

    const compound = 'Non–residential investment is outside this definition.';
    expect(mathRelationSupport(compound, CORPUS)).toBe('none');
    expect(splitClaims('Use the definition, e.g. real GDP less trend real GDP.')).toEqual([
      'Use the definition, e.g. real GDP less trend real GDP.',
    ]);
  });

  it('keeps a correct option label and rejects a wrong label or a choice-only distractor', () => {
    const correct = judge(WHAT, `${FORMULA} So the correct answer is (b).`);
    expect(correct.knowledgeTier).toBe('course_material');
    expect(correct.text).toContain('So the correct answer is (b).');
    expect(correct.text).not.toContain(UNSUPPORTED_NOTICE);
    expect(correct.text).not.toContain(CONTRADICTED_OPTION_NOTICE);

    const wrong = judge(WHAT, `${FORMULA} So the correct answer is (c).`);
    expect(wrong.knowledgeTier).toBe('mixed');
    expect(wrong.text).toContain(FORMULA);
    expect(wrong.text).not.toContain('(c)');
    expect(wrong.text).toContain(CONTRADICTED_OPTION_NOTICE);
    expect(wrong.text).not.toContain(UNSUPPORTED_NOTICE);

    const distractor = judge(WHAT, 'Nominal GDP plus trend real GDP.');
    expect(distractor.knowledgeTier).toBe('mixed');
    expect(distractor.text).not.toContain('Nominal GDP plus');
    expect(distractor.text).toContain('does not state it');
  });
});

const CHOICE_ONLY = [
  'Question 1. What is the cyclical component?',
  'Select one of the following expressions.',
  '(a) real GDP plus trend real GDP',
  '(b) real GDP less trend real GDP',
  '(c) trend real GDP less real GDP',
].join('\n');

const CORRECT = 'The cyclical part of real GDP is real GDP less trend real GDP.';
const REVERSED = 'The cyclical part of real GDP is trend real GDP less real GDP.';
const PLUS = 'The cyclical part of real GDP is real GDP plus trend real GDP.';

function traced(answerText: string, corpus: string) {
  const lines: string[] = [];
  const result = applyClaimLevelGrounding({
    question: WHAT,
    answerText,
    chunks: [{ citationIndex: 1, text: corpus }],
    captureText: '',
    contextAvailable: CONTEXT,
    diagnostics: { correlationId: 'abcdef012345', emit: (line) => lines.push(line) },
  });
  const decision = lines
    .map((line) => JSON.parse(line) as { event?: string; relation?: string; decision?: string; disposition?: string })
    .find((item) => item.event === 'ask_course_grounding_decision');
  return { result, decision };
}

describe('citation markers do not change a subtraction, a reversal, or a sum', () => {
  it('keeps a cited correct subtraction as source support', () => {
    const cited = `${CORRECT.replace(/\.$/, '')} [1].`;
    const invalid = `${CORRECT.replace(/\.$/, '')} [9].`;
    expect(mathRelationSupport(cited, CORPUS)).toBe('verbatim');
    expect(mathRelationSupport(invalid, CORPUS)).toBe('verbatim');

    const valid = traced(cited, CORPUS);
    expect(valid.decision).toMatchObject({ relation: 'verbatim', decision: 'quoted', disposition: 'retained' });
    expect(valid.result.knowledgeTier).toBe('course_material');
    expect(valid.result.text).toContain('real GDP less trend real GDP [1]');

    const dropped = traced(invalid, CORPUS);
    expect(dropped.decision).toMatchObject({ relation: 'verbatim', decision: 'quoted', disposition: 'rewritten' });
    expect(dropped.result.knowledgeTier).toBe('course_material');
    expect(dropped.result.text).toContain('real GDP less trend real GDP');
    expect(dropped.result.text).not.toContain('[9]');
  });

  it('still rejects a cited reversed subtraction and a cited sum', () => {
    const citedReversed = `${REVERSED.replace(/\.$/, '')} [1].`;
    const citedPlus = `${PLUS.replace(/\.$/, '')} [1].`;
    expect(mathRelationSupport(citedReversed, CORPUS)).toBe('contradiction');
    expect(mathRelationSupport(citedPlus, CORPUS)).toBe('contradiction');

    const reversed = traced(citedReversed, CORPUS);
    expect(reversed.decision).toMatchObject({ relation: 'contradiction', decision: 'relation_contradiction' });
    expect(reversed.result.knowledgeTier).toBe('mixed');
    expect(reversed.result.text).not.toContain('trend real GDP less real GDP');

    const plus = traced(citedPlus, CORPUS);
    expect(plus.decision).toMatchObject({ relation: 'contradiction', decision: 'relation_contradiction' });
    expect(plus.result.knowledgeTier).toBe('mixed');
    expect(plus.result.text).not.toContain('plus');
  });

  it('treats an unbracketed number as a harmful operand', () => {
    const numbered = 'The cyclical part of real GDP is real GDP less trend real GDP 2.';
    expect(mathRelationSupport(numbered, CORPUS)).toBe('contradiction');
    const judged = traced(numbered, CORPUS);
    expect(judged.decision?.decision).toBe('relation_contradiction');
    expect(judged.result.knowledgeTier).toBe('mixed');
    expect(judged.result.text).not.toContain('real GDP less trend real GDP 2');
  });

  it('labels a choice-only subtraction, reversal, or sum as unverified reasoning', () => {
    for (const answer of [CORRECT, `${CORRECT.replace(/\.$/, '')} [1].`, REVERSED, PLUS]) {
      expect(mathRelationSupport(answer, CHOICE_ONLY)).toBe('unmatched');
      const judged = traced(answer, CHOICE_ONLY);
      expect(judged.decision).toMatchObject({ relation: 'unmatched', decision: 'option_repeat' });
      expect(judged.result.knowledgeTier).toBe('mixed');
      expect(judged.result.text).toContain(OPTION_REPEAT_NOTICE);
      expect(judged.result.text).not.toContain('[1]');
    }
  });

  it('accepts the same subtraction once solution prose states it', () => {
    const prose = [
      'The cyclical part of real GDP is real GDP less trend real GDP.',
      '(a) real GDP plus trend real GDP',
      '(b) real GDP less trend real GDP',
      '(c) trend real GDP less real GDP',
    ].join('\n');
    const correct = traced(CORRECT, prose);
    expect(mathRelationSupport(CORRECT, prose)).toBe('verbatim');
    expect(correct.decision).toMatchObject({ relation: 'verbatim', decision: 'quoted' });
    expect(correct.result.knowledgeTier).toBe('course_material');

    const reversed = traced(REVERSED, prose);
    expect(mathRelationSupport(REVERSED, prose)).toBe('contradiction');
    expect(reversed.decision?.decision).toBe('relation_contradiction');
    expect(reversed.result.knowledgeTier).toBe('mixed');

    const plus = traced(PLUS, prose);
    expect(mathRelationSupport(PLUS, prose)).toBe('contradiction');
    expect(plus.decision?.decision).toBe('relation_contradiction');
    expect(plus.result.knowledgeTier).toBe('mixed');
  });
});
