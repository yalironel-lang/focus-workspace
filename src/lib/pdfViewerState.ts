/**
 * PDF viewer state normalization and ingestion merge helpers.
 * Used by Free Space pdf / studyfile (pdf kind) objects.
 */

export interface PdfViewerStateSlice {
  page: number;
  zoom: number;
  fileName?: string;
  fileSize?: number;
}

export interface PdfFileIdentity {
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface PdfIngestionSpatialMeta {
  pageCount?: number;
  documentTitle?: string;
}

/** Clamp page to [1, pageCount] when pageCount is known; invalid values → 1. */
export function normalizePdfPage(page: unknown, pageCount?: number | null): number {
  const raw = typeof page === 'number' && Number.isFinite(page) ? Math.floor(page) : Number.NaN;
  let normalized = Number.isFinite(raw) && raw >= 1 ? raw : 1;
  if (typeof pageCount === 'number' && Number.isFinite(pageCount) && pageCount > 0) {
    normalized = Math.min(normalized, pageCount);
  }
  return normalized;
}

/** Clamp zoom to viewer range; invalid values → fallback (default 1). */
export function normalizePdfZoom(zoom: unknown, fallback = 1): number {
  const raw = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : Number.NaN;
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(2.5, Math.max(0.5, raw));
}

export function bumpPdfPage(current: number, delta: number, pageCount?: number | null): number {
  return normalizePdfPage(current + delta, pageCount);
}

/**
 * Apply natural-scroll visible page to PDF object content (immediate, no viewer debounce).
 * Returns null when page is unchanged.
 */
export function applyPdfVisiblePageToContent<
  T extends { type: 'pdf'; page: number; pageCount?: number },
>(content: T, visiblePage: number): T | null {
  const nextPage = normalizePdfPage(visiblePage, content.pageCount);
  if (nextPage === content.page) return null;
  return { ...content, page: nextPage };
}

/** Toolbar / chrome: live viewer page — not persisted content.page. */
export function pdfToolbarDisplayPage(visiblePage: number, pageCount?: number | null): number {
  return normalizePdfPage(visiblePage, pageCount);
}

export function formatPdfToolbarPageLabel(page: number, pageCount?: number): string {
  return pageCount ? `Page ${page} / ${pageCount}` : `Page ${page}`;
}

/**
 * True when replacing the attached file on an existing object (not materializing→ready).
 */
export function isPdfFileReplacement(
  existing: Pick<PdfViewerStateSlice, 'fileName' | 'fileSize'> | null | undefined,
  incoming: Pick<PdfFileIdentity, 'fileName' | 'fileSize'>,
): boolean {
  if (!existing?.fileName) return false;
  if (existing.fileName !== incoming.fileName) return true;
  if (
    typeof existing.fileSize === 'number' &&
    existing.fileSize > 0 &&
    incoming.fileSize > 0 &&
    existing.fileSize !== incoming.fileSize
  ) {
    return true;
  }
  return false;
}

export interface PdfReadyContent extends PdfFileIdentity {
  type: 'pdf';
  lastOpenedAt: number;
  page: number;
  zoom: number;
  ingestionPhase: 'ready';
  pageCount?: number;
  documentTitle?: string;
}

/**
 * Build ready-state PDF content after ingestion.
 * Preserves page/zoom for the same file (materializing → ready).
 * Resets viewer state only when the incoming file identity differs.
 */
export function mergePdfIngestionReadyContent(
  existing: PdfViewerStateSlice | null | undefined,
  file: PdfFileIdentity,
  spatial: PdfIngestionSpatialMeta | null | undefined,
): PdfReadyContent {
  const pageCount =
    typeof spatial?.pageCount === 'number' && spatial.pageCount > 0 ? spatial.pageCount : undefined;
  const replaced = isPdfFileReplacement(existing, file);

  const page = replaced ? 1 : normalizePdfPage(existing?.page ?? 1, pageCount);
  const zoom = replaced ? 1 : normalizePdfZoom(existing?.zoom ?? 1);

  return {
    type: 'pdf',
    fileName: file.fileName,
    fileType: file.fileType,
    fileSize: file.fileSize,
    lastOpenedAt: Date.now(),
    page,
    zoom,
    ingestionPhase: 'ready',
    ...(pageCount !== undefined ? { pageCount } : {}),
    ...(spatial?.documentTitle ? { documentTitle: spatial.documentTitle } : {}),
  };
}
