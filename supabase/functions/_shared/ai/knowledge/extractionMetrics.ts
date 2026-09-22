/**
 * Deterministic extraction-side metrics for M1.0B B1 suspicion detection.
 * Metrics are computed separately from canonical page text (which stays unchanged).
 */

/** Private Use Area + supplementary PUA planes (corruption glyph indicators). */
export function countSuspiciousUnicodeChars(text: string): number {
  if (!text) return 0;
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp >= 0xe000 && cp <= 0xf8ff) n += 1;
    else if (cp >= 0xf0000 && cp <= 0xffffd) n += 1;
    else if (cp >= 0x100000 && cp <= 0x10fffd) n += 1;
  }
  return n;
}
