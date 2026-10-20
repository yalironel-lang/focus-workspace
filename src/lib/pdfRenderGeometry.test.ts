import { describe, expect, it } from 'vitest';
import { pageAtViewportCenter, PDF_PAGE_GAP_PX } from './pdfPageVisibility';
import { normalizePdfZoom } from './pdfViewerState';
import {
  PDF_FIT_WIDTH_ZOOM,
  PDF_MAX_CANVAS_EDGE_PX,
  PDF_MAX_CANVAS_PIXELS,
  capturePdfScrollAnchor,
  fitPageZoom,
  pageIsCenteredInPane,
  pageScrollsHorizontally,
  pdfCanvasRenderPlan,
  pdfOutputScale,
  pdfResizeRenderTimes,
  scrollLeftForAnchor,
  scrollTopForAnchor,
} from './pdfRenderGeometry';

const LETTER = { width: 612, height: 792 };
const PANE = 640;

function aspect(width: number, height: number): number {
  return width / height;
}

describe('PDF render geometry', () => {
  it.each([0.55, 1, 1.5, 1.8, 2, 2.5])('keeps the page aspect at %s× fit width', zoom => {
    const plan = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, zoom, 1);
    expect(aspect(plan.cssWidth, plan.cssHeight)).toBeCloseTo(aspect(LETTER.width, LETTER.height), 5);
    expect(aspect(plan.backingWidth, plan.backingHeight)).toBeCloseTo(aspect(LETTER.width, LETTER.height), 2);
  });

  it('treats 100% as the pane width and enlarges both axes above that', () => {
    const fitted = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, PDF_FIT_WIDTH_ZOOM, 1);
    expect(PDF_FIT_WIDTH_ZOOM).toBe(1);
    expect(fitted.cssWidth).toBeCloseTo(PANE, 5);
    expect(pageScrollsHorizontally(fitted.cssWidth, PANE)).toBe(false);

    const magnified = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, 1.8, 1);
    expect(magnified.cssWidth).toBeCloseTo(PANE * 1.8, 4);
    expect(magnified.cssHeight).toBeCloseTo(fitted.cssHeight * 1.8, 4);
    expect(pageScrollsHorizontally(magnified.cssWidth, PANE)).toBe(true);
  });

  it('centers a page that is narrower than the pane', () => {
    const plan = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, 0.55, 1);
    expect(pageIsCenteredInPane(plan.cssWidth, PANE)).toBe(true);
    expect(pageScrollsHorizontally(plan.cssWidth, PANE)).toBe(false);
  });

  it('renders a Retina backing store at DPR 2 without changing the CSS box', () => {
    const sharp = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, 1, 2);
    const flat = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, 1, 1);
    expect(sharp.cssWidth).toBeCloseTo(flat.cssWidth, 5);
    expect(sharp.cssHeight).toBeCloseTo(flat.cssHeight, 5);
    expect(sharp.backingWidth).toBe(Math.floor(flat.cssWidth * 2));
    expect(sharp.backingHeight).toBe(Math.floor(flat.cssHeight * 2));
    expect(sharp.outputScaleX).toBeCloseTo(2, 2);
    expect(sharp.outputScaleY).toBeCloseTo(2, 2);
  });

  it('caps the backing store uniformly', () => {
    const cssWidth = 3000;
    const cssHeight = 4000;
    const scale = pdfOutputScale(cssWidth, cssHeight, 3);
    const backingWidth = Math.floor(cssWidth * scale);
    const backingHeight = Math.floor(cssHeight * scale);
    expect(Math.max(backingWidth, backingHeight)).toBeLessThanOrEqual(PDF_MAX_CANVAS_EDGE_PX);
    expect(backingWidth * backingHeight).toBeLessThanOrEqual(PDF_MAX_CANVAS_PIXELS);
    expect(aspect(backingWidth, backingHeight)).toBeCloseTo(aspect(cssWidth, cssHeight), 2);
    expect(scale).toBeLessThan(3);
  });

  it('fits the scrollport height without stretching the page', () => {
    const zoom = fitPageZoom(PANE, 480, LETTER.width, LETTER.height);
    const plan = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, zoom, 2);
    expect(aspect(plan.cssWidth, plan.cssHeight)).toBeCloseTo(aspect(LETTER.width, LETTER.height), 5);
    expect(plan.cssHeight).toBeLessThanOrEqual(480);
    expect(plan.cssHeight).toBeGreaterThan(460);
  });

  it('leaves a stored 180% zoom untouched until Fit width is chosen', () => {
    expect(normalizePdfZoom(1.8)).toBe(1.8);
    expect(PDF_FIT_WIDTH_ZOOM).toBe(1);
    expect(normalizePdfZoom(1.8)).not.toBe(PDF_FIT_WIDTH_ZOOM);
  });

  it('restores the in-page offset and horizontal position after a resize', () => {
    const before = [500, 500, 500];
    const anchor = capturePdfScrollAnchor({
      scrollTop: 640,
      scrollLeft: 120,
      clientWidth: PANE,
      scrollWidth: PANE + 240,
      pageHeights: before,
      gap: PDF_PAGE_GAP_PX,
      page: 2,
    });
    expect(anchor.page).toBe(2);
    expect(anchor.offsetRatio).toBeCloseTo((640 - (500 + PDF_PAGE_GAP_PX)) / 500, 5);
    expect(anchor.horizontalRatio).toBeCloseTo(0.5, 5);

    const after = before.map(height => height * 1.5);
    const scrollTop = scrollTopForAnchor(anchor, after, PDF_PAGE_GAP_PX);
    const scrollLeft = scrollLeftForAnchor(anchor, 1440, PANE);
    expect(pageAtViewportCenter(scrollTop, 400, after, PDF_PAGE_GAP_PX)).toBe(2);
    expect(scrollLeft).toBeCloseTo((1440 - PANE) * 0.5, 5);
  });

  it('collapses a burst of resize events into one render', () => {
    const times = [0, 16, 32, 48, 64, 400, 416];
    expect(pdfResizeRenderTimes(times, 100)).toEqual([164, 516]);
  });

  it('keeps a normalized overlay on the same fraction of the page box', () => {
    const plan = pdfCanvasRenderPlan(LETTER.width, LETTER.height, PANE, 1.5, 2);
    const region = { x: 0.1, y: 0.2, w: 0.3, h: 0.25 };
    expect(region.x * plan.cssWidth).toBeCloseTo(0.1 * plan.cssWidth, 5);
    expect(region.y * plan.cssHeight).toBeCloseTo(0.2 * plan.cssHeight, 5);
    expect((region.x + region.w) * plan.cssWidth).toBeLessThanOrEqual(plan.cssWidth);
    expect(aspect(plan.cssWidth, plan.cssHeight)).toBeCloseTo(aspect(LETTER.width, LETTER.height), 5);
  });
});
