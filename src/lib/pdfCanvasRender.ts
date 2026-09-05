/**
 * PDF.js canvas sizing for sharp Retina zoom.
 * Logical CSS size = viewport; backing = viewport × outputScale (capped).
 */

/** Cap DPR so in-window pages stay within memory on iPad Retina. */
export const PDF_OUTPUT_SCALE_CAP = 2;

/**
 * Soft pixel budget per page canvas (≈ 4096²).
 * Virtualization keeps only a few pages mounted; still avoid huge zoom×DPR spikes.
 */
export const PDF_MAX_CANVAS_PIXELS = 16_777_216;

export function clampPdfOutputScale(
  devicePixelRatio: number,
  cssWidth: number,
  cssHeight: number,
  cap = PDF_OUTPUT_SCALE_CAP,
  maxPixels = PDF_MAX_CANVAS_PIXELS,
): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  let scale = Math.min(Math.max(dpr, 1), cap);
  const area = Math.max(1, cssWidth) * Math.max(1, cssHeight);
  if (area * scale * scale > maxPixels) {
    scale = Math.sqrt(maxPixels / area);
  }
  return Math.max(1, scale);
}

export type PdfCanvasRenderMetrics = {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  outputScale: number;
  /** pdf.js render transform, or null when identity. */
  transform: [number, number, number, number, number, number] | null;
};

/** Map a PDF.js viewport + DPR to CSS and backing-store sizes. */
export function computePdfCanvasRenderMetrics(
  viewport: { width: number; height: number },
  devicePixelRatio: number,
): PdfCanvasRenderMetrics {
  const cssWidth = Math.max(1, Math.floor(viewport.width));
  const cssHeight = Math.max(1, Math.floor(viewport.height));
  const outputScale = clampPdfOutputScale(devicePixelRatio, cssWidth, cssHeight);
  const backingWidth = Math.max(1, Math.floor(cssWidth * outputScale));
  const backingHeight = Math.max(1, Math.floor(cssHeight * outputScale));
  const transform: PdfCanvasRenderMetrics['transform'] =
    outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
  return { cssWidth, cssHeight, backingWidth, backingHeight, outputScale, transform };
}

/** Fit-width × user zoom → PDF.js viewport scale (pre-DPR). */
export function computePdfFitZoomScale(containerWidth: number, pageWidthAtScale1: number, zoom: number): number {
  const w = Math.max(0, containerWidth);
  const base = pageWidthAtScale1 > 0 ? pageWidthAtScale1 : 1;
  const fitScale = w > 0 ? w / base : 1;
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return fitScale * z;
}
