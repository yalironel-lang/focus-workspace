/**
 * iPad handwriting feel diagnostics — console: window.__fwHwFeelDiag()
 * Diagnosis only; does not change rendering.
 */

import { getGitCommit } from './appBuildInfo';
import {
  canvasHasVisualScale,
  isHandwritingCoalescedEnabled,
} from './handwritingGeometry';
import { hwSamplingLast, type HwSamplingStrokeSummary } from './handwritingDiagnostics';
import { commitStrokeSizePx, draftPenLineWidthPx } from './handwritingInk';

export type HwFeelCategory =
  | 'A_offset_scaling'
  | 'B_latency'
  | 'C_stroke_visual'
  | 'D_low_sampling'
  | 'E_layout_mismatch'
  | 'unknown';

export type HwFeelDiagSnapshot = {
  gitCommit: string;
  checkedAt: number;
  canvas: {
    cssRect: { w: number; h: number; left: number; top: number } | null;
    offsetSize: { w: number; h: number } | null;
    bitmap: { w: number; h: number } | null;
    dpr: number;
    visualScale: boolean;
    bitmapMatchesCss: boolean | null;
    displayHeight: number | null;
    layoutRef: { w: number; h: number } | null;
  };
  lastPointer: {
    clientX: number;
    clientY: number;
    normX: number;
    normY: number;
    drawnCssX: number;
    drawnCssY: number;
    pressure: number | null;
    pointerType: string | null;
    t: number;
  } | null;
  draftStyle: {
    penWidthNorm: number;
    draftLineWidthPx: number | null;
    commitSizeEstimatePx: number | null;
    strokeColor: string | null;
  };
  latency: {
    lastMoveToPaintMs: number | null;
    avgMoveToPaintMs: number | null;
    maxMoveToPaintMs: number | null;
    paintUsesRafOnly: true;
    sampleCount: number;
  };
  sampling: HwSamplingStrokeSummary | null;
  coalescedEnabled: boolean;
  primaryCategory: HwFeelCategory;
  categoryScores: Record<HwFeelCategory, number>;
  categoryNotes: string[];
};

let displayHeightRef = 0;
let layoutRefSnapshot = { w: 1, h: 1 };
let penWidthNorm = 2.5;
let strokeColorRef = '#1c1917';
let refWidthRef = 1;

let lastPointer: HwFeelDiagSnapshot['lastPointer'] = null;
let lastMoveAt = 0;
const moveToPaintMs: number[] = [];

export function hwFeelSetLayoutContext(opts: {
  displayHeight: number;
  layoutW: number;
  layoutH: number;
  penWidth: number;
  strokeColor: string;
  refWidth: number;
}): void {
  displayHeightRef = opts.displayHeight;
  layoutRefSnapshot = { w: opts.layoutW, h: opts.layoutH };
  penWidthNorm = opts.penWidth;
  strokeColorRef = opts.strokeColor;
  refWidthRef = opts.refWidth;
}

export function hwFeelRecordPointerSample(sample: {
  clientX: number;
  clientY: number;
  normX: number;
  normY: number;
  cssW: number;
  cssH: number;
  pressure?: number;
  pointerType: string;
}): void {
  lastMoveAt = performance.now();
  lastPointer = {
    clientX: sample.clientX,
    clientY: sample.clientY,
    normX: sample.normX,
    normY: sample.normY,
    drawnCssX: sample.normX * sample.cssW,
    drawnCssY: sample.normY * sample.cssH,
    pressure: sample.pressure ?? null,
    pointerType: sample.pointerType,
    t: Date.now(),
  };
}

export function hwFeelRecordPaintDraft(): void {
  if (lastMoveAt > 0) {
    moveToPaintMs.push(performance.now() - lastMoveAt);
    if (moveToPaintMs.length > 40) moveToPaintMs.shift();
  }
}

function draftLineWidthPx(cssW: number, pressure = 0.5): number {
  return draftPenLineWidthPx(penWidthNorm, cssW, refWidthRef, pressure);
}

function commitSizeEstimatePx(cssW: number): number {
  return commitStrokeSizePx(penWidthNorm, cssW, refWidthRef);
}

function classify(
  canvas: HwFeelDiagSnapshot['canvas'],
  sampling: HwSamplingStrokeSummary | null,
  latency: HwFeelDiagSnapshot['latency'],
  draftStyle: HwFeelDiagSnapshot['draftStyle'],
): { primary: HwFeelCategory; scores: Record<HwFeelCategory, number>; notes: string[] } {
  const scores: Record<HwFeelCategory, number> = {
    A_offset_scaling: 0,
    B_latency: 0,
    C_stroke_visual: 0,
    D_low_sampling: 0,
    E_layout_mismatch: 0,
    unknown: 0,
  };
  const notes: string[] = [];

  if (canvas.visualScale) {
    scores.A_offset_scaling += 3;
    notes.push('canvasHasVisualScale=true (CSS transform vs layout box)');
  }
  if (canvas.bitmapMatchesCss === false) {
    scores.A_offset_scaling += 2;
    notes.push('bitmap size does not match cssRect * dpr');
  }

  if (latency.avgMoveToPaintMs != null && latency.avgMoveToPaintMs >= 10) {
    scores.B_latency += 3;
    notes.push(`avg move→paint ${latency.avgMoveToPaintMs}ms (RAF adds ~8–16ms)`);
  }
  if (latency.maxMoveToPaintMs != null && latency.maxMoveToPaintMs >= 20) {
    scores.B_latency += 2;
  }
  scores.B_latency += 1;
  notes.push('paint scheduled via requestAnimationFrame only (no immediate draw)');

  if (
    draftStyle.draftLineWidthPx != null &&
    draftStyle.commitSizeEstimatePx != null &&
    draftStyle.commitSizeEstimatePx > draftStyle.draftLineWidthPx * 1.2
  ) {
    scores.C_stroke_visual += 3;
    notes.push(
      `draft lineWidth ~${draftStyle.draftLineWidthPx.toFixed(1)}px vs commit mesh ~${draftStyle.commitSizeEstimatePx.toFixed(1)}px`,
    );
  }

  if (sampling) {
    if (!sampling.coalescedEnabled) {
      scores.D_low_sampling += 2;
      notes.push('coalescedEnabled=false');
    }
    if (sampling.samplesPerMove <= 1.05) {
      scores.D_low_sampling += 3;
      notes.push(`samplesPerMove=${sampling.samplesPerMove} (coalesced not helping)`);
    }
    if (sampling.droppedByMinDist > sampling.appendedPoints * 0.25) {
      scores.D_low_sampling += 2;
      notes.push(`high minDist drops: ${sampling.droppedByMinDist}/${sampling.rawSamples}`);
    }
  }

  if (canvas.cssRect && canvas.displayHeight != null) {
    const dhDelta = Math.abs(canvas.cssRect.h - canvas.displayHeight);
    if (dhDelta > 2) {
      scores.E_layout_mismatch += 2;
      notes.push(`cssRect.h=${canvas.cssRect.h.toFixed(0)} vs displayHeight=${canvas.displayHeight}`);
    }
  }
  if (canvas.offsetSize && canvas.cssRect) {
    if (
      Math.abs(canvas.offsetSize.w - canvas.cssRect.w) > 1 ||
      Math.abs(canvas.offsetSize.h - canvas.cssRect.h) > 1
    ) {
      scores.E_layout_mismatch += 2;
      notes.push('offsetWidth/Height differs from getBoundingClientRect');
    }
  }

  let primary: HwFeelCategory = 'unknown';
  let best = -1;
  for (const [k, v] of Object.entries(scores) as [HwFeelCategory, number][]) {
    if (k === 'unknown') continue;
    if (v > best) {
      best = v;
      primary = k;
    }
  }
  if (best <= 0) primary = 'unknown';

  return { primary, scores, notes };
}

export function getHwFeelDiag(canvas: HTMLCanvasElement | null): HwFeelDiagSnapshot {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const rect = canvas?.getBoundingClientRect() ?? null;
  const cssRect = rect
    ? { w: rect.width, h: rect.height, left: rect.left, top: rect.top }
    : null;
  const bitmap = canvas ? { w: canvas.width, h: canvas.height } : null;
  const bitmapMatchesCss =
    cssRect && bitmap
      ? Math.abs(bitmap.w - Math.round(cssRect.w * dpr)) <= 1 &&
        Math.abs(bitmap.h - Math.round(cssRect.h * dpr)) <= 1
      : null;

  const pressure = lastPointer?.pressure ?? 0.5;
  const cssW = cssRect?.w ?? layoutRefSnapshot.w;
  const draftStyle = {
    penWidthNorm,
    draftLineWidthPx: cssRect ? draftLineWidthPx(cssW, pressure > 0 ? pressure : 0.5) : null,
    commitSizeEstimatePx: cssRect ? commitSizeEstimatePx(cssW) : null,
    strokeColor: strokeColorRef,
  };

  const avg =
    moveToPaintMs.length > 0
      ? Math.round((moveToPaintMs.reduce((a, b) => a + b, 0) / moveToPaintMs.length) * 10) / 10
      : null;
  const max = moveToPaintMs.length > 0 ? Math.round(Math.max(...moveToPaintMs) * 10) / 10 : null;
  const last = moveToPaintMs.length > 0 ? Math.round(moveToPaintMs[moveToPaintMs.length - 1]! * 10) / 10 : null;

  const latency = {
    lastMoveToPaintMs: last,
    avgMoveToPaintMs: avg,
    maxMoveToPaintMs: max,
    paintUsesRafOnly: true as const,
    sampleCount: moveToPaintMs.length,
  };

  const sampling = hwSamplingLast();
  const canvasSnap = {
    cssRect,
    offsetSize: canvas ? { w: canvas.offsetWidth, h: canvas.offsetHeight } : null,
    bitmap,
    dpr,
    visualScale: canvas ? canvasHasVisualScale(canvas) : false,
    bitmapMatchesCss,
    displayHeight: displayHeightRef || null,
    layoutRef: { ...layoutRefSnapshot },
  };

  const { primary, scores, notes } = classify(canvasSnap, sampling, latency, draftStyle);

  const snap: HwFeelDiagSnapshot = {
    gitCommit: getGitCommit(),
    checkedAt: Date.now(),
    canvas: canvasSnap,
    lastPointer,
    draftStyle,
    latency,
    sampling,
    coalescedEnabled: isHandwritingCoalescedEnabled(),
    primaryCategory: primary,
    categoryScores: scores,
    categoryNotes: notes,
  };

  // #region agent log
  fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a618f3' },
    body: JSON.stringify({
      sessionId: 'a618f3',
      runId: 'feel-diag',
      hypothesisId: 'A-E',
      location: 'handwritingFeelDiagnostics.ts:getHwFeelDiag',
      message: 'feel diag snapshot',
      data: snap,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return snap;
}

declare global {
  interface Window {
    __fwHwFeelDiag?: () => HwFeelDiagSnapshot;
  }
}

export function registerHwFeelDiag(getCanvas: () => HTMLCanvasElement | null): void {
  if (typeof window === 'undefined') return;
  window.__fwHwFeelDiag = () => getHwFeelDiag(getCanvas());
}
