/** PDF page/zoom controls lifted into StudySessionShell during Focus exam. */
export type StudyExamPdfControls = {
  page: number;
  pageCount?: number;
  zoom: number;
  ready: boolean;
  onPageDelta: (delta: number) => void;
  onZoomDelta: (delta: number) => void;
  onFitWidth: () => void;
};
