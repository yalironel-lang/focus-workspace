/**
 * Safe structured-response parsing and fail-closed option resolution for Gemini.
 * Never infers an option index from digits inside mathematical expressions.
 */

/**
 * Safely strips unmistakable outer Markdown code fences (e.g. ```json ... ``` or ... ```)
 * without altering internal LaTeX or repairing broken JSON.
 */
export function normalizeJsonCodeFences(rawText: unknown): string {
  if (typeof rawText !== 'string') return '';
  let text = rawText.trim();
  if (text.startsWith('```json')) {
    text = text.slice(7).trimStart();
  } else if (text.startsWith('```')) {
    text = text.slice(3).trimStart();
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3).trimEnd();
  }
  return text;
}

/**
 * Normalizes mathematical or text strings for comparison:
 * strips outer LaTeX math delimiters ($), sizing commands, and whitespace.
 */
export function normalizeMathForMatching(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/^\$+|\$+$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/[\s\$\\]+/g, '')
    .toLowerCase();
}

export type CandidateOptionItem = string | { text?: string; text_or_latex?: string };

/**
 * Resolves option index ('1', '2', '3', '4', '5') from:
 * 1. An explicit ordinal index (e.g. '1', 'Option 2', '(3)', 'Option B').
 * 2. Exact or normalized matching against candidateOptions text (e.g. '-2' matching Option 3).
 *
 * If the selected option cannot be mapped unambiguously, returns 'UNKNOWN'.
 * Never guesses or uses unanchored digit matching.
 */
export function resolveSelectedOption(
  selectedVal: unknown,
  candidateOptions?: CandidateOptionItem[],
): string {
  if (selectedVal == null) return 'UNKNOWN';
  const str = String(selectedVal).trim();
  if (!str) return 'UNKNOWN';

  // 1. Explicit letter ordinal: 'Option A', '(B)', 'C.', 'Choice D' -> '1'..'5'
  const letterMatch = str.match(
    /^(?:option|choice|answer|prop|proposition|item)?\s*[#№]?\s*[\(\[]?([A-Ea-e])[\)\]\.\:]?$/i,
  );
  if (letterMatch && letterMatch[1]) {
    const letterCode = letterMatch[1].toUpperCase().charCodeAt(0);
    const index = letterCode - 65 + 1; // 'A' -> 1
    return String(index);
  }

  // 2. Explicit numeric ordinal: '1', 'Option 2', '(3)', 'Choice 4', '#5'
  // Strictly anchored: must NOT be signed (-2, +2), fractional (1/2), decimal (2.5), or algebraic (2x).
  const ordinalMatch = str.match(
    /^(?:option|choice|answer|prop|proposition|item)?\s*[#№]?\s*[\(\[]?([1-5])[\)\]\.\:]?$/i,
  );
  if (ordinalMatch && ordinalMatch[1]) {
    // If candidate options array is not provided, this is directly an explicit ordinal
    if (!Array.isArray(candidateOptions) || candidateOptions.length === 0) {
      return ordinalMatch[1];
    }
    // If the string has an explicit prefix like "Option 1" or "(1)", it is an ordinal
    const hasExplicitPrefix = /^(?:option|choice|answer|prop|proposition|item)\s*[#№]?\s*[\(\[]?[1-5][\)\]\.\:]?$/i.test(
      str,
    );
    if (hasExplicitPrefix) {
      return ordinalMatch[1];
    }
    // If it's a bare digit like "3", check whether candidate options are themselves numeric text
    // E.g. candidateOptions = ["3", "6", "-2", "None"].
    // If candidateOptions[0] has text "3", then bare "3" matches Option 1's text.
    const matchesValueIndex = candidateOptions.findIndex((opt) => {
      const optText = typeof opt === 'string' ? opt : opt?.text_or_latex || opt?.text || '';
      return normalizeMathForMatching(optText) === normalizeMathForMatching(str);
    });
    if (matchesValueIndex !== -1) {
      return String(matchesValueIndex + 1);
    }
    return ordinalMatch[1];
  }

  // 3. Match against student-visible candidate options
  if (Array.isArray(candidateOptions) && candidateOptions.length > 0) {
    const cleanSel = normalizeMathForMatching(str);
    const textSel = str.trim().toLowerCase();

    const matchedIndices: number[] = [];
    for (let i = 0; i < candidateOptions.length; i++) {
      const opt = candidateOptions[i];
      const optText = typeof opt === 'string' ? opt : opt?.text_or_latex || opt?.text || '';
      if (!optText) continue;

      const cleanOpt = normalizeMathForMatching(optText);
      const textOpt = optText.trim().toLowerCase();

      // Exact raw match or exact normalized math match (handles '-2' matching '-2')
      if (textSel === textOpt || cleanSel === cleanOpt) {
        matchedIndices.push(i);
        continue;
      }

      // Sentence / clause inclusion for long option text (e.g. full sentence options)
      if (textOpt.length > 10 && (textOpt.includes(textSel) || textSel.includes(textOpt))) {
        matchedIndices.push(i);
        continue;
      }
      if (cleanOpt.length > 10 && (cleanOpt.includes(cleanSel) || cleanSel.includes(cleanOpt))) {
        matchedIndices.push(i);
        continue;
      }
    }

    // Unambiguous single match
    if (matchedIndices.length === 1 && matchedIndices[0] !== undefined) {
      return String(matchedIndices[0] + 1);
    }
    // Ambiguous multiple match or no match -> return UNKNOWN
    if (matchedIndices.length > 1) {
      return 'UNKNOWN';
    }
  }

  return 'UNKNOWN';
}
