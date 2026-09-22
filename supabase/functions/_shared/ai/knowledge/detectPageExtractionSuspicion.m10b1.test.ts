/**
 * @vitest-environment node
 *
 * M1.0B B1 — page extraction suspicion detector (pure / deterministic).
 */

import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION,
  KNOWLEDGE_PDF_EXTRACTION_VERSION,
  KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_ITEMS,
  KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_MEANINGFUL_CHARS,
  KNOWLEDGE_SUSPICION_MIN_PUA_CHARS,
  KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS,
  KNOWLEDGE_SUSPICION_THIN_MIN_ITEMS,
} from './bounds.ts';
import {
  detectPageExtractionSuspicion,
  hasShellWithMissingContent,
} from './detectPageExtractionSuspicion.ts';
import { countSuspiciousUnicodeChars } from './extractionMetrics.ts';
import { meaningfulCharCount } from './normalizeText.ts';

/** Known M1.0A/B0 MVT theorem-page native extract pattern (no OCR). */
const MVT_THEOREM_SHELL =
  'If is a continuous function on and differentiable on its interior. Then: . Mean Value Theorem';

describe('M1.0B B1 page suspicion detector', () => {
  it('flags MVT failure pattern as suspicious with explainable reasons', () => {
    const text = MVT_THEOREM_SHELL;
    const meaningfulChars = meaningfulCharCount(text);
    expect(meaningfulChars).toBeLessThanOrEqual(KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS);
    expect(hasShellWithMissingContent(text)).toBe(true);

    const result = detectPageExtractionSuspicion({
      pageNumber: 3,
      text,
      itemCount: 14,
      meaningfulChars,
      suspiciousUnicodeCount: 0,
    });

    expect(result.suspicious).toBe(true);
    expect(result.reasons).toContain('SHELL_WITH_MISSING_CONTENT');
    expect(result.reasons).toContain('SPARSE_TEXT');
    expect(result.detectorVersion).toBe(KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION);
    expect(result.extractionVersion).toBe(KNOWLEDGE_PDF_EXTRACTION_VERSION);
    expect(result.metrics.itemCount).toBe(14);
    expect(result.metrics.meaningfulChars).toBe(meaningfulChars);
  });

  it('keeps healthy normal academic text healthy', () => {
    const text = [
      'The Mean Value Theorem states that if a function f is continuous on a closed',
      'interval [a, b] and differentiable on (a, b), then there exists at least one',
      'point c in (a, b) such that f\'(c) = (f(b) - f(a)) / (b - a). This connects',
      'the average rate of change on an interval to the instantaneous rate at c.',
    ].join(' ');
    const meaningfulChars = meaningfulCharCount(text);
    const result = detectPageExtractionSuspicion({
      pageNumber: 1,
      text,
      itemCount: 40,
      meaningfulChars,
      suspiciousUnicodeCount: 0,
    });
    expect(result.suspicious).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('does not flag sparse but legitimate title/section pages', () => {
    const text = 'Real-valued function of a real variable';
    const meaningfulChars = meaningfulCharCount(text);
    expect(meaningfulChars).toBeGreaterThan(0);
    expect(meaningfulChars).toBeLessThan(KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS);

    const result = detectPageExtractionSuspicion({
      pageNumber: 2,
      text,
      itemCount: 5,
      meaningfulChars,
      suspiciousUnicodeCount: 0,
    });
    expect(result.suspicious).toBe(false);
    expect(result.reasons).not.toContain('SPARSE_TEXT');
    expect(result.reasons).not.toContain('LOW_TEXT_ITEM_COUNT');
  });

  it('flags corrupted / PUA pages', () => {
    const text = `Definition ${'\uE000'}${'f'.repeat(20)}${'\uF8FF'} end`;
    const pua = countSuspiciousUnicodeChars(text);
    expect(pua).toBeGreaterThanOrEqual(KNOWLEDGE_SUSPICION_MIN_PUA_CHARS);

    const result = detectPageExtractionSuspicion({
      pageNumber: 4,
      text,
      itemCount: 6,
      meaningfulChars: meaningfulCharCount(text),
      suspiciousUnicodeCount: pua,
    });
    expect(result.suspicious).toBe(true);
    expect(result.reasons).toContain('SUSPICIOUS_UNICODE');
  });

  it('does not treat ordinary math Unicode as corruption', () => {
    const text = [
      'Let f∶ [a,b] → ℝ be continuous on the closed interval and differentiable on the open interval.',
      'Then ∃ c ∈ (a,b) with f′(c)=(f(b)−f(a))/(b−a). The formula uses ordinary mathematical Unicode,',
      'not private-use corruption glyphs from a broken text layer.',
    ].join(' ');
    const pua = countSuspiciousUnicodeChars(text);
    expect(pua).toBe(0);
    expect(meaningfulCharCount(text)).toBeGreaterThan(KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS);
    const result = detectPageExtractionSuspicion({
      pageNumber: 5,
      text,
      itemCount: 30,
      meaningfulChars: meaningfulCharCount(text),
      suspiciousUnicodeCount: pua,
    });
    expect(result.reasons).not.toContain('SUSPICIOUS_UNICODE');
    expect(result.suspicious).toBe(false);
  });

  it('is deterministic for identical inputs', () => {
    const page = {
      pageNumber: 3,
      text: MVT_THEOREM_SHELL,
      itemCount: 14,
      meaningfulChars: meaningfulCharCount(MVT_THEOREM_SHELL),
      suspiciousUnicodeCount: 0,
    };
    const a = detectPageExtractionSuspicion(page);
    const b = detectPageExtractionSuspicion(page);
    expect(a).toEqual(b);
  });

  it('SPARSE_TEXT boundary: thin content requires min item count', () => {
    const text = 'x'.repeat(KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS);
    const belowItems = detectPageExtractionSuspicion({
      pageNumber: 1,
      text,
      itemCount: KNOWLEDGE_SUSPICION_THIN_MIN_ITEMS - 1,
      meaningfulChars: text.length,
      suspiciousUnicodeCount: 0,
    });
    expect(belowItems.reasons).not.toContain('SPARSE_TEXT');

    const atItems = detectPageExtractionSuspicion({
      pageNumber: 1,
      text,
      itemCount: KNOWLEDGE_SUSPICION_THIN_MIN_ITEMS,
      meaningfulChars: text.length,
      suspiciousUnicodeCount: 0,
    });
    expect(atItems.reasons).toContain('SPARSE_TEXT');

    const justOverChars = detectPageExtractionSuspicion({
      pageNumber: 1,
      text: 'x'.repeat(KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS + 1),
      itemCount: KNOWLEDGE_SUSPICION_THIN_MIN_ITEMS,
      meaningfulChars: KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS + 1,
      suspiciousUnicodeCount: 0,
    });
    expect(justOverChars.reasons).not.toContain('SPARSE_TEXT');
  });

  it('LOW_TEXT_ITEM_COUNT boundary around configured thresholds', () => {
    const thin = 'ab';
    expect(meaningfulCharCount(thin)).toBeLessThanOrEqual(
      KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_MEANINGFUL_CHARS,
    );
    const flagged = detectPageExtractionSuspicion({
      pageNumber: 10,
      text: thin,
      itemCount: KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_ITEMS,
      meaningfulChars: meaningfulCharCount(thin),
      suspiciousUnicodeCount: 0,
    });
    expect(flagged.reasons).toContain('LOW_TEXT_ITEM_COUNT');

    const tooManyItems = detectPageExtractionSuspicion({
      pageNumber: 10,
      text: thin,
      itemCount: KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_ITEMS + 1,
      meaningfulChars: meaningfulCharCount(thin),
      suspiciousUnicodeCount: 0,
    });
    expect(tooManyItems.reasons).not.toContain('LOW_TEXT_ITEM_COUNT');

    const empty = detectPageExtractionSuspicion({
      pageNumber: 11,
      text: '',
      itemCount: 1,
      meaningfulChars: 0,
      suspiciousUnicodeCount: 0,
    });
    expect(empty.reasons).not.toContain('LOW_TEXT_ITEM_COUNT');
  });
});
