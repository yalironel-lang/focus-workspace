import type { HandwritingPoint, HandwritingStroke } from './handwritingTypes';
import { hwDiagRecordPressure } from './handwritingDiagnostics';
import {
  pickPointerEventsForSample,
  recordPointerSamplePick,
} from './handwritingPointerSamples';
import { drawPenStrokeMathInk } from './handwritingInk';
import { isHandwritingDevBuild } from './handwritingRenderMode';
import {
  getMinPointDistNorm,
  getHwSpikeSettings,
  hwSpikeLog,
  recordPointAppended,
  recordPointDropped,
  useFixedPressure,
} from './handwritingSpikeDebug';

let inkModuleFailed = false;

/** Optional preload for tests / dev; production uses static mathInk import. */
export function preloadInkRenderer(): Promise<void> {
  return Promise.resolve();
}

function drawPenStrokePolyline(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
): void {
  if (stroke.points.length < 2) {
    if (stroke.points.length === 1) {
      const p = stroke.points[0]!;
      const x = p.x * canvasW;
      const y = p.y * canvasH;
      ctx.beginPath();
      ctx.fillStyle = stroke.color;
      ctx.arc(x, y, strokeWidthPx(stroke, canvasW, refWidth, p) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.beginPath();
  const first = stroke.points[0]!;
  ctx.moveTo(first.x * canvasW, first.y * canvasH);
  for (let i = 1; i < stroke.points.length; i++) {
    const p = stroke.points[i]!;
    ctx.lineTo(p.x * canvasW, p.y * canvasH);
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = strokeWidthPx(
    stroke,
    canvasW,
    refWidth,
    stroke.points[stroke.points.length - 1],
  );
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  canvasW: number,
  canvasH: number,
  refWidth: number,
  opts?: { isDraft?: boolean },
): void {
  if (stroke.tool === 'eraser') {
    if (stroke.points.length < 2) return;
    ctx.beginPath();
    const first = stroke.points[0]!;
    ctx.moveTo(first.x * canvasW, first.y * canvasH);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]!;
      ctx.lineTo(p.x * canvasW, p.y * canvasH);
    }
    ctx.strokeStyle = 'rgba(248,113,113,0.5)';
    ctx.lineWidth = strokeWidthPx(
      stroke,
      canvasW,
      refWidth,
      stroke.points[stroke.points.length - 1],
    );
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    return;
  }

  const devForcePolyline =
    isHandwritingDevBuild() && getHwSpikeSettings().render === 'polyline';

  if (!devForcePolyline && !inkModuleFailed) {
    try {
      drawPenStrokeMathInk(ctx, stroke, canvasW, canvasH, refWidth, opts);
      return;
    } catch (err) {
      console.warn('[handwriting] mathInk render failed; falling back to polyline.', err);
      inkModuleFailed = true;
    }
  }

  drawPenStrokePolyline(ctx, stroke, canvasW, canvasH, refWidth);
}

export function clientToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): HandwritingPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  };
}

/** True when ancestor CSS transforms scale the canvas vs its layout box (e.g. free-space zoom). */
export function canvasHasVisualScale(canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();
  return (
    Math.abs(canvas.offsetWidth - rect.width) > 1 ||
    Math.abs(canvas.offsetHeight - rect.height) > 1
  );
}

/**
 * Map a pointer sample to normalized canvas coordinates.
 * clientX/clientY + getBoundingClientRect() is the single source of truth
 * (works for desk, free-space zoom, and Safari Apple Pencil).
 */
export function pointerToNormalized(
  canvas: HTMLCanvasElement,
  e: Pick<PointerEvent, 'clientX' | 'clientY'>,
): HandwritingPoint | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const localX = e.clientX - rect.left;
  const localY = e.clientY - rect.top;

  return {
    x: Math.max(0, Math.min(1, localX / rect.width)),
    y: Math.max(0, Math.min(1, localY / rect.height)),
  };
}

export function readVisualViewportMetrics(): {
  offsetLeft: number;
  offsetTop: number;
  scale: number;
  width: number;
  height: number;
} | null {
  if (typeof window === 'undefined') return null;
  const vv = window.visualViewport;
  if (!vv) return null;
  return {
    offsetLeft: vv.offsetLeft,
    offsetTop: vv.offsetTop,
    scale: vv.scale,
    width: vv.width,
    height: vv.height,
  };
}

export function appendPoint(
  points: HandwritingPoint[],
  next: HandwritingPoint,
  pressure?: number,
): HandwritingPoint[] {
  const p: HandwritingPoint = { ...next };
  if (pressure !== undefined && Number.isFinite(pressure) && pressure > 0) {
    p.pressure = Math.max(0, Math.min(1, pressure));
  }
  const last = points[points.length - 1];
  if (last) {
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const minDist = getMinPointDistNorm();
    if (dx * dx + dy * dy < minDist * minDist) {
      if (isHandwritingDevBuild()) recordPointDropped();
      return points;
    }
  }
  if (isHandwritingDevBuild()) recordPointAppended();
  return [...points, p];
}

export function strokeBounds(stroke: HandwritingStroke): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (!stroke.points.length) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of stroke.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function expandBounds(
  b: { minX: number; minY: number; maxX: number; maxY: number },
  pad: number,
) {
  return {
    minX: Math.max(0, b.minX - pad),
    minY: Math.max(0, b.minY - pad),
    maxX: Math.min(1, b.maxX + pad),
    maxY: Math.min(1, b.maxY + pad),
  };
}

function boundsIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Stroke-level eraser: remove pen strokes whose bounds intersect eraser path bounds. */
export function strokesAfterEraser(
  strokes: HandwritingStroke[],
  eraserPoints: HandwritingPoint[],
  eraserRadiusNorm = 0.02,
): HandwritingStroke[] {
  if (eraserPoints.length === 0) return strokes;
  let eMinX = 1;
  let eMinY = 1;
  let eMaxX = 0;
  let eMaxY = 0;
  for (const p of eraserPoints) {
    eMinX = Math.min(eMinX, p.x);
    eMinY = Math.min(eMinY, p.y);
    eMaxX = Math.max(eMaxX, p.x);
    eMaxY = Math.max(eMaxY, p.y);
  }
  const eraserBox = expandBounds({ minX: eMinX, minY: eMinY, maxX: eMaxX, maxY: eMaxY }, eraserRadiusNorm);
  return strokes.filter(s => {
    if (s.tool !== 'pen') return true;
    const b = strokeBounds(s);
    if (!b) return true;
    return !boundsIntersect(expandBounds(b, eraserRadiusNorm * 0.5), eraserBox);
  });
}

function effectivePressure(p: HandwritingPoint | undefined, fallback = 0.5): number {
  if (isHandwritingDevBuild() && useFixedPressure()) return 0.5;
  if (p?.pressure !== undefined && p.pressure > 0) return p.pressure;
  return fallback;
}

function strokeWidthPx(
  stroke: HandwritingStroke,
  canvasW: number,
  refWidth: number,
  p?: HandwritingPoint,
): number {
  const base = stroke.width * (canvasW / Math.max(refWidth, 1));
  const pressure = stroke.tool === 'pen' ? effectivePressure(p) : 1;
  return Math.max(1, base * (0.35 + pressure * 0.85));
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: HandwritingStroke[],
  canvasW: number,
  canvasH: number,
  refWidth: number,
  draftStroke?: HandwritingStroke | null,
): void {
  ctx.clearRect(0, 0, canvasW, canvasH);
  const all = draftStroke ? [...strokes, draftStroke] : strokes;
  for (let i = 0; i < all.length; i++) {
    const stroke = all[i]!;
    const isDraft = draftStroke != null && i === all.length - 1;
    drawStroke(ctx, stroke, canvasW, canvasH, refWidth, { isDraft });
  }
}

/** Apple Pencil / stylus and desktop mouse draw ink; finger touch scrolls. */
export function isInkPointer(e: Pick<PointerEvent, 'pointerType'>): boolean {
  return e.pointerType === 'pen' || e.pointerType === 'mouse';
}

export function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let moveLogCounter = 0;

export function logPointerCoordinateSample(
  canvas: HTMLCanvasElement,
  ev: Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerType' | 'pressure'> & {
    offsetX?: number;
    offsetY?: number;
  },
  phase: 'down' | 'move',
): void {
  if (!isHandwritingDevBuild()) return;
  if (phase === 'move') {
    moveLogCounter += 1;
    if (moveLogCounter % 12 !== 0) return;
  }
  const rect = canvas.getBoundingClientRect();
  const pt = pointerToNormalized(canvas, ev);
  if (!pt) return;
  const localX = ev.clientX - rect.left;
  const localY = ev.clientY - rect.top;
  hwSpikeLog('H-A', 'handwritingGeometry', `pointer ${phase}`, {
    phase,
    pointerType: ev.pointerType,
    clientX: ev.clientX,
    clientY: ev.clientY,
    offsetX: ev.offsetX,
    offsetY: ev.offsetY,
    localX,
    localY,
    normX: pt.x,
    normY: pt.y,
    rectW: rect.width,
    rectH: rect.height,
    canvasBitmapW: canvas.width,
    canvasBitmapH: canvas.height,
    dpr: window.devicePixelRatio,
    visualScale: canvasHasVisualScale(canvas),
    pressure: ev.pressure,
    settings: getHwSpikeSettings(),
  });
}

export function collectPointerSamples(e: PointerEvent): HandwritingPoint[] {
  const canvas = e.currentTarget as HTMLCanvasElement;
  logPointerCoordinateSample(canvas, e, 'move');
  const allowCoalesced = isHandwritingDevBuild()
    ? getHwSpikeSettings().coalesced !== 'off'
    : !isIosLike();
  const pick = pickPointerEventsForSample(e, { allowCoalesced });
  recordPointerSamplePick(pick);

  const out: HandwritingPoint[] = [];
  for (const ev of pick.events) {
    const pt = pointerToNormalized(canvas, ev);
    if (!pt) continue;
    if (ev.pressure > 0) {
      pt.pressure = ev.pressure;
      hwDiagRecordPressure(ev.pressure, ev.pointerType);
    }
    out.push(pt);
  }
  return out;
}

/** Corner sharpness heuristic for square-stroke diagnosis (0–1, higher = sharper). */
export function strokeCornerSharpness(stroke: HandwritingStroke): {
  pointCount: number;
  sharpTurns: number;
  maxAngleDeg: number;
} {
  const pts = stroke.points;
  if (pts.length < 3) return { pointCount: pts.length, sharpTurns: 0, maxAngleDeg: 0 };
  let sharpTurns = 0;
  let maxAngleDeg = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const m1 = Math.hypot(v1x, v1y);
    const m2 = Math.hypot(v2x, v2y);
    if (m1 < 1e-5 || m2 < 1e-5) continue;
    const dot = (v1x * v2x + v1y * v2y) / (m1 * m2);
    const angleDeg = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
    maxAngleDeg = Math.max(maxAngleDeg, angleDeg);
    if (angleDeg >= 45) sharpTurns += 1;
  }
  return { pointCount: pts.length, sharpTurns, maxAngleDeg };
}
