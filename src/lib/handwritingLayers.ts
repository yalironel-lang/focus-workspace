/**
 * Dual-layer handwriting rendering (Phase 1A).
 * Commit layer: perfect-freehand once per stroke, cached on hidden canvas.
 * Draft layer: incremental polyline on visible canvas while pen is down.
 */

import type { HandwritingStroke } from './handwritingTypes';
import {
  drawEraserStrokePolyline,
  drawPenStrokePolyline,
} from './handwritingGeometry';
import { drawPenStrokeMathInk, draftPenSegmentLineWidthPx } from './handwritingInk';

export type LayerCanvasMetrics = {
  w: number;
  h: number;
  dpr: number;
};

/** Match commit bitmap dimensions to the visible canvas (DPR-aware). */
export function syncCommitCanvasSize(
  commitCanvas: HTMLCanvasElement,
  metrics: LayerCanvasMetrics,
): void {
  const bw = Math.round(metrics.w * metrics.dpr);
  const bh = Math.round(metrics.h * metrics.dpr);
  if (commitCanvas.width !== bw || commitCanvas.height !== bh) {
    commitCanvas.width = bw;
    commitCanvas.height = bh;
  }
  const ctx = commitCanvas.getContext('2d');
  if (ctx) ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
}

export function getCommitLayerContext(
  commitCanvas: HTMLCanvasElement,
): CanvasRenderingContext2D | null {
  return commitCanvas.getContext('2d');
}

/** Full rebuild of commit cache — idle paths only (hydrate, undo, eraser, resize). */
export function rebuildCommitLayer(
  commitCtx: CanvasRenderingContext2D,
  strokes: HandwritingStroke[],
  canvasW: number,
  canvasH: number,
  refWidth: number,
): void {
  commitCtx.clearRect(0, 0, canvasW, canvasH);
  for (const stroke of strokes) {
    if (stroke.tool === 'pen') {
      drawPenStrokeMathInk(commitCtx, stroke, canvasW, canvasH, refWidth);
    }
  }
}

/** Append one committed pen stroke with perfect-freehand (pointerup only). */
export function appendCommittedStroke(
  commitCtx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
): void {
  if (stroke.tool !== 'pen' || stroke.points.length === 0) return;
  drawPenStrokeMathInk(commitCtx, stroke, canvasW, canvasH, refWidth);
}

/** Copy commit cache bitmap to visible canvas (replaces visible pixels). */
export function blitCommitLayer(
  visibleCtx: CanvasRenderingContext2D,
  commitCanvas: HTMLCanvasElement,
  canvasW: number,
  canvasH: number,
): void {
  visibleCtx.clearRect(0, 0, canvasW, canvasH);
  visibleCtx.drawImage(commitCanvas, 0, 0, canvasW, canvasH);
}

/**
 * Incremental draft ink on visible canvas (no perfect-freehand, no commit rebuild).
 * Returns the number of points now painted on the visible canvas.
 */
export function appendDraftStrokeSegment(
  visibleCtx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  paintedPointCount: number,
  canvasW: number,
  canvasH: number,
  refWidth: number,
): number {
  const points = stroke.points;
  if (points.length === 0) return paintedPointCount;

  if (stroke.tool === 'eraser') {
    return appendDraftEraserSegment(
      visibleCtx,
      stroke,
      paintedPointCount,
      canvasW,
      canvasH,
      refWidth,
    );
  }

  if (points.length === 1 && paintedPointCount === 0) {
    drawPenStrokePolyline(visibleCtx, stroke, canvasW, canvasH, refWidth);
    return 1;
  }

  if (points.length <= paintedPointCount) return paintedPointCount;

  if (paintedPointCount === 0) {
    drawPenStrokePolyline(
      visibleCtx,
      { ...stroke, points: [points[0]!] },
      canvasW,
      canvasH,
      refWidth,
    );
    paintedPointCount = 1;
  }

  if (points.length <= paintedPointCount) return paintedPointCount;

  const startIdx = Math.max(1, paintedPointCount);
  visibleCtx.lineCap = 'round';
  visibleCtx.lineJoin = 'round';
  visibleCtx.strokeStyle = stroke.color;
  for (let i = startIdx; i < points.length; i++) {
    const prev = points[i - 1]!;
    const p = points[i]!;
    visibleCtx.beginPath();
    visibleCtx.moveTo(prev.x * canvasW, prev.y * canvasH);
    visibleCtx.lineTo(p.x * canvasW, p.y * canvasH);
    visibleCtx.lineWidth = draftPenSegmentLineWidthPx(
      stroke.width,
      canvasW,
      canvasH,
      refWidth,
      prev,
      p,
    );
    visibleCtx.stroke();
  }

  return points.length;
}

function appendDraftEraserSegment(
  visibleCtx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  paintedPointCount: number,
  canvasW: number,
  canvasH: number,
  refWidth: number,
): number {
  const points = stroke.points;
  if (points.length === 0) return paintedPointCount;
  if (points.length <= paintedPointCount) return paintedPointCount;

  if (paintedPointCount === 0) {
    drawEraserStrokePolyline(
      visibleCtx,
      { ...stroke, points: [points[0]!] },
      canvasW,
      canvasH,
      refWidth,
    );
    paintedPointCount = 1;
  }

  if (points.length <= paintedPointCount) return paintedPointCount;

  const startIdx = Math.max(1, paintedPointCount);
  const prev = points[startIdx - 1]!;
  visibleCtx.beginPath();
  visibleCtx.moveTo(prev.x * canvasW, prev.y * canvasH);
  for (let i = startIdx; i < points.length; i++) {
    const p = points[i]!;
    visibleCtx.lineTo(p.x * canvasW, p.y * canvasH);
  }
  const base = stroke.width * (canvasW / Math.max(refWidth, 1));
  visibleCtx.strokeStyle = 'rgba(248,113,113,0.5)';
  visibleCtx.lineWidth = Math.max(1, base);
  visibleCtx.lineCap = 'round';
  visibleCtx.lineJoin = 'round';
  visibleCtx.stroke();

  return points.length;
}

/** Pure helper for tests — next painted index after one append pass. */
export function nextDraftPaintedCount(
  pointCount: number,
  paintedPointCount: number,
): number {
  if (pointCount <= 0) return paintedPointCount;
  if (paintedPointCount === 0) return Math.min(1, pointCount);
  return pointCount;
}
