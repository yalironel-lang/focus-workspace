import type { HandwritingPoint, HandwritingStroke } from './handwritingTypes';

const MIN_POINT_DIST_NORM = 0.002;

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
 * Uses getBoundingClientRect() as the source of truth for size/position.
 * On iOS without ancestor scale, offsetX/offsetY are more reliable for Apple Pencil.
 */
export function pointerToNormalized(
  canvas: HTMLCanvasElement,
  e: Pick<PointerEvent, 'clientX' | 'clientY' | 'offsetX' | 'offsetY'>,
): HandwritingPoint | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const scaled = canvasHasVisualScale(canvas);
  let localX: number;
  let localY: number;

  if (
    !scaled &&
    isIosLike() &&
    Number.isFinite(e.offsetX) &&
    Number.isFinite(e.offsetY)
  ) {
    localX = e.offsetX;
    localY = e.offsetY;
  } else {
    localX = e.clientX - rect.left;
    localY = e.clientY - rect.top;
  }

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
    if (dx * dx + dy * dy < MIN_POINT_DIST_NORM * MIN_POINT_DIST_NORM) {
      return points;
    }
  }
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
  for (const stroke of all) {
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
      continue;
    }
    ctx.beginPath();
    const first = stroke.points[0]!;
    ctx.moveTo(first.x * canvasW, first.y * canvasH);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]!;
      ctx.lineTo(p.x * canvasW, p.y * canvasH);
    }
    ctx.strokeStyle = stroke.tool === 'eraser' ? 'rgba(248,113,113,0.5)' : stroke.color;
    ctx.lineWidth = strokeWidthPx(stroke, canvasW, refWidth, stroke.points[stroke.points.length - 1]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

export function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function collectPointerSamples(e: PointerEvent): HandwritingPoint[] {
  const canvas = e.currentTarget as HTMLCanvasElement;
  const useCoalesced =
    !isIosLike() &&
    typeof e.getCoalescedEvents === 'function';
  const events = useCoalesced ? e.getCoalescedEvents() : [e];
  const out: HandwritingPoint[] = [];
  for (const ev of events) {
    const pt = pointerToNormalized(canvas, ev);
    if (!pt) continue;
    if (ev.pressure > 0) pt.pressure = ev.pressure;
    out.push(pt);
  }
  return out;
}
