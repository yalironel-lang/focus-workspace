/** PDF study marks + ink — sidecar data (never embedded in PDF bytes). Local-authoritative V1. */

export const PDF_STUDY_MARKS_VERSION = 1 as const;

export type PdfHighlightRegion = {
  id: string;
  /** Normalized 0–1 relative to page viewport. */
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Page-normalized ink point (0–1). Not CSS pixels. */
export type PdfInkPoint = {
  x: number;
  y: number;
  pressure?: number;
};

export type PdfInkStroke = {
  id: string;
  color: string;
  /** Logical stroke width (same units as handwriting width presets). */
  width: number;
  points: PdfInkPoint[];
};

export type PdfStudyMarksPageLayer = {
  regions: PdfHighlightRegion[];
  /** Optional Apple Pencil / mouse ink on this page (normalized). */
  strokes?: PdfInkStroke[];
};

export type PdfStudyMarksDoc = {
  version: typeof PDF_STUDY_MARKS_VERSION;
  markedPages: number[];
  pages: Record<string, PdfStudyMarksPageLayer>;
};

export function emptyPdfStudyMarksDoc(): PdfStudyMarksDoc {
  return { version: PDF_STUDY_MARKS_VERSION, markedPages: [], pages: {} };
}

export const MAX_REGIONS_PER_PAGE = 48;
export const MAX_MARKED_PAGES = 120;
export const MAX_STROKES_PER_PAGE = 400;
export const MAX_POINTS_PER_STROKE = 4000;

export const PDF_INK_DEFAULT_COLOR = '#1a1a1a';
export const PDF_INK_DEFAULT_WIDTH = 2.5;
