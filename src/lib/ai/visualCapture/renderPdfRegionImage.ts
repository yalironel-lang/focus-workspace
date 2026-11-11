/**
 * Visual Capture — high-fidelity PDF region rendering (lossless PNG with JPEG fallback).
 *
 * Export scale dynamically targets a region long edge of ~1280px (up to 3.0x scale / ~216 DPI),
 * rather than downscaling the entire page to 1280px.
 * Preserves selection coordinates across zoom levels and page rotations.
 * Modest crop padding is added, strictly clamped to page bounds.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import { isInvalidCaptureRegionGeometry } from '../tutor/captureRegionDiagnostics';
import {
  MAX_ASK_COURSE_VISUAL_BODY_BYTES,
  MAX_VISUAL_SELECTION_IMAGE_BYTES,
  MAX_VISUAL_SELECTION_LONG_EDGE_PX,
} from './visualSelectionContract';

export type CropRectPx = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/**
 * Map normalized page region to integer pixel crop on a page bitmap of known size.
 * Adds modest padding to prevent clipping mathematical exponents, primes, and subscripts,
 * strictly clamped to the page bitmap bounds.
 */
export function normalizedRegionToCropRect(
  region: NormalizedPageRegion,
  pageWidthPx: number,
  pageHeightPx: number,
  paddingPx: number = 0,
): CropRectPx | null {
  if (isInvalidCaptureRegionGeometry(region)) return null;
  if (pageWidthPx < 1 || pageHeightPx < 1) return null;

  const rawX0 = Math.floor(region.x * pageWidthPx + 1e-6);
  const rawY0 = Math.floor(region.y * pageHeightPx + 1e-6);
  const rawX1 = Math.ceil((region.x + region.w) * pageWidthPx - 1e-6);
  const rawY1 = Math.ceil((region.y + region.h) * pageHeightPx - 1e-6);

  const x0 = Math.max(0, rawX0 - paddingPx);
  const y0 = Math.max(0, rawY0 - paddingPx);
  const x1 = Math.min(pageWidthPx, rawX1 + paddingPx);
  const y1 = Math.min(pageHeightPx, rawY1 + paddingPx);

  const sw = x1 - x0;
  const sh = y1 - y0;
  if (sw < 1 || sh < 1) return null;
  return { sx: x0, sy: y0, sw, sh };
}

/** Legacy export scale helper — long edge equals targetLongEdgePx across full page. */
export function exportScaleForPage(
  pageWidthPt: number,
  pageHeightPt: number,
  targetLongEdgePx: number = MAX_VISUAL_SELECTION_LONG_EDGE_PX,
): number {
  const longPt = Math.max(pageWidthPt, pageHeightPt);
  if (longPt <= 0) return 1;
  const target = Math.min(MAX_VISUAL_SELECTION_LONG_EDGE_PX, Math.max(64, targetLongEdgePx));
  return target / longPt;
}

/**
 * High-fidelity export scale: scales the page so the CROPPED REGION long edge
 * approaches targetLongEdgePx (capped at 4.5x / ~324 DPI).
 * Because region-first rendering allocates canvas memory only for the cropped region,
 * full-page dimensions do not constrain small mathematical selections.
 */
export function exportScaleForRegion(
  pageWidthPt: number,
  pageHeightPt: number,
  region: NormalizedPageRegion,
  targetLongEdgePx: number = MAX_VISUAL_SELECTION_LONG_EDGE_PX,
): number {
  const regWidthPt = Math.max(1, region.w * pageWidthPt);
  const regHeightPt = Math.max(1, region.h * pageHeightPt);
  const regLongPt = Math.max(regWidthPt, regHeightPt);
  const target = Math.min(MAX_VISUAL_SELECTION_LONG_EDGE_PX, Math.max(64, targetLongEdgePx));
  const idealScale = target / regLongPt;

  const maxAllowedScale = 4096 / Math.max(1, regLongPt);
  const maxScale = Math.min(4.5, maxAllowedScale);
  return Math.min(maxScale, Math.max(0.1, idealScale));
}

export type RenderPdfRegionImageResult =
  | {
      ok: true;
      mime: 'image/png' | 'image/jpeg';
      widthPx: number;
      heightPx: number;
      bytes: Uint8Array;
      /** data URL for Gateway multimodal part — not persisted by this helper */
      dataUrl: string;
    }
  | {
      ok: false;
      code: 'invalid_region' | 'invalid_page' | 'render_failed' | 'encode_failed' | 'too_large';
    };

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/(?:jpeg|png);base64,(.+)$/i.exec(dataUrl);
  if (!m?.[1]) return null;
  try {
    const bin = atob(m[1]);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Encode an image canvas to lossless PNG if within maxBytes,
 * stepping JPEG quality down if budget requires it.
 * Clamps long edge to maxLongEdgePx if needed.
 */
export function encodeCanvasToImage(
  canvas: HTMLCanvasElement,
  opts?: {
    maxBytes?: number;
    maxBase64Chars?: number;
    qualityStart?: number;
    maxLongEdgePx?: number;
  },
): RenderPdfRegionImageResult {
  const maxLong = opts?.maxLongEdgePx ?? MAX_VISUAL_SELECTION_LONG_EDGE_PX;
  let outW = canvas.width;
  let outH = canvas.height;
  const long = Math.max(outW, outH);

  let targetCanvas: HTMLCanvasElement = canvas;
  let createdDownsampleCanvas = false;

  if (long > maxLong) {
    const s = maxLong / long;
    outW = Math.max(1, Math.floor(outW * s));
    outH = Math.max(1, Math.floor(outH * s));
    try {
      targetCanvas = document.createElement('canvas');
      createdDownsampleCanvas = true;
      targetCanvas.width = outW;
      targetCanvas.height = outH;
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return { ok: false, code: 'render_failed' };
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, outW, outH);
    } catch {
      return { ok: false, code: 'render_failed' };
    }
  }

  const cleanupDownsample = () => {
    if (createdDownsampleCanvas) {
      targetCanvas.width = 0;
      targetCanvas.height = 0;
    }
  };

  const maxBytes = opts?.maxBytes ?? MAX_VISUAL_SELECTION_IMAGE_BYTES;
  // Ensure that encoded Base64 also leaves safe headroom (at least 2048 bytes) for JSON envelope
  const maxBase64 = opts?.maxBase64Chars ?? (MAX_ASK_COURSE_VISUAL_BODY_BYTES - 2048);

  // 1. Try lossless PNG first (sharpest rendering for mathematical symbols and primes)
  try {
    const pngDataUrl = targetCanvas.toDataURL('image/png');
    const pngBase64Len = pngDataUrl.length - 'data:image/png;base64,'.length;
    const pngBytes = dataUrlToBytes(pngDataUrl);
    if (pngBytes && pngBytes.byteLength <= maxBytes && pngBase64Len <= maxBase64) {
      cleanupDownsample();
      return {
        ok: true,
        mime: 'image/png',
        widthPx: outW,
        heightPx: outH,
        bytes: pngBytes,
        dataUrl: pngDataUrl,
      };
    }
  } catch {
    // fall through to JPEG
  }

  // 2. Fall back to JPEG with quality stepping if PNG exceeds budget
  let quality = opts?.qualityStart ?? 0.88;
  for (let attempt = 0; attempt < 6; attempt++) {
    let dataUrl: string;
    try {
      dataUrl = targetCanvas.toDataURL('image/jpeg', quality);
    } catch {
      cleanupDownsample();
      return { ok: false, code: 'encode_failed' };
    }
    const b64Len = dataUrl.length - 'data:image/jpeg;base64,'.length;
    const bytes = dataUrlToBytes(dataUrl);
    if (!bytes) {
      cleanupDownsample();
      return { ok: false, code: 'encode_failed' };
    }
    if (bytes.byteLength <= maxBytes && b64Len <= maxBase64) {
      cleanupDownsample();
      return {
        ok: true,
        mime: 'image/jpeg',
        widthPx: outW,
        heightPx: outH,
        bytes,
        dataUrl,
      };
    }
    quality = Math.max(0.4, quality - 0.1);
  }

  // 3. Bounded downscale retry (0.75x) if lowest quality JPEG still exceeds wire budget
  if (outW > 480 && outH > 480) {
    const scaledW = Math.max(1, Math.floor(outW * 0.75));
    const scaledH = Math.max(1, Math.floor(outH * 0.75));
    try {
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = scaledW;
      scaledCanvas.height = scaledH;
      const sCtx = scaledCanvas.getContext('2d');
      if (sCtx) {
        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, scaledW, scaledH);
        sCtx.drawImage(targetCanvas, 0, 0, outW, outH, 0, 0, scaledW, scaledH);
        for (const q of [0.80, 0.65, 0.50, 0.40]) {
          const dataUrl = scaledCanvas.toDataURL('image/jpeg', q);
          const b64Len = dataUrl.length - 'data:image/jpeg;base64,'.length;
          const bytes = dataUrlToBytes(dataUrl);
          if (bytes && bytes.byteLength <= maxBytes && b64Len <= maxBase64) {
            cleanupDownsample();
            scaledCanvas.width = 0;
            scaledCanvas.height = 0;
            return {
              ok: true,
              mime: 'image/jpeg',
              widthPx: scaledW,
              heightPx: scaledH,
              bytes,
              dataUrl,
            };
          }
        }
        scaledCanvas.width = 0;
        scaledCanvas.height = 0;
      }
    } catch {
      // fall through to too_large
    }
  }

  cleanupDownsample();
  return { ok: false, code: 'too_large' };
}

/**
 * Crop an already-rendered page canvas to a normalized region with modest padding,
 * encoding to lossless PNG if within budget, or JPEG with quality stepping if needed.
 */
export function cropPageCanvasToImage(
  pageCanvas: HTMLCanvasElement,
  region: NormalizedPageRegion,
  opts?: { maxBytes?: number; qualityStart?: number; paddingPx?: number; maxLongEdgePx?: number },
): RenderPdfRegionImageResult {
  const paddingPx = opts?.paddingPx ?? 8;
  const crop = normalizedRegionToCropRect(region, pageCanvas.width, pageCanvas.height, paddingPx);
  if (!crop) return { ok: false, code: 'invalid_region' };

  let cropped: HTMLCanvasElement;
  try {
    cropped = document.createElement('canvas');
    cropped.width = crop.sw;
    cropped.height = crop.sh;
    const ctx = cropped.getContext('2d');
    if (!ctx) return { ok: false, code: 'render_failed' };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, crop.sw, crop.sh);
    ctx.drawImage(pageCanvas, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh);
  } catch {
    return { ok: false, code: 'render_failed' };
  }

  const result = encodeCanvasToImage(cropped, {
    maxBytes: opts?.maxBytes,
    qualityStart: opts?.qualityStart,
    maxLongEdgePx: opts?.maxLongEdgePx ?? MAX_VISUAL_SELECTION_LONG_EDGE_PX,
  });
  cropped.width = 0;
  cropped.height = 0;
  return result;
}

/** Backward-compatible alias for tests and existing callers. */
export const cropPageCanvasToJpeg = cropPageCanvasToImage;

/**
 * High-fidelity region-first render of one PDF page selection.
 * Directly allocates a crop-sized canvas and shifts the viewport origin,
 * avoiding the high memory footprint of full-page canvas allocation.
 * Preserves selection coordinates across zoom levels and page rotations.
 * Falls back safely to two-pass render if region-first render fails.
 */
export async function renderPdfRegionImage(input: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  region: NormalizedPageRegion;
  targetLongEdgePx?: number;
  maxBytes?: number;
}): Promise<RenderPdfRegionImageResult> {
  if (isInvalidCaptureRegionGeometry(input.region)) {
    return { ok: false, code: 'invalid_region' };
  }
  if (
    !Number.isInteger(input.pageNumber) ||
    input.pageNumber < 1 ||
    input.pageNumber > input.pdf.numPages
  ) {
    return { ok: false, code: 'invalid_page' };
  }

  const targetLongEdge = input.targetLongEdgePx ?? MAX_VISUAL_SELECTION_LONG_EDGE_PX;

  try {
    const page = await input.pdf.getPage(input.pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = exportScaleForRegion(base.width, base.height, input.region, targetLongEdge);
    const viewport = page.getViewport({ scale });

    const paddingPx = 8;
    const crop = normalizedRegionToCropRect(input.region, viewport.width, viewport.height, paddingPx);
    if (!crop) return { ok: false, code: 'invalid_region' };

    // Primary path: Region-first render directly into crop-sized canvas
    try {
      const canvas = document.createElement('canvas');
      canvas.width = crop.sw;
      canvas.height = crop.sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_context_failed');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, crop.sw, crop.sh);

      // Shift the viewport by -crop.sx, -crop.sy so the crop aligns with canvas (0, 0)
      const croppedViewport = viewport.clone({ offsetX: -crop.sx, offsetY: -crop.sy });
      await page.render({ canvas, canvasContext: ctx, viewport: croppedViewport }).promise;

      const result = encodeCanvasToImage(canvas, {
        maxBytes: input.maxBytes,
        maxLongEdgePx: targetLongEdge,
      });

      // Cleanup canvas memory backing store
      canvas.width = 0;
      canvas.height = 0;
      return result;
    } catch (regionFirstError) {
      // Memory-bounded fallback: full-page render clamped to safe scale
      const safeFallbackScale = Math.min(scale, 4096 / Math.max(1, base.width, base.height), 3.0);
      const fallbackViewport = page.getViewport({ scale: safeFallbackScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(fallbackViewport.width));
      canvas.height = Math.max(1, Math.floor(fallbackViewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return { ok: false, code: 'render_failed' };

      await page.render({ canvas, canvasContext: ctx, viewport: fallbackViewport }).promise;
      const result = cropPageCanvasToImage(canvas, input.region, {
        maxBytes: input.maxBytes,
        maxLongEdgePx: targetLongEdge,
      });
      canvas.width = 0;
      canvas.height = 0;
      return result;
    }
  } catch {
    return { ok: false, code: 'render_failed' };
  }
}

/**
 * Security/product invariant: this helper never writes to IndexedDB, Storage,
 * or disk. Callers must not persist `dataUrl` / `bytes` in tutor session storage.
 */
export const REGION_IMAGE_PERSISTENCE_POLICY = 'ephemeral_request_only' as const;

