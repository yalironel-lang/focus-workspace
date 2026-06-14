/**
 * Per-stroke ink diagnostics for iPad QA (window.__fwHwStrokeDiag()).
 * Records pointer type, pressure, sampling, and canvas rect stability.
 */

import { getGitCommit } from './appBuildInfo';

export type CanvasRectSnap = {
  w: number;
  h: number;
  top: number;
  left: number;
};

export type StrokeDiagSnapshot = {
  gitCommit: string;
  recordedAt: number;
  pointerTypes: string[];
  sawPen: boolean;
  sawMouse: boolean;
  sawTouch: boolean;
  pressureMin: number | null;
  pressureMax: number | null;
  /** All raw/coalesced samples before minDist (includes dropped). */
  rawPressureMin: number | null;
  rawPressureMax: number | null;
  moveEvents: number;
  rawSamples: number;
  appendedPoints: number;
  droppedByMinDist: number;
  samplesPerMove: number | null;
  lastBatchSize: number | null;
  coalescedUsed: number;
  coalescedFallback: number;
  canvasCssAtDown: CanvasRectSnap | null;
  canvasCssAtMove: CanvasRectSnap | null;
  canvasCssAtEnd: CanvasRectSnap | null;
  displayHeight: number;
  layoutMismatchPxAtEnd: number | null;
  rectHeightDeltaDownToMove: number | null;
  rectWidthDeltaDownToMove: number | null;
  rectStableDownToMove: boolean | null;
  dpr: number | null;
  bitmapAtEnd: { w: number; h: number } | null;
  bitmapMatchesCssAtEnd: boolean | null;
};

function snapRect(rect: DOMRect): CanvasRectSnap {
  return { w: rect.width, h: rect.height, top: rect.top, left: rect.left };
}

function bitmapMatchesCss(
  css: CanvasRectSnap,
  bitmap: { w: number; h: number },
  dpr: number,
): boolean {
  return (
    Math.abs(bitmap.w - Math.round(css.w * dpr)) <= 1 &&
    Math.abs(bitmap.h - Math.round(css.h * dpr)) <= 1
  );
}

let active = false;
let pointerTypes = new Set<string>();
let pressureMin: number | null = null;
let pressureMax: number | null = null;
let rawPressureMin: number | null = null;
let rawPressureMax: number | null = null;
let moveEvents = 0;
let rawSamples = 0;
let appendedPoints = 0;
let droppedByMinDist = 0;
let lastBatchSize: number | null = null;
let coalescedUsed = 0;
let coalescedFallback = 0;
let canvasCssAtDown: CanvasRectSnap | null = null;
let canvasCssAtMove: CanvasRectSnap | null = null;
let lastStroke: StrokeDiagSnapshot | null = null;
const RECENT_STROKES_MAX = 5;
let recentStrokes: StrokeDiagSnapshot[] = [];

export const HW_STROKE_DIAG_EVENT = 'fw-hw-stroke-diag';

function recordPressure(pressure: number): void {
  if (!Number.isFinite(pressure) || pressure <= 0) return;
  pressureMin = pressureMin === null ? pressure : Math.min(pressureMin, pressure);
  pressureMax = pressureMax === null ? pressure : Math.max(pressureMax, pressure);
}

export function resetHandwritingStrokeDiag(): void {
  active = false;
  pointerTypes = new Set();
  pressureMin = null;
  pressureMax = null;
  rawPressureMin = null;
  rawPressureMax = null;
  moveEvents = 0;
  rawSamples = 0;
  appendedPoints = 0;
  droppedByMinDist = 0;
  lastBatchSize = null;
  coalescedUsed = 0;
  coalescedFallback = 0;
  canvasCssAtDown = null;
  canvasCssAtMove = null;
}

export function recordHandwritingStrokePointerDown(
  canvas: HTMLCanvasElement,
  _displayHeight: number,
  pointerType: string,
  pressure: number,
): void {
  resetHandwritingStrokeDiag();
  active = true;
  pointerTypes.add(pointerType);
  recordPressure(pressure);
  recordHandwritingStrokeRawSample(pressure > 0 ? pressure : undefined);
  canvasCssAtDown = snapRect(canvas.getBoundingClientRect());
}

export function recordHandwritingStrokePointerMove(
  canvas: HTMLCanvasElement,
  pointerType: string,
  batchSize: number,
  usedCoalesced: boolean,
  fallbackReason?: string,
): void {
  if (!active) return;
  moveEvents += 1;
  rawSamples += batchSize;
  pointerTypes.add(pointerType);
  lastBatchSize = batchSize;
  if (usedCoalesced) coalescedUsed += 1;
  if (fallbackReason) coalescedFallback += 1;
  canvasCssAtMove = snapRect(canvas.getBoundingClientRect());
}

/** Raw/coalesced sample before appendPoint — captures input variation pre-filter. */
export function recordHandwritingStrokeRawSample(pressure?: number): void {
  if (!active) return;
  if (pressure === undefined || !Number.isFinite(pressure) || pressure <= 0) return;
  rawPressureMin =
    rawPressureMin === null ? pressure : Math.min(rawPressureMin, pressure);
  rawPressureMax =
    rawPressureMax === null ? pressure : Math.max(rawPressureMax, pressure);
}

export function recordHandwritingStrokePointAppended(pressure?: number): void {
  if (!active) return;
  appendedPoints += 1;
  if (pressure !== undefined) recordPressure(pressure);
}

export function recordHandwritingStrokePointDropped(pressure?: number): void {
  if (!active) return;
  droppedByMinDist += 1;
  if (pressure !== undefined) recordPressure(pressure);
}

/** Page-ink wrap style — fixed height, never flex-shrink (exported for QA). */
export function pageInkCanvasWrapStyle(displayHeight: number): {
  height: number;
  minHeight: number;
  flexShrink: number;
  flexGrow: number;
} {
  return {
    height: displayHeight,
    minHeight: displayHeight,
    flexShrink: 0,
    flexGrow: 0,
  };
}

export function finalizeHandwritingStrokeDiag(
  canvas: HTMLCanvasElement | null,
  displayHeight: number,
): StrokeDiagSnapshot {
  const types = [...pointerTypes];
  const canvasCssAtEnd = canvas ? snapRect(canvas.getBoundingClientRect()) : null;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : null;
  const bitmapAtEnd = canvas ? { w: canvas.width, h: canvas.height } : null;
  const layoutMismatchPxAtEnd =
    canvasCssAtEnd !== null ? Math.abs(canvasCssAtEnd.h - displayHeight) : null;
  const rectHeightDeltaDownToMove =
    canvasCssAtDown && canvasCssAtMove
      ? Math.abs(canvasCssAtMove.h - canvasCssAtDown.h)
      : null;
  const rectWidthDeltaDownToMove =
    canvasCssAtDown && canvasCssAtMove
      ? Math.abs(canvasCssAtMove.w - canvasCssAtDown.w)
      : null;
  const rectStableDownToMove =
    rectHeightDeltaDownToMove !== null && rectWidthDeltaDownToMove !== null
      ? rectHeightDeltaDownToMove < 1 && rectWidthDeltaDownToMove < 1
      : null;
  const bitmapMatchesCssAtEnd =
    canvasCssAtEnd && bitmapAtEnd && dpr
      ? bitmapMatchesCss(canvasCssAtEnd, bitmapAtEnd, dpr)
      : null;

  const snapshot: StrokeDiagSnapshot = {
    gitCommit: getGitCommit(),
    recordedAt: Date.now(),
    pointerTypes: types,
    sawPen: types.includes('pen'),
    sawMouse: types.includes('mouse'),
    sawTouch: types.includes('touch'),
    pressureMin,
    pressureMax,
    rawPressureMin,
    rawPressureMax,
    moveEvents,
    rawSamples,
    appendedPoints,
    droppedByMinDist,
    samplesPerMove: moveEvents > 0 ? rawSamples / moveEvents : null,
    lastBatchSize,
    coalescedUsed,
    coalescedFallback,
    canvasCssAtDown,
    canvasCssAtMove,
    canvasCssAtEnd,
    displayHeight,
    layoutMismatchPxAtEnd,
    rectHeightDeltaDownToMove,
    rectWidthDeltaDownToMove,
    rectStableDownToMove,
    dpr,
    bitmapAtEnd,
    bitmapMatchesCssAtEnd,
  };
  lastStroke = snapshot;
  recentStrokes = [snapshot, ...recentStrokes].slice(0, RECENT_STROKES_MAX);
  active = false;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HW_STROKE_DIAG_EVENT, { detail: snapshot }));
  }
  return snapshot;
}

export function getLastHandwritingStrokeDiag(): StrokeDiagSnapshot | null {
  return lastStroke;
}

export function getRecentHandwritingStrokeDiags(): StrokeDiagSnapshot[] {
  return recentStrokes;
}

declare global {
  interface Window {
    __fwHwStrokeDiag?: () => StrokeDiagSnapshot | null;
  }
}

if (typeof window !== 'undefined') {
  window.__fwHwStrokeDiag = () => getLastHandwritingStrokeDiag();
}
