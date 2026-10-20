/**
 * Page-relative PDF geometry in normalized 0–1 space.
 *
 * Independent of zoom, CSS pixel size, and devicePixelRatio.
 * Tied to a single PDF page (page number lives on the carrier object).
 *
 * Shared by Tutor context and PDF study-mark overlays — not a DB schema.
 */

export type NormalizedPageRegion = {
  /** Left edge, 0–1 of page width. */
  x: number;
  /** Top edge, 0–1 of page height. */
  y: number;
  /** Width, 0–1 of page width. */
  w: number;
  /** Height, 0–1 of page height. */
  h: number;
};
