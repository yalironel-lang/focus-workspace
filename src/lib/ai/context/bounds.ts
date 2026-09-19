/**
 * Context minimization bounds for ZIKUK AI M0.1.
 * Conservative V1: previous + current + next top-level blocks only.
 */

/** Max characters of selected text / latex included in focus. */
export const MAX_SELECTION_CHARS = 2000;

/** Max characters per surrounding block text/latex. */
export const MAX_BLOCK_CHARS = 500;

/** Max characters of table cell text preview. */
export const MAX_TABLE_PREVIEW_CHARS = 400;

/** previous + current + next. */
export const MAX_SURROUNDING_BLOCKS = 3;

export function truncateWithFlag(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: value.slice(0, maxChars), truncated: true };
}
