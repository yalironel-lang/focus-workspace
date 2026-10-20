/**
 * CSS and backing-store sizes for the PDF.js scroll viewer.
 *
 * Zoom is a multiplier on fit-width. 100% means the page is as wide as the
 * pane. The CSS box always keeps the PDF page aspect. devicePixelRatio
 * changes the canvas backing store only.
 */

import { scrollTopForPage } from './pdfPageVisibility';

export const PDF_FIT_WIDTH_ZOOM = 1;
export const PDF_ZOOM_MIN = 0.5;
export const PDF_ZOOM_MAX = 2.5;
/** Longest canvas edge, in backing-store pixels. */
export const PDF_MAX_CANVAS_EDGE_PX = 4096;
/** Backing-store budget. 8 million pixels is about 32MB at 4 bytes per pixel. */
export const PDF_MAX_CANVAS_PIXELS = 8_000_000;
export const PDF_FIT_PAGE_PADDING_PX = 8;
export const PDF_RESIZE_DEBOUNCE_MS = 100;

export function pdfFitScale(paneWidth: number, firstPageWidthPt: number): number {
  if (!Number.isFinite(paneWidth) || paneWidth <= 0) return 1;
  if (!Number.isFinite(firstPageWidthPt) || firstPageWidthPt <= 0) return 1;
  return paneWidth / firstPageWidthPt;
}

export function pdfPageCssBox(
  pageWidthPt: number,
  pageHeightPt: number,
  fitScale: number,
  zoom: number,
): { cssWidth: number; cssHeight: number } {
  const scale = (Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1) * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  return {
    cssWidth: Math.max(1, pageWidthPt * scale),
    cssHeight: Math.max(1, pageHeightPt * scale),
  };
}

/**
 * Backing-store scale for a CSS page box. The cap shrinks both axes together,
 * so the bitmap keeps the page aspect.
 */
export function pdfOutputScale(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const width = Math.max(1, cssWidth);
  const height = Math.max(1, cssHeight);
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  let scale = dpr;
  const longest = Math.max(width, height);
  if (longest * scale > PDF_MAX_CANVAS_EDGE_PX) {
    scale = PDF_MAX_CANVAS_EDGE_PX / longest;
  }
  if (width * height * scale * scale > PDF_MAX_CANVAS_PIXELS) {
    scale = Math.sqrt(PDF_MAX_CANVAS_PIXELS / (width * height));
  }
  return scale;
}

export interface PdfCanvasRenderPlan {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  /** PDF.js transform scale along X. This is not a CSS transform. */
  outputScaleX: number;
  outputScaleY: number;
}

export function pdfCanvasRenderPlan(
  pageWidthPt: number,
  pageHeightPt: number,
  paneWidth: number,
  zoom: number,
  devicePixelRatio: number,
): PdfCanvasRenderPlan {
  const fitScale = pdfFitScale(paneWidth, pageWidthPt);
  const css = pdfPageCssBox(pageWidthPt, pageHeightPt, fitScale, zoom);
  const outputScale = pdfOutputScale(css.cssWidth, css.cssHeight, devicePixelRatio);
  const backingWidth = Math.max(1, Math.floor(css.cssWidth * outputScale));
  const backingHeight = Math.max(1, Math.floor(css.cssHeight * outputScale));
  return {
    cssWidth: css.cssWidth,
    cssHeight: css.cssHeight,
    backingWidth,
    backingHeight,
    outputScaleX: backingWidth / css.cssWidth,
    outputScaleY: backingHeight / css.cssHeight,
  };
}

export function pageScrollsHorizontally(cssWidth: number, paneWidth: number): boolean {
  return cssWidth > paneWidth + 0.5;
}

export function pageIsCenteredInPane(cssWidth: number, paneWidth: number): boolean {
  return cssWidth + 0.5 < paneWidth;
}

/** Zoom that makes one page's height fit the scrollport, without changing aspect. */
export function fitPageZoom(
  paneWidth: number,
  scrollportHeight: number,
  firstPageWidthPt: number,
  pageHeightPt: number,
): number {
  const fitScale = pdfFitScale(paneWidth, firstPageWidthPt);
  const heightAtFitWidth = pageHeightPt * fitScale;
  if (!Number.isFinite(heightAtFitWidth) || heightAtFitWidth <= 0) return PDF_FIT_WIDTH_ZOOM;
  const available = Math.max(1, scrollportHeight - PDF_FIT_PAGE_PADDING_PX);
  const raw = available / heightAtFitWidth;
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, raw));
}

export interface PdfScrollAnchor {
  page: number;
  /** Fraction of the anchored page that sits above the scrollport top. */
  offsetRatio: number;
  /** Fraction of the horizontal overflow. 0 when the page fits the pane. */
  horizontalRatio: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function capturePdfScrollAnchor(input: {
  scrollTop: number;
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  pageHeights: readonly number[];
  gap: number;
  page: number;
}): PdfScrollAnchor {
  const pageCount = input.pageHeights.length;
  const page = Math.max(1, Math.min(pageCount || 1, Math.floor(input.page) || 1));
  const pageTop = scrollTopForPage(page, input.pageHeights, input.gap);
  const pageHeight = input.pageHeights[page - 1] ?? 0;
  const offsetRatio = pageHeight > 0 ? clamp01((input.scrollTop - pageTop) / pageHeight) : 0;
  const overflow = Math.max(0, input.scrollWidth - input.clientWidth);
  const horizontalRatio = overflow > 1 ? clamp01(input.scrollLeft / overflow) : 0;
  return { page, offsetRatio, horizontalRatio };
}

export function scrollTopForAnchor(
  anchor: PdfScrollAnchor,
  pageHeights: readonly number[],
  gap: number,
): number {
  const pageTop = scrollTopForPage(anchor.page, pageHeights, gap);
  const pageHeight = pageHeights[anchor.page - 1] ?? 0;
  return pageTop + anchor.offsetRatio * pageHeight;
}

export function scrollLeftForAnchor(anchor: PdfScrollAnchor, scrollWidth: number, clientWidth: number): number {
  const overflow = Math.max(0, scrollWidth - clientWidth);
  return anchor.horizontalRatio * overflow;
}

/**
 * Times at which a debounced resize render would run. Events that arrive
 * within the debounce window collapse into one render.
 */
export function pdfResizeRenderTimes(eventTimes: readonly number[], debounceMs = PDF_RESIZE_DEBOUNCE_MS): number[] {
  if (eventTimes.length === 0) return [];
  const renders: number[] = [];
  let burstEnd = eventTimes[0];
  for (let i = 1; i < eventTimes.length; i++) {
    const time = eventTimes[i];
    if (time - burstEnd <= debounceMs) burstEnd = time;
    else {
      renders.push(burstEnd + debounceMs);
      burstEnd = time;
    }
  }
  renders.push(burstEnd + debounceMs);
  return renders;
}
