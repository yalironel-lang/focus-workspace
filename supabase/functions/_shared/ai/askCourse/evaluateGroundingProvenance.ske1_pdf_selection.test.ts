/**
 * @vitest-environment node
 *
 * Focused regression: short selected-PDF formulas must classify as
 * pdf_selection when quoted, and must not be silently demoted to
 * general_academic via exponent/sign false positives or unparsed operators.
 */
import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_EXPLANATION_NOTICE,
  DERIVED_REASONING_NOTICE,
  applyClaimLevelGrounding,
  evaluateGroundingProvenance,
  mathRelationSupport,
} from './evaluateGroundingProvenance.ts';

const SHORT_FORMULA = 'f(x) = x^2 - 4';
const EXPLAINED =
  'The quadratic equation f(x) = x^2 - 4 represents a parabola with roots at x = 2 and x = -2.';
const QUESTION = 'Explain this equation';

describe('SKE1 PDF selection grounding regressions', () => {
  it('classifies a quote-only short PDF formula as pdf_selection', () => {
    const ev = evaluateGroundingProvenance({
      question: QUESTION,
      answerText: SHORT_FORMULA,
      indexedChunkTexts: [],
      captureText: SHORT_FORMULA,
    });
    expect(ev.tier).toBe('pdf_selection');
    expect(ev.quotedFromAvailableSource).toBe(true);
    expect(ev.contextAvailable).toEqual({ hasIndexedChunks: false, hasPdfCapture: true });

    const applied = applyClaimLevelGrounding({
      question: QUESTION,
      answerText: SHORT_FORMULA,
      chunks: [],
      captureText: SHORT_FORMULA,
      contextAvailable: ev.contextAvailable,
    });
    expect(applied.knowledgeTier).toBe('pdf_selection');
    expect(applied.text).toBe(SHORT_FORMULA);
  });

  it('keeps quotation as pdf_selection then strong-gates explained extras to mixed', () => {
    // Operators in the formula are unparsed relations; quotation must still count.
    expect(mathRelationSupport(EXPLAINED, SHORT_FORMULA)).toBe('unparsed');

    const ev = evaluateGroundingProvenance({
      question: QUESTION,
      answerText: EXPLAINED,
      indexedChunkTexts: [],
      captureText: SHORT_FORMULA,
    });
    expect(ev.tier).toBe('pdf_selection');
    expect(ev.quotedFromAvailableSource).toBe(true);

    const applied = applyClaimLevelGrounding({
      question: QUESTION,
      answerText: EXPLAINED,
      chunks: [],
      captureText: SHORT_FORMULA,
      contextAvailable: ev.contextAvailable,
    });
    expect(applied.knowledgeTier).toBe('mixed');
    expect(applied.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
    expect(applied.text).toContain('f(x) = x^2 - 4');
  });

  it('classifies general academic content when no PDF selection is present', () => {
    const ev = evaluateGroundingProvenance({
      question: 'Explain Ohm’s law',
      answerText: 'Ohm’s law relates voltage, current, and resistance in a circuit.',
      indexedChunkTexts: [],
      captureText: null,
    });
    expect(ev.tier).toBe('general_academic');
    expect(ev.quotedFromAvailableSource).toBe(false);
    expect(ev.contextAvailable).toEqual({ hasIndexedChunks: false, hasPdfCapture: false });
  });

  it('treats missing or whitespace-only PDF selection as no capture', () => {
    for (const captureText of [null, undefined, '', '   ', '\n\t'] as const) {
      const ev = evaluateGroundingProvenance({
        question: QUESTION,
        answerText: EXPLAINED,
        indexedChunkTexts: [],
        captureText: captureText as string | null | undefined,
      });
      expect(ev.contextAvailable.hasPdfCapture).toBe(false);
      expect(ev.tier).toBe('general_academic');
      expect(ev.quotedFromAvailableSource).toBe(false);
    }
  });

  it('does not treat exponents as signed quantities that poison PDF quotation', () => {
    // Regression: x^2 must not be read as +2, else root x=-2 falsely trips
    // statedSignDisagrees and demotes a quoted formula to general_academic.
    const ev = evaluateGroundingProvenance({
      question: QUESTION,
      answerText: EXPLAINED,
      indexedChunkTexts: [],
      captureText: SHORT_FORMULA,
    });
    expect(ev.quotedFromAvailableSource).toBe(true);
    expect(ev.tier).not.toBe('general_academic');
  });

  it('keeps citation-free text for pdf_selection and mixed selection answers', () => {
    const quote = applyClaimLevelGrounding({
      question: 'What is the selected equation?',
      answerText: SHORT_FORMULA,
      chunks: [],
      captureText: SHORT_FORMULA,
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
    });
    expect(quote.knowledgeTier).toBe('pdf_selection');
    expect(quote.text).not.toMatch(/\[\d+\]/);
    expect(quote.text).not.toMatch(/\[PDF selection\]/i);

    const mixed = applyClaimLevelGrounding({
      question: QUESTION,
      answerText: EXPLAINED,
      chunks: [],
      captureText: SHORT_FORMULA,
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
    });
    expect(mixed.knowledgeTier).toBe('mixed');
    expect(mixed.text).not.toMatch(/\[\d+\]/);
    expect(mixed.text).toContain(ADDITIONAL_EXPLANATION_NOTICE);
  });

  it('classifies visual PDF capture with mathematical derivation as pdf_selection_visual without DERIVED_REASONING_NOTICE', () => {
    const mathAnswer =
      'From the attached visual selection [PDF visual selection], we compute the partial derivatives: f_x = -3x^2/z and f_z = -y/z. Differentiating with respect to x yields f\'\'_{zx}(1, 3) = 1/3. Therefore, Option 1 is true.';

    const applied = applyClaimLevelGrounding({
      question: 'Solve this question step by step and identify the correct answer.',
      answerText: mathAnswer,
      chunks: [],
      captureText: '[PDF visual selection]',
      captureTextKind: 'visual_selection',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
    });

    // Provenance must be pdf_selection_visual
    expect(applied.knowledgeTier).toBe('pdf_selection_visual');
    // Must NOT contain the false general academic disclaimer
    expect(applied.text).not.toContain(DERIVED_REASONING_NOTICE);
    expect(applied.text).not.toContain('general academic reasoning');
    expect(applied.text).not.toContain('not independently verified');
    // Visual marker must be preserved
    expect(applied.text).toContain('[PDF visual selection]');
  });

  it('still drops unsupported course facts even when visual selection is present', () => {
    const answerWithPolicy =
      'From the attached visual selection [PDF visual selection], f\'\'_{zx}(1, 3) = 1/3. The professor announced that midterm exams are graded on a 50 point scale.';

    const applied = applyClaimLevelGrounding({
      question: 'Solve this question.',
      answerText: answerWithPolicy,
      chunks: [],
      captureText: '[PDF visual selection]',
      captureTextKind: 'visual_selection',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
    });

    expect(applied.knowledgeTier).toBe('pdf_selection_visual');
    expect(applied.text).not.toContain('midterm exams');
    expect(applied.text).not.toContain('50 point scale');
  });

  it('classifies response as general_academic if visual marker is missing and no chunks exist', () => {
    const genericAnswer =
      'The implicit function theorem allows solving for one variable in terms of others when the Jacobian is non-zero.';

    const applied = applyClaimLevelGrounding({
      question: 'Solve this question.',
      answerText: genericAnswer,
      chunks: [],
      captureText: '[PDF visual selection]',
      captureTextKind: 'visual_selection',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
    });

    expect(applied.knowledgeTier).toBe('general_academic');
    expect(applied.text).not.toContain(DERIVED_REASONING_NOTICE);
  });

  it('preserves DERIVED_REASONING_NOTICE for text-only captures with unverified relations', () => {
    // When capture is text-only (native_selection) and introduces an unverified relation
    const textCorpus = 'Let x be initial GDP and y be final GDP.';
    const answerWithRelation = 'The total growth is x + y.';

    const applied = applyClaimLevelGrounding({
      question: 'What is the total growth?',
      answerText: answerWithRelation,
      chunks: [],
      captureText: textCorpus,
      captureTextKind: 'native_selection',
      contextAvailable: { hasIndexedChunks: false, hasPdfCapture: true },
    });

    // Must be flagged as derived unverified for text captures
    expect(applied.knowledgeTier).toBe('mixed');
    expect(applied.text).toContain(DERIVED_REASONING_NOTICE);
  });
});
