/**
 * Handwriting canvas backing-store sizing (DPR cap + resize no-op helpers).
 * Keeps ink CSS coordinates stable while limiting GPU/memory cost on high-DPR phones.
 */

/** Max device-pixel ratio used for handwriting visible + commit bitmaps. */
export const HANDWRITING_BACKING_STORE_DPR_CAP = 2;

/** Ignore CSS size jitter smaller than this when treating layout as unchanged. */
export const HANDWRITING_BITMAP_CSS_EPSILON_PX = 0.5;

export function getHandwritingBackingStoreDpr(
  devicePixelRatio: number = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
): number {
  const raw = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(raw, HANDWRITING_BACKING_STORE_DPR_CAP);
}

export function handwritingCanvasBitmapSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio?: number,
): { width: number; height: number; dpr: number } {
  const dpr = getHandwritingBackingStoreDpr(devicePixelRatio);
  return {
    width: Math.max(0, Math.round(cssWidth * dpr)),
    height: Math.max(0, Math.round(cssHeight * dpr)),
    dpr,
  };
}

/** True when CSS box changed enough to warrant layout / paint updates. */
export function handwritingCssSizeChanged(
  prevCssW: number,
  prevCssH: number,
  nextCssW: number,
  nextCssH: number,
  epsilonCssPx: number = HANDWRITING_BITMAP_CSS_EPSILON_PX,
): boolean {
  return (
    Math.abs(nextCssW - prevCssW) > epsilonCssPx ||
    Math.abs(nextCssH - prevCssH) > epsilonCssPx
  );
}

/**
 * True when the canvas backing store should be reallocated to match capped DPR
 * for the given CSS size.
 */
export function shouldReallocateHandwritingBitmap(opts: {
  nextCssW: number;
  nextCssH: number;
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio?: number;
}): boolean {
  const { width, height } = handwritingCanvasBitmapSize(
    opts.nextCssW,
    opts.nextCssH,
    opts.devicePixelRatio,
  );
  return opts.canvasWidth !== width || opts.canvasHeight !== height;
}
