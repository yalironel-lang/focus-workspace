/**
 * Live draft paint profiler — diagnostics only (window.__fwHwPaintProfile()).
 */

import { getFwInkDraftMode, type FwInkDraftMode } from './handwritingInkDraftMode';

export type HwPaintProfileSample = {
  paintMs: number;
  segmentsDrawn: number;
  pointsProcessed: number;
  draftMode: FwInkDraftMode;
};

export type HwPaintProfileSnapshot = {
  avgPaintMs: number | null;
  maxPaintMs: number | null;
  p95PaintMs: number | null;
  avgSegmentsDrawn: number | null;
  avgPointsProcessed: number | null;
  draftMode: FwInkDraftMode;
  sampleCount: number;
};

const MAX_SAMPLES = 40;
const samples: HwPaintProfileSample[] = [];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? null;
}

export function hwPaintProfileRecord(sample: HwPaintProfileSample): void {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) samples.shift();
}

export function hwPaintProfileClear(): void {
  samples.length = 0;
}

export function getHwPaintProfile(): HwPaintProfileSnapshot {
  const draftMode = getFwInkDraftMode();
  if (samples.length === 0) {
    return {
      avgPaintMs: null,
      maxPaintMs: null,
      p95PaintMs: null,
      avgSegmentsDrawn: null,
      avgPointsProcessed: null,
      draftMode,
      sampleCount: 0,
    };
  }

  const paintMs = samples.map(s => s.paintMs);
  const segments = samples.map(s => s.segmentsDrawn);
  const points = samples.map(s => s.pointsProcessed);

  return {
    avgPaintMs: round1(paintMs.reduce((a, b) => a + b, 0) / paintMs.length),
    maxPaintMs: round1(Math.max(...paintMs)),
    p95PaintMs: percentile(paintMs, 95) !== null ? round1(percentile(paintMs, 95)!) : null,
    avgSegmentsDrawn: round1(segments.reduce((a, b) => a + b, 0) / segments.length),
    avgPointsProcessed: round1(points.reduce((a, b) => a + b, 0) / points.length),
    draftMode,
    sampleCount: samples.length,
  };
}

export function installHwPaintProfile(): void {
  if (typeof window === 'undefined') return;
  window.__fwHwPaintProfile = () => getHwPaintProfile();
  window.__fwHwPaintProfileClear = () => hwPaintProfileClear();
}

declare global {
  interface Window {
    __fwHwPaintProfile?: () => HwPaintProfileSnapshot;
    __fwHwPaintProfileClear?: () => void;
  }
}
