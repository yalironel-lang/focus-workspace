import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';

export function isUsefulTutorExtractedText(
  text: string | null | undefined,
  _regionNorm?: NormalizedPageRegion | null,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  // Must contain at least one word character / alphanumeric
  return /[\p{L}\p{N}]/u.test(trimmed);
}
