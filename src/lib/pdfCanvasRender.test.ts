import { describe, expect, it } from 'vitest';
import {
  PDF_MAX_CANVAS_PIXELS,
  PDF_OUTPUT_SCALE_CAP,
  clampPdfOutputScale,
  computePdfCanvasRenderMetrics,
  computePdfFitZoomScale,
} from './pdfCanvasRender';

describe('pdfCanvasRender', () => {
  it('fit×zoom scale uses current zoom (not stale)', () => {
    expect(computePdfFitZoomScale(800, 400, 1)).toBe(2);
    expect(computePdfFitZoomScale(800, 400, 1.5)).toBe(3);
    expect(computePdfFitZoomScale(800, 400, 0.5)).toBe(1);
  });

  it('caps output scale at PDF_OUTPUT_SCALE_CAP', () => {
    expect(clampPdfOutputScale(1, 800, 1100)).toBe(1);
    expect(clampPdfOutputScale(2, 800, 1100)).toBe(2);
    expect(clampPdfOutputScale(3, 800, 1100)).toBe(PDF_OUTPUT_SCALE_CAP);
  });

  it('reduces output scale when zoomed canvas would exceed pixel budget', () => {
    const cssW = 3000;
    const cssH = 4000;
    const scale = clampPdfOutputScale(2, cssW, cssH);
    expect(cssW * cssH * scale * scale).toBeLessThanOrEqual(PDF_MAX_CANVAS_PIXELS + 1);
    expect(scale).toBeLessThan(2);
    expect(scale).toBeGreaterThanOrEqual(1);
  });

  it('CSS size stays logical viewport; backing = CSS × outputScale', () => {
    const m = computePdfCanvasRenderMetrics({ width: 800.7, height: 1100.2 }, 2);
    expect(m.cssWidth).toBe(800);
    expect(m.cssHeight).toBe(1100);
    expect(m.outputScale).toBe(2);
    expect(m.backingWidth).toBe(1600);
    expect(m.backingHeight).toBe(2200);
    expect(m.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('identity transform when outputScale is 1', () => {
    const m = computePdfCanvasRenderMetrics({ width: 400, height: 500 }, 1);
    expect(m.backingWidth).toBe(400);
    expect(m.backingHeight).toBe(500);
    expect(m.transform).toBeNull();
  });

  it('zoom change grows logical CSS (fresh render target), not CSS-stretch of fixed backing', () => {
    const at1 = computePdfCanvasRenderMetrics({ width: 800, height: 1100 }, 2);
    const at15 = computePdfCanvasRenderMetrics({ width: 1200, height: 1650 }, 2);
    expect(at15.cssWidth).toBeGreaterThan(at1.cssWidth);
    expect(at15.backingWidth).toBeGreaterThan(at1.backingWidth);
    // ratio preserved (no stale fixed backing stretched via CSS-only)
    expect(at15.backingWidth / at15.cssWidth).toBeCloseTo(at1.backingWidth / at1.cssWidth);
  });
});
