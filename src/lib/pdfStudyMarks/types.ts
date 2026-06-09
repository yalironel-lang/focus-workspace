/** PDF study marks — sidecar data (never embedded in PDF bytes). */

export const PDF_STUDY_MARKS_VERSION = 1 as const;

export type PdfHighlightRegion = {
  id: string;
  /** Normalized 0–1 relative to page viewport. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PdfStudyMarksPageLayer = {
  regions: PdfHighlightRegion[];
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
