import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';

/**
 * Isolated question labels, Roman numerals, item letters, or section headers.
 * Examples: "3.", "3", "3)", "Q3", "Question 3.", "Problem 2(a)", "Part B", "Page 2", "סעיף א"
 */
const ISOLATED_QUESTION_LABEL_RE =
  /^\s*(?:question|problem|exercise|section|q|part|page|exam|test|שאלה|תרגיל|סעיף)?\s*[([\]]?(?:[0-9]{1,4}(?:\s*[([.\p{L}0-9)\]]+)?|[\p{L}]{1,2}|[ivxlcdm]{1,6})[()[\].:\-]?\s*$/iu;

/**
 * Mathematical tokens/operators that suggest the presence of a formula or expression.
 */
const MATH_OPERATORS_RE = /[=+\-/*^\\<>\u2200-\u22FF\u2A00-\u2AFF]/;

export function isUsefulTutorExtractedText(
  text: string | null | undefined,
  regionNorm?: NormalizedPageRegion | null,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;

  // Reject isolated question labels / numbers (e.g. "3.", "Question 3", "4)", "Q.2", "Page 2")
  if (ISOLATED_QUESTION_LABEL_RE.test(trimmed)) {
    return false;
  }

  // Must contain at least one word character / alphanumeric
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const hasMath = MATH_OPERATORS_RE.test(trimmed);

  // Isolated label with suffix or prefix (e.g. "3. (a)", "Q1:", "Part 2.")
  if (words.length <= 2 && trimmed.length < 12 && !hasMath && ISOLATED_QUESTION_LABEL_RE.test(words[0])) {
    return false;
  }

  // Region-aware check:
  // If regionNorm is provided and represents a non-trivial area on the page,
  // but extracted text has very low semantic density (fewer than 3 words and no math operators),
  // this strongly indicates that formulas, diagrams, or text outside the native text layer were missed.
  if (regionNorm && typeof regionNorm.w === 'number' && typeof regionNorm.h === 'number') {
    const area = Math.max(0, regionNorm.w) * Math.max(0, regionNorm.h);
    if (area > 0.02 && words.length < 3 && !hasMath) {
      return false;
    }
  }

  // Standalone single word under 4 characters without math (e.g. "if", "or", "in")
  if (words.length === 1 && trimmed.length < 4 && !hasMath) {
    return false;
  }

  return true;
}
