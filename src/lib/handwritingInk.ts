/**
 * Production pen ink renderer (perfect-freehand).
 * Render-only — normalized stroke storage unchanged.
 */

import { getStroke } from 'perfect-freehand';
import type { HandwritingPoint, HandwritingStroke } from './handwritingTypes';

export type InkPresetId = 'math' | 'study';

/** Math workspace — corner-preserving, lighter weight. */
export const MATH_INK_PRESET = {
  sizeMultiplier: 1.08,
  thinning: 0.48,
  smoothing: 0.08,
  streamline: 0.06,
  defaultPressure: 0.5,
  minSizePx: 2,
} as const;

/**
 * Study notebook — dark, confident, legible at arm's length (Ink Pages).
 * Clarity-tuned: less smooth/streamline than presence pass to preserve letter separation.
 */
export const STUDY_INK_PRESET = {
  sizeMultiplier: 1.14,
  thinning: 0.42,
  smoothing: 0.18,
  streamline: 0.12,
  defaultPressure: 0.58,
  minSizePx: 2.5,
} as const;

/** Near-black pen on paper — not theme-muted UI text. */
export const STUDY_INK_COLOR = '#141416';

export const STUDY_PEN_WIDTH = 3.0;

const INK_PRESETS = {
  math: MATH_INK_PRESET,
  study: STUDY_INK_PRESET,
} as const;

export function getInkPreset(id: InkPresetId) {
  return INK_PRESETS[id];
}

type InkPoint = [number, number, number];

function strokeToInkPoints(
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  defaultPressure: number,
): InkPoint[] {
  return stroke.points.map(p => {
    const pressure =
      p.pressure !== undefined && p.pressure > 0 ? p.pressure : defaultPressure;
    return [p.x * canvasW, p.y * canvasH, pressure];
  });
}

export function strokeHasRealPressure(stroke: HandwritingStroke): boolean {
  return stroke.points.some(p => p.pressure !== undefined && p.pressure > 0);
}

/** Shared scale for commit mesh and draft ink (same renderer in ink draft mode). */
export function commitStrokeSizePx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
  preset: InkPresetId = 'math',
): number {
  const p = getInkPreset(preset);
  const baseSize = strokeWidth * (canvasW / Math.max(refWidth, 1));
  return Math.max(p.minSizePx, baseSize * p.sizeMultiplier);
}

function effectivePressure(p: HandwritingPoint | undefined, fallback = 0.5): number {
  if (p?.pressure !== undefined && p.pressure > 0) return p.pressure;
  return fallback;
}

/** Median mesh footprint at a given pressure — tuned to match committed ink width. */
export function draftPenLineWidthPx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
  pressure?: number,
  preset: InkPresetId = 'math',
): number {
  const size = commitStrokeSizePx(strokeWidth, canvasW, refWidth, preset);
  const p = pressure !== undefined && pressure > 0 ? pressure : 0.5;
  return Math.max(1.5, size * (0.78 + p * 0.44));
}

/**
 * Per-segment draft width — polyline rollback mode only.
 */
export function draftPenSegmentLineWidthPx(
  strokeWidth: number,
  canvasW: number,
  canvasH: number,
  refWidth: number,
  from: HandwritingPoint,
  to: HandwritingPoint,
  preset: InkPresetId = 'math',
): number {
  const size = commitStrokeSizePx(strokeWidth, canvasW, refWidth, preset);
  const p = (effectivePressure(from) + effectivePressure(to)) / 2;
  const dist = Math.hypot((to.x - from.x) * canvasW, (to.y - from.y) * canvasH);
  const speedFactor = Math.max(0.82, Math.min(1.04, 1.0 - dist * 0.008));
  return Math.max(1.5, size * (0.78 + p * 0.44) * speedFactor);
}

function studyDotRadiusPx(
  strokeWidth: number,
  canvasW: number,
  refWidth: number,
  pressure: number,
  preset: InkPresetId,
): number {
  const size = commitStrokeSizePx(strokeWidth, canvasW, refWidth, preset);
  return Math.max(preset === 'study' ? 1.35 : 1.15, size * (0.82 + pressure * 0.36)) / 2;
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

function inkStrokeOptions(
  stroke: HandwritingStroke,
  size: number,
  preset: InkPresetId,
) {
  const p = getInkPreset(preset);
  const subtleTaper = preset === 'study';
  return {
    size,
    thinning: p.thinning,
    smoothing: p.smoothing,
    streamline: p.streamline,
    simulatePressure: !strokeHasRealPressure(stroke),
    last: true,
    start: subtleTaper ? { taper: 0.08, cap: true } : { taper: false, cap: true },
    end: subtleTaper ? { taper: 0.12, cap: true } : { taper: false, cap: true },
  } as const;
}

/**
 * Shared pen ink renderer — commit layer and live draft (stroke continuity).
 */
export function drawPenStrokeInk(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
  preset: InkPresetId = 'math',
): void {
  if (stroke.tool !== 'pen' || stroke.points.length === 0) return;

  const inkPreset = getInkPreset(preset);
  const inkPoints = strokeToInkPoints(
    stroke,
    canvasW,
    canvasH,
    inkPreset.defaultPressure,
  );
  const size = commitStrokeSizePx(stroke.width, canvasW, refWidth, preset);

  if (inkPoints.length === 1) {
    const pt = inkPoints[0]!;
    const r = studyDotRadiusPx(stroke.width, canvasW, refWidth, pt[2], preset);
    ctx.beginPath();
    ctx.fillStyle = stroke.color;
    ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const outline = getStroke(inkPoints, inkStrokeOptions(stroke, size, preset));
  const path = inkPathFromOutline(outline);
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}

/** Math preset entry point (inline blocks, dev polyline compare). */
export function drawPenStrokeMathInk(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
): void {
  drawPenStrokeInk(ctx, stroke, canvasW, canvasH, refWidth, 'math');
}

/** Commit uses perfect-freehand; live draft mode is controlled by fwInkDraftMode. */
export const drawDraftPenStrokeMathInk = drawPenStrokeMathInk;
