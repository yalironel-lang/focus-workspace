import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import { clamp01 } from '../../pdfGeometry/normFromClient';

export const TUTOR_CAPTURE_MIN_NORM = 0.01;

export function regionFromDragCorners(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  minNorm: number = TUTOR_CAPTURE_MIN_NORM,
): NormalizedPageRegion | null {
  const x1 = clamp01(Math.min(startX, endX));
  const y1 = clamp01(Math.min(startY, endY));
  const x2 = clamp01(Math.max(startX, endX));
  const y2 = clamp01(Math.max(startY, endY));
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < minNorm || h < minNorm) return null;
  return { x: x1, y: y1, w, h };
}
