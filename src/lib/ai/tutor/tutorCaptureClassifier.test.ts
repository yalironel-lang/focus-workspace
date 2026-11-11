import { describe, expect, it } from 'vitest';
import { isUsefulTutorExtractedText } from './tutorCaptureClassifier';

describe('tutorCaptureClassifier: isUsefulTutorExtractedText', () => {
  it('1. rejects empty, null, undefined, or whitespace-only strings', () => {
    expect(isUsefulTutorExtractedText(null)).toBe(false);
    expect(isUsefulTutorExtractedText(undefined)).toBe(false);
    expect(isUsefulTutorExtractedText('')).toBe(false);
    expect(isUsefulTutorExtractedText('   \n\t  ')).toBe(false);
  });

  it('2. rejects isolated question numbers and labels (e.g. Question number included in selection)', () => {
    // Exact failure case from Calculus II Exam 2 Page 2 Question 3
    expect(isUsefulTutorExtractedText('3.')).toBe(false);
    expect(isUsefulTutorExtractedText('3')).toBe(false);
    expect(isUsefulTutorExtractedText('3)')).toBe(false);
    expect(isUsefulTutorExtractedText('(3)')).toBe(false);
    expect(isUsefulTutorExtractedText('[3]')).toBe(false);
    expect(isUsefulTutorExtractedText('Question 3')).toBe(false);
    expect(isUsefulTutorExtractedText('Question 3.')).toBe(false);
    expect(isUsefulTutorExtractedText('Problem 2')).toBe(false);
    expect(isUsefulTutorExtractedText('Problem 2(a)')).toBe(false);
    expect(isUsefulTutorExtractedText('Exercise 4')).toBe(false);
    expect(isUsefulTutorExtractedText('Q3')).toBe(false);
    expect(isUsefulTutorExtractedText('Q.3')).toBe(false);
    expect(isUsefulTutorExtractedText('Part B')).toBe(false);
    expect(isUsefulTutorExtractedText('Page 2')).toBe(false);
    expect(isUsefulTutorExtractedText('Exam 2')).toBe(false);
    expect(isUsefulTutorExtractedText('שאלה 3')).toBe(false);
    expect(isUsefulTutorExtractedText('סעיף ב')).toBe(false);
  });

  it('3. rejects sparse native text over a visually rich region', () => {
    // Large region covering a question block (width 60%, height 20% of page)
    const richRegion = { x: 0.1, y: 0.2, w: 0.6, h: 0.2 }; // area = 0.12

    // Sparse headers / stray words over a large region must NOT be deemed useful text
    expect(isUsefulTutorExtractedText('Calculus II', richRegion)).toBe(false);
    expect(isUsefulTutorExtractedText('Resit Exam', richRegion)).toBe(false);
    expect(isUsefulTutorExtractedText('3. (a)', richRegion)).toBe(false);
  });

  it('4. accepts genuine native-text selections with full sentence context or math formulas', () => {
    // Rich paragraph
    const paragraph =
      'Let f: R^2 -> R be a continuously differentiable function such that the gradient at (1, 3) is non-zero.';
    expect(isUsefulTutorExtractedText(paragraph)).toBe(true);

    // Mathematical formula with operators
    expect(isUsefulTutorExtractedText('f(x, z) = (7 - x^3) / z')).toBe(true);
    expect(isUsefulTutorExtractedText('\\nabla F(x, y, z) = (3x^2, z, y)')).toBe(true);
    expect(isUsefulTutorExtractedText('f_x(1, 3) = -1')).toBe(true);

    // Multi-word phrase in normal text
    expect(isUsefulTutorExtractedText('Implicit Function Theorem')).toBe(true);
    expect(isUsefulTutorExtractedText('local minimum at the origin')).toBe(true);
  });

  it('5. preserves small inline selections when appropriate and rejects standalone tiny words without math', () => {
    const inlineWordRegion = { x: 0.2, y: 0.3, w: 0.1, h: 0.02 }; // area = 0.002
    expect(isUsefulTutorExtractedText('derivative', inlineWordRegion)).toBe(true);
    expect(isUsefulTutorExtractedText('eigenvalue', inlineWordRegion)).toBe(true);

    // Standalone tiny non-math preposition/conjunction
    expect(isUsefulTutorExtractedText('if', inlineWordRegion)).toBe(false);
    expect(isUsefulTutorExtractedText('or', inlineWordRegion)).toBe(false);
  });
});
