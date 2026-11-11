import { describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  cropPageCanvasToImage,
  encodeCanvasToImage,
  exportScaleForPage,
  exportScaleForRegion,
  normalizedRegionToCropRect,
  renderPdfRegionImage,
} from './renderPdfRegionImage';
import {
  MAX_ASK_COURSE_VISUAL_BODY_BYTES,
  MAX_VISUAL_SELECTION_IMAGE_BYTES,
  MAX_VISUAL_SELECTION_LONG_EDGE_PX,
} from './visualSelectionContract';

describe('Region-First PDF Rendering (Phase 3 Regression Suite)', () => {
  describe('1. Exact Crop Coordinates & Padding Clamping', () => {
    it('computes exact integer crop bounds with padding clamped to page edges', () => {
      const region = { x: 0.2, y: 0.3, w: 0.5, h: 0.4 };
      const crop = normalizedRegionToCropRect(region, 1000, 2000, 8);
      expect(crop).not.toBeNull();
      expect(crop!.sx).toBe(192); // 200 - 8
      expect(crop!.sy).toBe(592); // 600 - 8
      expect(crop!.sw).toBe(516); // 500 + 16
      expect(crop!.sh).toBe(816); // 800 + 16
    });

    it('clamps strictly at page boundaries (0, 0) and (width, height)', () => {
      const edgeRegion = { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };
      const crop = normalizedRegionToCropRect(edgeRegion, 1200, 1600, 16);
      expect(crop).toEqual({
        sx: 0,
        sy: 0,
        sw: 1200,
        sh: 1600,
      });
    });
  });

  describe('2. Different Page Sizes & Aspect Ratios', () => {
    it('computes correct scales for US Letter (612x792 pt)', () => {
      const region = { x: 0.1, y: 0.1, w: 0.8, h: 0.3 };
      const scale = exportScaleForRegion(612, 792, region, 1600);
      // Region long pt = 0.8 * 612 = 489.6 pt. Target scale = 1600 / 489.6 ~= 3.268
      expect(scale).toBeCloseTo(1600 / 489.6, 2);
    });

    it('computes correct scales for Legal (612x1008 pt) and Landscape', () => {
      const landscapeRegion = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
      const scaleLandscape = exportScaleForRegion(1008, 612, landscapeRegion, 1600);
      expect(scaleLandscape).toBeCloseTo(1600 / (0.9 * 1008), 2);
    });

    it('handles oversized pages (2500x3500 pt) safely without canvas overflow', () => {
      const region = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
      const scale = exportScaleForRegion(2500, 3500, region, 1600);
      const cropLongEdge = scale * (0.8 * 3500);
      expect(cropLongEdge).toBeLessThanOrEqual(1600.5);
      expect(cropLongEdge).toBeLessThanOrEqual(4096);
    });
  });

  describe('3. Small, Tight, Wide, and Full-Page Selections', () => {
    it('caps very small selections at 4.5x scale to prevent runaway canvas allocation', () => {
      const tiny = { x: 0.5, y: 0.5, w: 0.02, h: 0.02 };
      const scale = exportScaleForRegion(595, 842, tiny, 1600);
      expect(scale).toBe(4.5);
    });

    it('scales full-page selections to fit within target long edge', () => {
      const fullPage = { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };
      const scale = exportScaleForRegion(595.3, 841.9, fullPage, 1600);
      expect(scale).toBeCloseTo(1600 / 841.9, 2);
      expect(scale * 841.9).toBeCloseTo(1600, 0);
    });

    it('scales tight mathematical formula selection appropriately', () => {
      // 200 pt wide formula on A4
      const formulaSelection = { x: 0.1, y: 0.4, w: 200 / 595.3, h: 50 / 841.9 };
      const scale = exportScaleForRegion(595.3, 841.9, formulaSelection, 1600);
      // ideal scale = 1600 / 200 = 8.0, but capped at 4.5x
      expect(scale).toBe(4.5);
    });
  });

  describe('4. Image & Gateway Byte-Budget Compliance', () => {
    it('encodeCanvasToImage returns PNG when within 400 KiB budget', () => {
      const mockPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY2BgYPgPxEAMY0MABBgAFLwC89G8t6AAAAAElFTkSuQmCC';
      const fakeCanvas = {
        width: 1200,
        height: 800,
        toDataURL: (mime: string) => mockPng,
      } as unknown as HTMLCanvasElement;

      const res = encodeCanvasToImage(fakeCanvas, { maxBytes: MAX_VISUAL_SELECTION_IMAGE_BYTES });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.mime).toBe('image/png');
        expect(res.bytes.byteLength).toBeLessThanOrEqual(MAX_VISUAL_SELECTION_IMAGE_BYTES);
        // Base64 JSON payload check
        const base64Len = Math.ceil((res.bytes.byteLength * 4) / 3);
        expect(base64Len).toBeLessThanOrEqual(MAX_ASK_COURSE_VISUAL_BODY_BYTES);
      }
    });

    it('encodeCanvasToImage downsamples if canvas dimensions exceed MAX_VISUAL_SELECTION_LONG_EDGE_PX', () => {
      const originalCreateElement = document.createElement.bind(document);
      const mockPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY2BgYPgPxEAMY0MABBgAFLwC89G8t6AAAAAElFTkSuQmCC';
      document.createElement = ((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ fillStyle: '', fillRect: () => {}, drawImage: () => {} }),
            toDataURL: () => mockPng,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tag);
      }) as typeof document.createElement;

      try {
        const fakeCanvas = {
          width: 2400,
          height: 1200,
          toDataURL: () => mockPng,
        } as unknown as HTMLCanvasElement;

        const res = encodeCanvasToImage(fakeCanvas, { maxLongEdgePx: 1600 });
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.widthPx).toBe(1600);
          expect(res.heightPx).toBe(800);
        }
      } finally {
        document.createElement = originalCreateElement;
      }
    });
  });

  describe('5. Region-First Render & Fallback Execution', () => {
    it('executes region-first render directly with cropped viewport clone', async () => {
      const originalCreateElement = document.createElement.bind(document);
      const mockPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY2BgYPgPxEAMY0MABBgAFLwC89G8t6AAAAAElFTkSuQmCC';
      document.createElement = ((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ fillStyle: '', fillRect: () => {}, drawImage: () => {} }),
            toDataURL: () => mockPng,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tag);
      }) as typeof document.createElement;

      try {
        const mockRenderPromise = Promise.resolve();
        const mockRender = vi.fn().mockReturnValue({ promise: mockRenderPromise });
        const mockClone = vi.fn().mockImplementation((opts) => ({
          width: 400,
          height: 300,
          scale: 2.0,
          ...opts,
        }));

        const mockViewport = {
          width: 1000,
          height: 1500,
          clone: mockClone,
        };

        const mockPage = {
          getViewport: vi.fn().mockReturnValue(mockViewport),
          render: mockRender,
        } as unknown as PDFPageProxy;

        const mockPdf = {
          numPages: 1,
          getPage: vi.fn().mockResolvedValue(mockPage),
        } as unknown as PDFDocumentProxy;

        const region = { x: 0.1, y: 0.2, w: 0.4, h: 0.3 };
        const res = await renderPdfRegionImage({
          pdf: mockPdf,
          pageNumber: 1,
          region,
          targetLongEdgePx: 1600,
        });

        expect(res.ok).toBe(true);
        expect(mockClone).toHaveBeenCalledWith(
          expect.objectContaining({
            offsetX: expect.any(Number),
            offsetY: expect.any(Number),
          }),
        );
        expect(mockRender).toHaveBeenCalled();
      } finally {
        document.createElement = originalCreateElement;
      }
    });

    it('falls back safely to bounded full-page render if region-first render throws', async () => {
      const originalCreateElement = document.createElement.bind(document);
      const mockPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVBhXY2BgYPgPxEAMY0MABBgAFLwC89G8t6AAAAAElFTkSuQmCC';
      document.createElement = ((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ fillStyle: '', fillRect: () => {}, drawImage: () => {} }),
            toDataURL: () => mockPng,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tag);
      }) as typeof document.createElement;

      try {
        let renderCallCount = 0;
        const mockRender = vi.fn().mockImplementation(() => {
          renderCallCount++;
          if (renderCallCount === 1) {
            // Region-first render fails
            return { promise: Promise.reject(new Error('simulated_region_first_failure')) };
          }
          // Fallback render succeeds
          return { promise: Promise.resolve() };
        });

        const mockViewport = {
          width: 1000,
          height: 1500,
          clone: vi.fn().mockReturnValue({ width: 400, height: 300 }),
        };

        const mockPage = {
          getViewport: vi.fn().mockReturnValue(mockViewport),
          render: mockRender,
        } as unknown as PDFPageProxy;

        const mockPdf = {
          numPages: 1,
          getPage: vi.fn().mockResolvedValue(mockPage),
        } as unknown as PDFDocumentProxy;

        const region = { x: 0.1, y: 0.2, w: 0.4, h: 0.3 };
        const res = await renderPdfRegionImage({
          pdf: mockPdf,
          pageNumber: 1,
          region,
        });

        expect(renderCallCount).toBe(2);
        expect(res.ok).toBe(true);
      } finally {
        document.createElement = originalCreateElement;
      }
    });
  });
});
