import type { PdfStudyMarksChrome } from '../pdfStudyMarks/usePdfStudyMarks';

/** PDF page/zoom controls lifted into StudySessionShell during Focus exam. */
export type StudyExamPdfControls = {
  page: number;
  pageCount?: number;
  zoom: number;
  ready: boolean;
  onPageDelta: (delta: number) => void;
  onZoomDelta: (delta: number) => void;
  onFitWidth: () => void;
  /** Study marks (page flags + highlight regions) — set from FreeSpacePdfCard in study session. */
  marks?: PdfStudyMarksChrome | null;
};
