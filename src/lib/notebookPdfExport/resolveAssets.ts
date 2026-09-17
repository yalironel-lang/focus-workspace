/**
 * Read-only asset resolution for PDF export (images + handwriting).
 * Hydrates local caches only — never mutates manifests / GC / cloud writes.
 * Images are re-encoded as data URLs so the print document is self-contained.
 *
 * Handwriting: paints strokes then crops to stroke bounds (+ modest padding)
 * for export only — stored handwriting data is never rewritten.
 */

import { drawStrokes } from '../handwritingGeometry';
import { emptyHandwritingData, type HandwritingStroke } from '../handwritingTypes';
import { hwGet, hydrateHandwritingBlocks } from '../notebookHandwritingStore';
import { hydrateNotebookImages, nbImageGet, nbImageLoadBlob } from '../notebookImageStore';
import type { PdfAssetResolver } from './renderBlocksHtml';

export type ResolvedPdfAssets = PdfAssetResolver & {
  imageKeys: string[];
  handwritingKeys: string[];
};

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  try {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const b64 = btoa(binary);
    const type = blob.type || 'image/png';
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

async function resolveImageDataUrl(key: string): Promise<string | null> {
  const blob = await nbImageLoadBlob(key);
  if (blob) {
    const dataUrl = await blobToDataUrl(blob);
    if (dataUrl) return dataUrl;
  }
  const cached = nbImageGet(key);
  if (!cached) return null;
  if (cached.startsWith('data:')) return cached;
  try {
    const res = await fetch(cached);
    if (!res.ok) return null;
    return blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

/** Normalized stroke AABB in 0–1 canvas space, or null if empty. */
export function computeHandwritingStrokeBounds(
  strokes: readonly HandwritingStroke[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      any = true;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!any) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Paint strokes to PNG for export. Crops empty canvas margins using stroke
 * bounds + padding. Does not mutate the input strokes / stored asset.
 */
export function renderHandwritingPngDataUrl(data: {
  canvas: { width: number; height: number };
  strokes: HandwritingStroke[];
}): string | null {
  const w = Math.max(1, data.canvas.width || 400);
  const h = Math.max(1, data.canvas.height || 220);
  if (typeof document === 'undefined') return null;
  if (!data.strokes.length) return null;

  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  const fullCtx = full.getContext('2d');
  if (!fullCtx) return null;
  try {
    fullCtx.fillStyle = '#ffffff';
    fullCtx.fillRect(0, 0, w, h);
    drawStrokes(fullCtx, data.strokes, w, h, Math.min(w, h));
  } catch {
    return null;
  }

  const fullPng = (): string | null => {
    try {
      return full.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const bounds = computeHandwritingStrokeBounds(data.strokes);
  if (!bounds) return fullPng();

  // Modest padding in normalized space; clamp to canvas.
  const pad = 0.035;
  const x0 = Math.max(0, Math.floor((bounds.minX - pad) * w));
  const y0 = Math.max(0, Math.floor((bounds.minY - pad) * h));
  const x1 = Math.min(w, Math.ceil((bounds.maxX + pad) * w));
  const y1 = Math.min(h, Math.ceil((bounds.maxY + pad) * h));
  const cropW = Math.max(1, x1 - x0);
  const cropH = Math.max(1, y1 - y0);

  // If crop barely shrinks the canvas, keep the full paint (avoid tiny artifacts).
  if (cropW * cropH > w * h * 0.92) {
    return fullPng();
  }

  try {
    const cropped = document.createElement('canvas');
    cropped.width = cropW;
    cropped.height = cropH;
    const cropCtx = cropped.getContext('2d');
    if (!cropCtx) return fullPng();
    cropCtx.fillStyle = '#ffffff';
    cropCtx.fillRect(0, 0, cropW, cropH);
    cropCtx.drawImage(full, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
    return cropped.toDataURL('image/png');
  } catch {
    return fullPng();
  }
}

/**
 * Resolve image + handwriting assets for export.
 * Read-only: hydrate local IDB into memory cache; no GC / no cloud reconcile required.
 */
export async function resolvePdfAssets(opts: {
  objectId: string | undefined;
  imageKeys: string[];
  handwritingKeys: string[];
}): Promise<ResolvedPdfAssets> {
  const imageKeys = [...new Set(opts.imageKeys.filter(Boolean))];
  const handwritingKeys = [...new Set(opts.handwritingKeys.filter(Boolean))];

  if (imageKeys.length) {
    await hydrateNotebookImages(imageKeys);
  }
  if (opts.objectId && handwritingKeys.length) {
    await hydrateHandwritingBlocks(opts.objectId, handwritingKeys);
  }

  const imageMap = new Map<string, string | null>();
  for (const key of imageKeys) {
    imageMap.set(key, await resolveImageDataUrl(key));
  }

  const hwMap = new Map<string, string | null>();
  if (opts.objectId) {
    for (const key of handwritingKeys) {
      const data = (await hwGet(opts.objectId, key)) ?? emptyHandwritingData(400, 220);
      hwMap.set(key, renderHandwritingPngDataUrl(data));
    }
  }

  return {
    imageKeys,
    handwritingKeys,
    imageSrc: (key: string) => (key ? imageMap.get(key) ?? null : null),
    handwritingSrc: (key: string) => hwMap.get(key) ?? null,
  };
}
