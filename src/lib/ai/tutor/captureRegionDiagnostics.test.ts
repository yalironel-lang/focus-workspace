import { describe, expect, it } from 'vitest';
import type { NormalizedPageRegion } from '../../pdfGeometry/normalizedPageRegion';
import {
  assessCaptureRegionExtraction,
  clearCaptureRegionDiagnostics,
  getLastCaptureRegionDiagnostics,
  isInvalidCaptureRegionGeometry,
  recordCaptureRegionDiagnostics,
} from './captureRegionDiagnostics';

const PAGE_W = 500;
const PAGE_H = 500;

const contentWithLine = {
  items: [{ str: 'Mean Value Theorem line', transform: [1, 0, 0, 1, 100, 400], width: 160, height: 10 }],
};

describe('captureRegionDiagnostics', () => {
  it('flags invalid geometry without logging coordinates as text', () => {
    expect(isInvalidCaptureRegionGeometry({ x: 0, y: 0, w: 0, h: 0.2 })).toBe(true);
    expect(isInvalidCaptureRegionGeometry({ x: 0.1, y: 0.1, w: 0.4, h: 0.3 })).toBe(false);

    const diag = assessCaptureRegionExtraction(
      contentWithLine,
      PAGE_W,
      PAGE_H,
      { x: 0, y: 0, w: -1, h: 0.2 },
      'useful',
    );
    expect(diag.code).toBe('invalid_geometry');
    expect(diag.intersectingItemCount).toBe(0);
    expect(diag.regionUseful).toBe(0);
    expect(diag.nativePageEligible).toBe(1);
  });

  it('reports no_intersecting_items when the drag misses glyphs', () => {
    const miss: NormalizedPageRegion = { x: 0.8, y: 0.8, w: 0.15, h: 0.15 };
    const diag = assessCaptureRegionExtraction(contentWithLine, PAGE_W, PAGE_H, miss, 'useful');
    expect(diag.code).toBe('no_intersecting_items');
    expect(diag.intersectingItemCount).toBe(0);
    expect(diag.extractedCharCount).toBe(0);
    expect(diag.regionUseful).toBe(0);
    expect(diag.pageUseful).toBe(1);
    expect(diag.nativePageEligible).toBe(1);
  });

  it('reports intersecting_unusable when glyphs overlap but text is not Tutor-useful', () => {
    const tiny = {
      items: [{ str: '.', transform: [1, 0, 0, 1, 100, 400], width: 4, height: 10 }],
    };
    const region: NormalizedPageRegion = { x: 0.1, y: 0.1, w: 0.5, h: 0.4 };
    const diag = assessCaptureRegionExtraction(tiny, PAGE_W, PAGE_H, region, 'sparse');
    expect(diag.code).toBe('intersecting_unusable');
    expect(diag.intersectingItemCount).toBe(1);
    expect(diag.regionUseful).toBe(0);
    expect(diag.nativePageEligible).toBe(0);
  });

  it('reports region_usable for a healthy native selection', () => {
    const region: NormalizedPageRegion = { x: 0.1, y: 0.1, w: 0.6, h: 0.4 };
    const diag = assessCaptureRegionExtraction(contentWithLine, PAGE_W, PAGE_H, region, 'useful');
    expect(diag.code).toBe('region_usable');
    expect(diag.intersectingItemCount).toBe(1);
    expect(diag.extractedCharCount).toBeGreaterThan(5);
    expect(diag.regionUseful).toBe(1);
    expect(diag.nativePageEligible).toBe(0);
  });

  it('is zoom-invariant when pageWidth/Height are scale-1 viewport units', () => {
    const region: NormalizedPageRegion = { x: 0.15, y: 0.15, w: 0.5, h: 0.35 };
    const a = assessCaptureRegionExtraction(contentWithLine, PAGE_W, PAGE_H, region, 'useful');
    // Doubling CSS zoom must not change diagnostics when extract uses scale-1 geometry.
    const b = assessCaptureRegionExtraction(contentWithLine, PAGE_W, PAGE_H, region, 'useful');
    expect(a).toEqual(b);
    expect(a.code).toBe('region_usable');
    expect(a.intersectingItemCount).toBe(1);
  });

  it('stores only codes/counters in the last snapshot', () => {
    clearCaptureRegionDiagnostics();
    const diag = assessCaptureRegionExtraction(
      contentWithLine,
      PAGE_W,
      PAGE_H,
      { x: 0.8, y: 0.8, w: 0.1, h: 0.1 },
      'useful',
    );
    recordCaptureRegionDiagnostics(diag);
    const snap = getLastCaptureRegionDiagnostics();
    expect(snap).toMatchObject({
      code: 'no_intersecting_items',
      intersectingItemCount: 0,
      regionUseful: 0,
      pageUseful: 1,
      nativePageEligible: 1,
    });
    expect(JSON.stringify(snap)).not.toMatch(/Mean Value|Theorem|formula/i);
    clearCaptureRegionDiagnostics();
  });
});
