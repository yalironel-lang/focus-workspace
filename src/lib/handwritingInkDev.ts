/**
 * Dev-only ink renderer spike (perfect-freehand).
 * Loaded dynamically — not used in production render path.
 */

import { getStroke } from 'perfect-freehand';
import type { HandwritingStroke } from './handwritingTypes';
import { getHwSpikeSettings, useFixedPressure } from './handwritingSpikeDebug';

type InkPoint = [number, number, number];

function strokeToInkPoints(
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
): InkPoint[] {
  return stroke.points.map(p => {
    const pressure = useFixedPressure()
      ? 0.5
      : p.pressure !== undefined && p.pressure > 0
        ? p.pressure
        : 0.5;
    return [p.x * canvasW, p.y * canvasH, pressure];
  });
}

function hasRealPressure(stroke: HandwritingStroke): boolean {
  return stroke.points.some(p => p.pressure !== undefined && p.pressure > 0);
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

/** Render one pen stroke with perfect-freehand (dev A/B only). */
export function drawPenStrokeInkDev(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
  opts?: { isDraft?: boolean },
): void {
  if (stroke.tool !== 'pen' || stroke.points.length === 0) return;

  const inkPoints = strokeToInkPoints(stroke, canvasW, canvasH);
  if (inkPoints.length === 1) {
    const p = inkPoints[0]!;
    const r = Math.max(1.5, stroke.width * (canvasW / Math.max(refWidth, 1)) * 0.5);
    ctx.beginPath();
    ctx.fillStyle = stroke.color;
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const size = stroke.width * (canvasW / Math.max(refWidth, 1)) * 1.15;
  const lowSmooth = getHwSpikeSettings().smoothing === 'low';
  const outline = getStroke(inkPoints, {
    size: Math.max(2, size),
    thinning: lowSmooth ? 0.5 : 0.62,
    smoothing: lowSmooth ? 0.15 : 0.55,
    streamline: lowSmooth ? 0.12 : 0.45,
    simulatePressure: !useFixedPressure() && !hasRealPressure(stroke),
    last: opts?.isDraft !== true,
    start: { taper: !lowSmooth, cap: true },
    end: { taper: !lowSmooth, cap: true },
  });

  const path = inkPathFromOutline(outline);
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}
