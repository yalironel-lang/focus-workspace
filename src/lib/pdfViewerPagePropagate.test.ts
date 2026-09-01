import { describe, expect, it, vi } from 'vitest';
import {
  createPagePersistScheduler,
  PAGE_PERSIST_DEBOUNCE_MS,
} from './pdfViewerController';
import { applyPdfVisiblePageToContent, formatPdfToolbarPageLabel, pdfToolbarDisplayPage } from './pdfViewerState';

describe('PDF visible page → content.page propagation', () => {
  const baseContent = {
    type: 'pdf' as const,
    fileName: 'test.pdf',
    fileType: 'application/pdf',
    fileSize: 1000,
    lastOpenedAt: 1,
    page: 5,
    zoom: 1,
    pageCount: 30,
  };

  it('natural visible-page change updates content.page immediately', () => {
    const next = applyPdfVisiblePageToContent(baseContent, 19);
    expect(next).not.toBeNull();
    expect(next!.page).toBe(19);
  });

  it('parent callback path receives final page when simulating onChange chain', () => {
    let content = { ...baseContent };
    const onChange = (next: typeof content) => {
      content = next;
    };

    const visiblePage = 12;
    const patch = applyPdfVisiblePageToContent(content, visiblePage);
    expect(patch).not.toBeNull();
    onChange(patch!);

    expect(content.page).toBe(12);
  });

  it('does not emit when visible page matches content.page', () => {
    expect(applyPdfVisiblePageToContent(baseContent, 5)).toBeNull();
  });
});

describe('PDF toolbar live page display', () => {
  it('toolbar uses live visiblePage not persisted content.page', () => {
    const visiblePage = 31;
    const contentPage = 29;
    const displayPage = pdfToolbarDisplayPage(visiblePage, 40);
    expect(displayPage).toBe(31);
    expect(displayPage).not.toBe(contentPage);
    expect(formatPdfToolbarPageLabel(displayPage, 40)).toBe('Page 31 / 40');
  });

  it('viewer callback → card live state → toolbar label', () => {
    let visiblePage = 29;
    const onVisiblePageChange = (page: number) => {
      visiblePage = pdfToolbarDisplayPage(page, 40);
    };

    onVisiblePageChange(30);
    expect(formatPdfToolbarPageLabel(visiblePage, 40)).toBe('Page 30 / 40');

    onVisiblePageChange(31);
    expect(formatPdfToolbarPageLabel(visiblePage, 40)).toBe('Page 31 / 40');
  });
});

describe('viewer debounce cancel regression (why viewer debounce was removed)', () => {
  it('scheduler cancel on effect cleanup prevents persist from ever firing', () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    let scheduler = createPagePersistScheduler(persist, PAGE_PERSIST_DEBOUNCE_MS);

    scheduler.schedule(16);
    // Simulates React useEffect cleanup when onPagePersist identity changes
    // (e.g. after visiblePage state update recreates handlePagePersist).
    scheduler.cancel();
    scheduler = createPagePersistScheduler(persist, PAGE_PERSIST_DEBOUNCE_MS);

    vi.advanceTimersByTime(PAGE_PERSIST_DEBOUNCE_MS);
    expect(persist).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
