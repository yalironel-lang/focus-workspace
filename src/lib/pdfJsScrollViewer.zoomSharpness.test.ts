/**
 * PdfJsScrollViewer zoom sharpness contracts (source-level + pure helpers).
 *
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computePdfCanvasRenderMetrics,
  computePdfFitZoomScale,
} from './pdfCanvasRender';

describe('PdfJsScrollViewer zoom sharpness contracts', () => {
  const src = readFileSync(
    resolve(__dirname, '../components/project-space/PdfJsScrollViewer.tsx'),
    'utf8',
  );

  it('re-renders on zoom via applyLayoutAndRestore (not CSS-only enlarge)', () => {
    expect(src).toMatch(/prevZoomRef\.current = zoom/);
    expect(src).toMatch(/applyLayoutAndRestore\(visiblePageRef\.current\)/);
    expect(src).toMatch(/pdfPage\.render\(/);
    expect(src).toMatch(/getViewport\(\{\s*scale\s*\}\)/);
  });

  it('does not stretch PDF canvas with width:100% CSS', () => {
    expect(src).not.toMatch(/canvas\.style\.width\s*=\s*['"]100%/);
  });

  it('sizes backing with outputScale transform for Retina', () => {
    expect(src).toMatch(/computePdfCanvasRenderMetrics/);
    expect(src).toMatch(/metrics\.transform/);
    expect(src).toMatch(/devicePixelRatio/);
  });

  it('cancels tasks and bumps gen on layout/zoom (stale render guard)', () => {
    expect(src).toMatch(/cancelAllRenderTasks/);
    expect(src).toMatch(/renderGenRef\.current \+= 1/);
    expect(src).toMatch(/gen !== renderGenRef\.current/);
    expect(src).toMatch(/scale !== renderScaleRef\.current/);
  });

  it('page slot uses layout width (ink overlay remains page-relative inset)', () => {
    expect(src).toMatch(/width: pageWidth > 0 \? pageWidth : '100%/);
    expect(src).toMatch(/renderPageOverlay && inWindow/);
  });

  it('viewport scale tracks zoom; backing tracks DPR without CSS stretch', () => {
    const container = 800;
    const base = 400;
    const dpr = 2;
    const s1 = computePdfFitZoomScale(container, base, 1);
    const s2 = computePdfFitZoomScale(container, base, 1.25);
    expect(s2 / s1).toBeCloseTo(1.25);
    const m1 = computePdfCanvasRenderMetrics({ width: container * 1, height: 1100 }, dpr);
    const m2 = computePdfCanvasRenderMetrics({ width: container * 1.25, height: 1375 }, dpr);
    expect(m2.cssWidth / m1.cssWidth).toBeCloseTo(1.25);
    expect(m2.backingWidth / m2.cssWidth).toBe(dpr);
    expect(m1.backingWidth / m1.cssWidth).toBe(dpr);
  });
});
