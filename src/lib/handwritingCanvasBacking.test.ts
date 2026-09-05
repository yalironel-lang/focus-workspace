import { describe, expect, it } from 'vitest';
import {
  HANDWRITING_BACKING_STORE_DPR_CAP,
  getHandwritingBackingStoreDpr,
  handwritingCanvasBitmapSize,
  handwritingCssSizeChanged,
  shouldReallocateHandwritingBitmap,
} from './handwritingCanvasBacking';

describe('handwritingCanvasBacking', () => {
  it('caps DPR at HANDWRITING_BACKING_STORE_DPR_CAP', () => {
    expect(getHandwritingBackingStoreDpr(1)).toBe(1);
    expect(getHandwritingBackingStoreDpr(2)).toBe(2);
    expect(getHandwritingBackingStoreDpr(3)).toBe(HANDWRITING_BACKING_STORE_DPR_CAP);
    expect(getHandwritingBackingStoreDpr(3.5)).toBe(2);
  });

  it('falls back to 1 for invalid DPR', () => {
    expect(getHandwritingBackingStoreDpr(0)).toBe(1);
    expect(getHandwritingBackingStoreDpr(Number.NaN)).toBe(1);
    expect(getHandwritingBackingStoreDpr(-2)).toBe(1);
  });

  it('computes bitmap size from capped DPR', () => {
    expect(handwritingCanvasBitmapSize(100, 50, 3)).toEqual({
      width: 200,
      height: 100,
      dpr: 2,
    });
    expect(handwritingCanvasBitmapSize(100, 50, 1)).toEqual({
      width: 100,
      height: 50,
      dpr: 1,
    });
  });

  it('detects material CSS size changes with epsilon', () => {
    expect(handwritingCssSizeChanged(390, 480, 390.2, 480.1)).toBe(false);
    expect(handwritingCssSizeChanged(390, 480, 400, 480)).toBe(true);
  });

  it('no-ops reallocate when bitmap already matches capped target', () => {
    expect(
      shouldReallocateHandwritingBitmap({
        nextCssW: 390,
        nextCssH: 480,
        canvasWidth: 780,
        canvasHeight: 960,
        devicePixelRatio: 3,
      }),
    ).toBe(false);
  });

  it('reallocates when CSS size changes materially', () => {
    expect(
      shouldReallocateHandwritingBitmap({
        nextCssW: 844,
        nextCssH: 480,
        canvasWidth: 780,
        canvasHeight: 960,
        devicePixelRatio: 3,
      }),
    ).toBe(true);
  });

  it('reallocates uncapped legacy bitmaps down to the DPR cap', () => {
    expect(
      shouldReallocateHandwritingBitmap({
        nextCssW: 390,
        nextCssH: 480,
        canvasWidth: 1170,
        canvasHeight: 1440,
        devicePixelRatio: 3,
      }),
    ).toBe(true);
  });
});
