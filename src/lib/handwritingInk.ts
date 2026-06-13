/**
 * Production pen ink renderer (perfect-freehand, mathInk preset).
 * Render-only — normalized stroke storage unchanged.
 */

import { getStroke } from 'perfect-freehand';
import type { HandwritingStroke } from './handwritingTypes';

/** Approved math handwriting preset (corner-preserving, not sketch). */
export const MATH_INK_PRESET = {
  sizeMultiplier: 1.08,
  thinning: 0.48,
  smoothing: 0.1,
  streamline: 0.08,
} as const;

type InkPoint = [number, number, number];

function strokeToInkPoints(
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
): InkPoint[] {
  return stroke.points.map(p => {
    const pressure =
      p.pressure !== undefined && p.pressure > 0 ? p.pressure : 0.5;
    return [p.x * canvasW, p.y * canvasH, pressure];
  });
}

export function strokeHasRealPressure(stroke: HandwritingStroke): boolean {
  return stroke.points.some(p => p.pressure !== undefined && p.pressure > 0);
}

/** Shared scale for commit mesh and draft polyline (no perfect-freehand on draft). */
export function commitStrokeSizePx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
): number {
  const baseSize = strokeWidth * (canvasW / Math.max(refWidth, 1));
  return Math.max(2, baseSize * MATH_INK_PRESET.sizeMultiplier);
}

/** Draft polyline width — tuned to match committed mathInk footprint while drawing. */
export function draftPenLineWidthPx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
  pressure?: number,
): number {
  const size = commitStrokeSizePx(strokeWidth, canvasW, refWidth);
  const p = pressure !== undefined && pressure > 0 ? pressure : 0.5;
  return Math.max(1.5, size * (0.62 + p * 0.46));
}

function inkPathFromOutline(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 2) return path;
  const [first, ...rest] = outline;
  if (!first) return path;
  path.moveTo(first[0]!, first[1]!);
  for (const pt of rest) {
    path.lineTo(pt[0]!, pt[1]!);
  }
  path.closePath();
  return path;
}

/** Render one committed pen stroke with mathInk (commit layer only). */
export function drawPenStrokeMathInk(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
): void {
  if (stroke.tool !== 'pen' || stroke.points.length === 0) return;

  const inkPoints = strokeToInkPoints(stroke, canvasW, canvasH);
  const size = commitStrokeSizePx(stroke.width, canvasW, refWidth);

  if (inkPoints.length === 1) {
    const p = inkPoints[0]!;
    const r = Math.max(1.5, size * 0.45);
    ctx.beginPath();
    ctx.fillStyle = stroke.color;
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const outline = getStroke(inkPoints, {
    size,
    thinning: MATH_INK_PRESET.thinning,
    smoothing: MATH_INK_PRESET.smoothing,
    streamline: MATH_INK_PRESET.streamline,
    simulatePressure: !strokeHasRealPressure(stroke),
    last: true,
    start: { taper: false, cap: true },
    end: { taper: false, cap: true },
  });

  const path = inkPathFromOutline(outline);
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}
