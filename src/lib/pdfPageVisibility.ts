/**
 * Pure helpers for PDF scroll viewer page detection and layout.
 */

export const PDF_PAGE_GAP_PX = 4;
export const PDF_RENDER_BUFFER_PAGES = 2;

export interface PageVisibilitySample {
  page: number;
  intersectionRatio: number;
  boundingClientRect: { top: number; bottom: number; height: number };
  rootBounds: { top: number; bottom: number } | null;
}

/** Pick the page with the greatest visible area; tie-break by viewport center proximity. */
export function pickVisiblePage(
  samples: PageVisibilitySample[],
  currentPage?: number,
): number | null {
  const visible = samples.filter(s => s.intersectionRatio > 0);
  if (visible.length === 0) return null;

  let best = visible[0];
  let bestScore = -1;

  for (const sample of visible) {
    const root = sample.rootBounds;
    if (!root) continue;
    const visibleTop = Math.max(sample.boundingClientRect.top, root.top);
    const visibleBottom = Math.min(sample.boundingClientRect.bottom, root.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const score = visibleHeight;

    if (score > bestScore) {
      bestScore = score;
      best = sample;
      continue;
    }

    if (score === bestScore && root) {
      const rootCenter = (root.top + root.bottom) / 2;
      const sampleCenter =
        (sample.boundingClientRect.top + sample.boundingClientRect.bottom) / 2;
      const bestCenter = (best.boundingClientRect.top + best.boundingClientRect.bottom) / 2;
      const sampleDist = Math.abs(sampleCenter - rootCenter);
      const bestDist = Math.abs(bestCenter - rootCenter);
      if (sampleDist < bestDist) best = sample;
      else if (sampleDist === bestDist && currentPage !== undefined) {
        if (Math.abs(sample.page - currentPage) < Math.abs(best.page - currentPage)) {
          best = sample;
        }
      }
    }
  }

  return best.page;
}

/**
 * Page whose vertical span contains the viewport center (scrollTop-based).
 * Reliable alternative to IntersectionObserver partial-entry batches.
 */
export function pageAtViewportCenter(
  scrollTop: number,
  viewportHeight: number,
  pageHeights: readonly number[],
  gap = PDF_PAGE_GAP_PX,
): number {
  if (pageHeights.length === 0) return 1;
  const center = scrollTop + Math.max(1, viewportHeight) / 2;
  let offset = 0;
  let result = 1;
  for (let i = 0; i < pageHeights.length; i++) {
    const pageTop = offset;
    if (center >= pageTop) result = i + 1;
    offset = pageTop + pageHeights[i] + gap;
  }
  return result;
}

/** 1-based page → scrollTop offset inside the stacked layout. */
export function scrollTopForPage(
  page: number,
  pageHeights: readonly number[],
  gap = PDF_PAGE_GAP_PX,
): number {
  const target = Math.max(1, Math.floor(page));
  let top = 0;
  for (let i = 0; i < target - 1 && i < pageHeights.length; i++) {
    top += pageHeights[i] + gap;
  }
  return top;
}

/** Total scrollable content height for all pages. */
export function totalScrollHeight(
  pageHeights: readonly number[],
  gap = PDF_PAGE_GAP_PX,
): number {
  if (pageHeights.length === 0) return 0;
  const gaps = Math.max(0, pageHeights.length - 1) * gap;
  return pageHeights.reduce((sum, h) => sum + h, 0) + gaps;
}

/**
 * Inclusive page index window [start, end] to render given scroll position.
 * Only a bounded slice of pages should have active canvases.
 */
export function computeRenderWindow(
  scrollTop: number,
  viewportHeight: number,
  pageHeights: readonly number[],
  buffer = PDF_RENDER_BUFFER_PAGES,
  gap = PDF_PAGE_GAP_PX,
): { start: number; end: number } {
  const n = pageHeights.length;
  if (n === 0) return { start: 0, end: -1 };

  let offset = 0;
  let firstVisible = 0;
  for (let i = 0; i < n; i++) {
    const pageBottom = offset + pageHeights[i];
    if (pageBottom > scrollTop) {
      firstVisible = i;
      break;
    }
    offset = pageBottom + gap;
    if (i === n - 1) firstVisible = n - 1;
  }

  const viewportBottom = scrollTop + viewportHeight;
  offset = 0;
  let lastVisible = firstVisible;
  for (let i = 0; i < n; i++) {
    const pageTop = offset;
    const pageBottom = offset + pageHeights[i];
    if (pageBottom > scrollTop && pageTop < viewportBottom) {
      lastVisible = i;
    }
    offset = pageBottom + gap;
  }

  return {
    start: Math.max(0, firstVisible - buffer),
    end: Math.min(n - 1, lastVisible + buffer),
  };
}

/** Count of pages that would be actively rendered for a layout. */
export function countActiveRenderSlots(
  scrollTop: number,
  viewportHeight: number,
  pageCount: number,
  uniformPageHeight: number,
  buffer = PDF_RENDER_BUFFER_PAGES,
  gap = PDF_PAGE_GAP_PX,
): number {
  const heights = Array.from({ length: pageCount }, () => uniformPageHeight);
  const { start, end } = computeRenderWindow(scrollTop, viewportHeight, heights, buffer, gap);
  if (end < start) return 0;
  return end - start + 1;
}
