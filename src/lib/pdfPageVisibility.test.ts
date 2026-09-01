import { describe, expect, it, vi } from 'vitest';
import {
  computeRenderWindow,
  countActiveRenderSlots,
  pageAtViewportCenter,
  pickVisiblePage,
  scrollTopForPage,
  totalScrollHeight,
  PDF_PAGE_GAP_PX,
  PDF_RENDER_BUFFER_PAGES,
} from './pdfPageVisibility';
import {
  createPagePersistScheduler,
  normalizePageForPersist,
  shouldEmitPagePersist,
  PAGE_PERSIST_DEBOUNCE_MS,
} from './pdfViewerController';

describe('pickVisiblePage', () => {
  const root = { top: 0, bottom: 400 };

  it('picks page with greatest visible height', () => {
    const winner = pickVisiblePage([
      {
        page: 8,
        intersectionRatio: 0.4,
        boundingClientRect: { top: 50, bottom: 200, height: 300 },
        rootBounds: root,
      },
      {
        page: 9,
        intersectionRatio: 0.6,
        boundingClientRect: { top: 180, bottom: 380, height: 300 },
        rootBounds: root,
      },
    ]);
    expect(winner).toBe(9);
  });

  it('tie-breaks toward viewport center', () => {
    const winner = pickVisiblePage(
      [
        {
          page: 8,
          intersectionRatio: 0.5,
          boundingClientRect: { top: 100, bottom: 250, height: 300 },
          rootBounds: root,
        },
        {
          page: 9,
          intersectionRatio: 0.5,
          boundingClientRect: { top: 200, bottom: 350, height: 300 },
          rootBounds: root,
        },
      ],
      8,
    );
    expect(winner).toBe(8);
  });
});

describe('scrollTopForPage', () => {
  const heights = [100, 120, 140];

  it('returns 0 for page 1', () => {
    expect(scrollTopForPage(1, heights, PDF_PAGE_GAP_PX)).toBe(0);
  });

  it('sums prior page heights and gaps for page N', () => {
    expect(scrollTopForPage(3, heights, PDF_PAGE_GAP_PX)).toBe(100 + PDF_PAGE_GAP_PX + 120 + PDF_PAGE_GAP_PX);
  });
});

describe('totalScrollHeight', () => {
  it('includes gaps between pages', () => {
    expect(totalScrollHeight([100, 100, 100], PDF_PAGE_GAP_PX)).toBe(300 + 2 * PDF_PAGE_GAP_PX);
  });
});

describe('computeRenderWindow', () => {
  const heights = Array.from({ length: 200 }, () => 800);

  it('keeps render window bounded for a 200-page document', () => {
    const scrollTop = scrollTopForPage(100, heights, PDF_PAGE_GAP_PX);
    const { start, end } = computeRenderWindow(
      scrollTop,
      600,
      heights,
      PDF_RENDER_BUFFER_PAGES,
      PDF_PAGE_GAP_PX,
    );
    const active = end - start + 1;
    expect(active).toBeLessThanOrEqual(2 * PDF_RENDER_BUFFER_PAGES + 3);
    expect(active).toBeLessThan(20);
  });

  it('includes the visible page in the window', () => {
    const scrollTop = scrollTopForPage(12, heights, PDF_PAGE_GAP_PX);
    const { start, end } = computeRenderWindow(scrollTop, 600, heights);
    expect(start).toBeLessThanOrEqual(11);
    expect(end).toBeGreaterThanOrEqual(11);
  });
});

describe('countActiveRenderSlots', () => {
  it('stays bounded for 200 pages', () => {
    const count = countActiveRenderSlots(
      scrollTopForPage(50, Array(200).fill(800), PDF_PAGE_GAP_PX),
      700,
      200,
      800,
    );
    expect(count).toBeLessThan(15);
  });
});

describe('pdfViewerController', () => {
  it('blocks persistence during restoration', () => {
    expect(shouldEmitPagePersist('scroll', true, false)).toBe(false);
    expect(shouldEmitPagePersist('toolbar', true, false)).toBe(false);
  });

  it('blocks scroll persistence during programmatic scroll', () => {
    expect(shouldEmitPagePersist('scroll', false, true)).toBe(false);
    expect(shouldEmitPagePersist('toolbar', false, true)).toBe(true);
  });

  it('clamps invalid pages for persist', () => {
    expect(normalizePageForPersist(0, 30)).toBe(1);
    expect(normalizePageForPersist(50, 30)).toBe(30);
    expect(normalizePageForPersist(12, 30)).toBe(12);
  });

  it('debounces scroll-driven page persistence', () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    const scheduler = createPagePersistScheduler(persist, PAGE_PERSIST_DEBOUNCE_MS);
    scheduler.schedule(10);
    scheduler.schedule(11);
    scheduler.schedule(12);
    expect(persist).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PAGE_PERSIST_DEBOUNCE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(12);
    vi.useRealTimers();
  });

  it('flush emits pending page immediately', () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    const scheduler = createPagePersistScheduler(persist, PAGE_PERSIST_DEBOUNCE_MS);
    scheduler.schedule(7);
    scheduler.flush();
    expect(persist).toHaveBeenCalledWith(7);
    vi.useRealTimers();
  });

  it('cancel clears pending debounced page', () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    const scheduler = createPagePersistScheduler(persist, PAGE_PERSIST_DEBOUNCE_MS);
    scheduler.schedule(7);
    scheduler.cancel();
    vi.advanceTimersByTime(PAGE_PERSIST_DEBOUNCE_MS);
    expect(persist).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('pageAtViewportCenter', () => {
  const heights = [100, 100, 100, 100];

  it('returns page 1 when viewport center is on page 1', () => {
    expect(pageAtViewportCenter(0, 200, heights, PDF_PAGE_GAP_PX)).toBe(1);
  });

  it('returns page 3 when viewport center is on page 3', () => {
    const scrollTop = scrollTopForPage(3, heights, PDF_PAGE_GAP_PX);
    expect(pageAtViewportCenter(scrollTop, 50, heights, PDF_PAGE_GAP_PX)).toBe(3);
  });

  it('round-trips with scrollTopForPage for restoration', () => {
    for (let page = 1; page <= 4; page++) {
      const top = scrollTopForPage(page, heights, PDF_PAGE_GAP_PX);
      expect(pageAtViewportCenter(top, 80, heights, PDF_PAGE_GAP_PX)).toBe(page);
    }
  });
});

describe('toolbar jump targets correct page', () => {
  it('scrollTopForPage aligns toolbar page to layout index', () => {
    const heights = [500, 500, 500, 500];
    expect(scrollTopForPage(4, heights, PDF_PAGE_GAP_PX)).toBe(
      500 + PDF_PAGE_GAP_PX + 500 + PDF_PAGE_GAP_PX + 500 + PDF_PAGE_GAP_PX,
    );
  });
});

describe('independent PDF object state', () => {
  it('normalizes pages independently per object pageCount', () => {
    expect(normalizePageForPersist(37, 100)).toBe(37);
    expect(normalizePageForPersist(37, 20)).toBe(20);
  });
});
