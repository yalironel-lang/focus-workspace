/**
 * Conservative text normalization for PDF extraction.
 * Does not rewrite meaning, summarize, translate, or spell-correct.
 */

export function normalizeExtractedPageText(raw: string): string {
  if (!raw) return '';

  // Normalize newlines; keep paragraph breaks.
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Collapse runs of spaces/tabs inside a line (PDF item spacing noise).
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n');

  // Collapse 3+ blank lines to a single paragraph break.
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/** Count characters that are not whitespace. */
export function meaningfulCharCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}
