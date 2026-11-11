import { describe, expect, it } from 'vitest';
import {
  cropPageCanvasToImage,
  exportScaleForPage,
  exportScaleForRegion,
  normalizedRegionToCropRect,
  REGION_IMAGE_PERSISTENCE_POLICY,
} from './renderPdfRegionImage';

describe('renderPdfRegionImage (geometry & scaling)', () => {
  it('maps normalized regions to pixel crops independently of viewer zoom', () => {
    // Use exact binary fractions to avoid FP ceil/floor surprises.
    const region = { x: 0.25, y: 0.5, w: 0.25, h: 0.25 };
    const a = normalizedRegionToCropRect(region, 800, 1200);
    const b = normalizedRegionToCropRect(region, 800, 1200);
    expect(a).toEqual(b);
    expect(a).toEqual({ sx: 200, sy: 600, sw: 200, sh: 300 });

    // Same normalized region on a 2× export bitmap → 2× pixel crop (zoom-invariant norm).
    const c = normalizedRegionToCropRect(region, 1600, 2400);
    expect(c).toEqual({ sx: 400, sy: 1200, sw: 400, sh: 600 });
  });

  it('adds padding to crop rect and clamps strictly to page boundaries', () => {
    // Region at top-left corner: padding must be clamped at 0
    const cornerRegion = { x: 0.0, y: 0.0, w: 0.2, h: 0.2 };
    const paddedCorner = normalizedRegionToCropRect(cornerRegion, 1000, 1000, 8);
    expect(paddedCorner).toEqual({
      sx: 0, // Clamped from -8 to 0
      sy: 0, // Clamped from -8 to 0
      sw: 208, // 200 + 8
      sh: 208, // 200 + 8
    });

    // Region at bottom-right corner: padding must be clamped at page width/height
    const brRegion = { x: 0.8, y: 0.8, w: 0.2, h: 0.2 };
    const paddedBr = normalizedRegionToCropRect(brRegion, 1000, 1000, 8);
    expect(paddedBr).toEqual({
      sx: 792, // 800 - 8
      sy: 792, // 800 - 8
      sw: 208, // 1000 - 792
      sh: 208, // 1000 - 792
    });

    // Interior region: padding added on all 4 sides
    const interiorRegion = { x: 0.2, y: 0.3, w: 0.4, h: 0.4 };
    const paddedInterior = normalizedRegionToCropRect(interiorRegion, 1000, 1000, 10);
    expect(paddedInterior).toEqual({
      sx: 190, // 200 - 10
      sy: 290, // 300 - 10
      sw: 420, // 400 + 20
      sh: 420, // 400 + 20
    });
  });

  it('exportScaleForPage ignores UI zoom and targets long-edge cap', () => {
    const s1 = exportScaleForPage(612, 792, 1280);
    const s2 = exportScaleForPage(612, 792, 1280);
    expect(s1).toBe(s2);
    expect(Math.round(s1 * 792)).toBe(1280);
  });

  it('exportScaleForRegion scales page dynamically so region long edge targets ~1280px', () => {
    // A4 page: 595.3 x 841.9 pt. Region takes 78% width (464.33 pt) and 24% height (202.06 pt).
    const region = { x: 0.1, y: 0.22, w: 0.78, h: 0.24 };
    const scale = exportScaleForRegion(595.3, 841.9, region, 1280);

    // Region long pt = 0.78 * 595.3 = 464.334 pt
    // Target scale = 1280 / 464.334 ~= 2.7566
    expect(scale).toBeCloseTo(1280 / (0.78 * 595.3), 2);
    expect(scale).toBeLessThanOrEqual(3.0);
    expect(scale).toBeGreaterThan(2.0);

    // Tiny region should be capped at 4.5x scale (and within 4096px canvas bound)
    const tinyRegion = { x: 0.1, y: 0.1, w: 0.05, h: 0.05 };
    const tinyScale = exportScaleForRegion(595.3, 841.9, tinyRegion, 1280);
    expect(tinyScale).toBe(4.5);

    // Default target long edge is 1600px
    const defaultScale = exportScaleForRegion(595.3, 841.9, region);
    expect(defaultScale).toBeCloseTo(1600 / (0.78 * 595.3), 2);
    expect(defaultScale).toBeLessThanOrEqual(4.5);

    // Enormous page respects 4096px canvas dimension limit
    const hugeScale = exportScaleForRegion(5000, 5000, region, 1280);
    expect(hugeScale * 5000).toBeLessThanOrEqual(4096);
  });

  it('rejects invalid region geometry', () => {
    expect(normalizedRegionToCropRect({ x: 0, y: 0, w: 0, h: 0.2 }, 100, 100)).toBeNull();
    expect(normalizedRegionToCropRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0, 100)).toBeNull();
  });

  it('declares ephemeral persistence policy (no IDB/Storage writes in helper)', () => {
    expect(REGION_IMAGE_PERSISTENCE_POLICY).toBe('ephemeral_request_only');
  });

  it('cropPageCanvasToImage returns lossless PNG when within budget', () => {
    // Valid PNG data URL (1x1 transparent PNG)
    const mockPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const fakePageCanvas = {
      width: 1000,
      height: 1000,
    } as unknown as HTMLCanvasElement;

    // Spy on document.createElement('canvas')
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: '',
            fillRect: () => {},
            drawImage: () => {},
          }),
          toDataURL: (mime?: string) => {
            if (mime === 'image/png') return mockPngDataUrl;
            return 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';
          },
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    };

    document.createElement = createElementSpy as typeof document.createElement;
    try {
      const region = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
      const res = cropPageCanvasToImage(fakePageCanvas, region);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.mime).toBe('image/png');
        expect(res.dataUrl).toContain('data:image/png;base64,');
        expect(res.bytes.byteLength).toBeGreaterThan(0);
        expect(res.widthPx).toBeGreaterThan(0);
        expect(res.heightPx).toBeGreaterThan(0);
      }
    } finally {
      document.createElement = originalCreateElement;
    }
  });
});
