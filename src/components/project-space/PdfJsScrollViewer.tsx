import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { loadPdfDocument } from '../../lib/pdfjsBootstrap';
import {
  computePdfCanvasRenderMetrics,
  computePdfFitZoomScale,
} from '../../lib/pdfCanvasRender';
import {
  computeRenderWindow,
  pageAtViewportCenter,
  PDF_PAGE_GAP_PX,
  PDF_RENDER_BUFFER_PAGES,
  scrollTopForPage,
} from '../../lib/pdfPageVisibility';
import {
  normalizePageForPersist,
  shouldEmitPagePersist,
} from '../../lib/pdfViewerController';

export interface PdfJsScrollViewerProps {
  blobUrl: string;
  page: number;
  zoom: number;
  pageCount?: number;
  backgroundColor: string;
  onVisiblePageChange: (page: number) => void;
  onPagePersist: (page: number) => void;
  onError?: () => void;
  renderPageOverlay?: (page: number) => ReactNode;
}

function clampPage(page: number, numPages: number, pageCount?: number): number {
  const max = pageCount && pageCount > 0 ? Math.min(pageCount, numPages) : numPages;
  return Math.max(1, Math.min(max, Math.floor(page)));
}

export function PdfJsScrollViewer({
  blobUrl,
  page,
  zoom,
  pageCount,
  backgroundColor,
  onVisiblePageChange,
  onPagePersist,
  onError,
  renderPageOverlay,
}: PdfJsScrollViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());
  const renderGenRef = useRef(0);
  const visiblePageRef = useRef(page);
  const isRestoringRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const lastExternalPageRef = useRef(page);
  const containerWidthRef = useRef(0);
  const layoutReadyRef = useRef(false);
  const pageHeightsRef = useRef<number[]>([]);
  const pageWidthsRef = useRef<number[]>([]);
  const pageRef = useRef(page);
  const zoomRef = useRef(zoom);
  const prevZoomRef = useRef(zoom);
  const scrollDetectRafRef = useRef<number | null>(null);

  pageRef.current = page;
  zoomRef.current = zoom;

  const renderScaleRef = useRef(1);
  const [numPages, setNumPages] = useState(0);
  const [pageHeights, setPageHeights] = useState<number[]>([]);
  const [pageWidths, setPageWidths] = useState<number[]>([]);
  const [renderScale, setRenderScale] = useState(1);
  const [renderWindow, setRenderWindow] = useState({ start: 0, end: -1 });
  const [restored, setRestored] = useState(false);
  const [visiblePage, setVisiblePage] = useState(page);
  const [loadError, setLoadError] = useState(false);

  pageHeightsRef.current = pageHeights;
  pageWidthsRef.current = pageWidths;
  visiblePageRef.current = visiblePage;
  renderScaleRef.current = renderScale;

  const cancelAllRenderTasks = useCallback(() => {
    for (const task of renderTasksRef.current.values()) {
      try {
        task.cancel();
      } catch {
        /* ignore */
      }
    }
    renderTasksRef.current.clear();
    renderGenRef.current += 1;
  }, []);

  const destroyPdf = useCallback(() => {
    cancelAllRenderTasks();
    if (pdfRef.current) {
      try {
        void pdfRef.current.destroy();
      } catch {
        /* ignore */
      }
      pdfRef.current = null;
    }
  }, [cancelAllRenderTasks]);

  const scrollToPageIndex = useCallback((targetPage: number, heights: number[]) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = scrollTopForPage(targetPage, heights, PDF_PAGE_GAP_PX);
  }, []);

  const updateRenderWindowFromScroll = useCallback(() => {
    const el = scrollRef.current;
    const heights = pageHeightsRef.current;
    if (!el || heights.length === 0) return;
    const next = computeRenderWindow(
      el.scrollTop,
      el.clientHeight,
      heights,
      PDF_RENDER_BUFFER_PAGES,
      PDF_PAGE_GAP_PX,
    );
    setRenderWindow(prev =>
      prev.start === next.start && prev.end === next.end ? prev : next,
    );
  }, []);

  const onPagePersistRef = useRef(onPagePersist);
  const onVisiblePageChangeRef = useRef(onVisiblePageChange);
  onPagePersistRef.current = onPagePersist;
  onVisiblePageChangeRef.current = onVisiblePageChange;

  const emitPagePersist = useCallback(
    (clamped: number) => {
      const normalized = normalizePageForPersist(clamped, pageCount ?? numPages);
      onPagePersistRef.current(normalized);
    },
    [pageCount, numPages],
  );

  const reportVisiblePage = useCallback(
    (nextPage: number, source: 'scroll' | 'toolbar' | 'restore') => {
      const clamped = clampPage(nextPage, numPages || nextPage, pageCount);
      if (clamped === visiblePageRef.current) return;
      visiblePageRef.current = clamped;
      setVisiblePage(clamped);
      onVisiblePageChangeRef.current(clamped);
      if (
        shouldEmitPagePersist(
          source,
          isRestoringRef.current,
          isProgrammaticScrollRef.current,
        )
      ) {
        emitPagePersist(clamped);
      }
    },
    [numPages, pageCount, emitPagePersist],
  );

  const detectPageFromScroll = useCallback(() => {
    if (isRestoringRef.current || isProgrammaticScrollRef.current) return;
    const el = scrollRef.current;
    const heights = pageHeightsRef.current;
    if (!el || heights.length === 0) return;
    const winner = pageAtViewportCenter(el.scrollTop, el.clientHeight, heights, PDF_PAGE_GAP_PX);
    reportVisiblePage(winner, 'scroll');
  }, [reportVisiblePage]);

  const scheduleScrollPageDetect = useCallback(() => {
    if (scrollDetectRafRef.current !== null) {
      cancelAnimationFrame(scrollDetectRafRef.current);
    }
    scrollDetectRafRef.current = requestAnimationFrame(() => {
      scrollDetectRafRef.current = null;
      detectPageFromScroll();
    });
  }, [detectPageFromScroll]);

  const computeLayout = useCallback(
    async (pdf: PDFDocumentProxy, width: number, zoomLevel: number) => {
      const firstPage = await pdf.getPage(1);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      const scale = computePdfFitZoomScale(width, baseViewport.width, zoomLevel);
      const heights: number[] = [];
      const widths: number[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = i === 1 ? firstPage : await pdf.getPage(i);
        const vp = p.getViewport({ scale });
        heights.push(vp.height);
        widths.push(vp.width);
      }
      return { scale, heights, widths };
    },
    [],
  );

  const applyLayoutAndRestore = useCallback(
    async (anchorPage?: number) => {
      const pdf = pdfRef.current;
      const el = scrollRef.current;
      if (!pdf || !el || containerWidthRef.current <= 0) return;
      const { scale, heights, widths } = await computeLayout(
        pdf,
        containerWidthRef.current,
        zoomRef.current,
      );
      const target = clampPage(anchorPage ?? pageRef.current, pdf.numPages, pageCount);
      cancelAllRenderTasks();
      renderScaleRef.current = scale;
      setRenderScale(scale);
      setPageHeights(heights);
      setPageWidths(widths);
      pageHeightsRef.current = heights;
      pageWidthsRef.current = widths;
      isRestoringRef.current = true;
      isProgrammaticScrollRef.current = true;
      requestAnimationFrame(() => {
        scrollToPageIndex(target, heights);
        updateRenderWindowFromScroll();
        visiblePageRef.current = target;
        setVisiblePage(target);
        onVisiblePageChange(target);
        lastExternalPageRef.current = target;
        setRestored(true);
        layoutReadyRef.current = true;
        window.setTimeout(() => {
          isRestoringRef.current = false;
          isProgrammaticScrollRef.current = false;
        }, 150);
      });
    },
    [
      pageCount,
      computeLayout,
      cancelAllRenderTasks,
      scrollToPageIndex,
      updateRenderWindowFromScroll,
      onVisiblePageChange,
    ],
  );

  const renderPage = useCallback(
    async (pageNum: number, scale: number, slotWidth: number, slotHeight: number, gen: number) => {
      const pdf = pdfRef.current;
      const canvas = canvasRefs.current.get(pageNum);
      if (!pdf || !canvas) return;

      const existing = renderTasksRef.current.get(pageNum);
      if (existing) {
        try {
          existing.cancel();
        } catch {
          /* ignore */
        }
        renderTasksRef.current.delete(pageNum);
      }

      try {
        const pdfPage = await pdf.getPage(pageNum);
        if (gen !== renderGenRef.current) return;
        // Stale zoom/layout: a newer applyLayoutAndRestore bumped gen or scale.
        if (scale !== renderScaleRef.current) return;
        const viewport = pdfPage.getViewport({ scale });
        if (gen !== renderGenRef.current) return;

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const metrics = computePdfCanvasRenderMetrics(viewport, dpr);

        canvas.width = metrics.backingWidth;
        canvas.height = metrics.backingHeight;
        // CSS must match page slot (logical viewport), never stretch via width:100%.
        canvas.style.width = `${Math.max(1, Math.floor(slotWidth || metrics.cssWidth))}px`;
        canvas.style.height = `${Math.max(1, Math.floor(slotHeight || metrics.cssHeight))}px`;
        canvas.style.display = 'block';

        const ctx = canvas.getContext('2d');
        if (!ctx || gen !== renderGenRef.current) return;
        // canvas.width reset clears transforms — avoid accumulating ctx.scale across zooms.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const task = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          ...(metrics.transform ? { transform: metrics.transform } : {}),
        });
        renderTasksRef.current.set(pageNum, task);
        await task.promise;
        if (gen === renderGenRef.current) {
          renderTasksRef.current.delete(pageNum);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
      }
    },
    [],
  );

  const scheduleRendersForWindow = useCallback(
    (
      window: { start: number; end: number },
      scale: number,
      heights: number[],
      widths: number[],
    ) => {
      const gen = renderGenRef.current;
      for (let i = window.start; i <= window.end; i++) {
        const pageNum = i + 1;
        void renderPage(pageNum, scale, widths[i] ?? 0, heights[i] ?? 0, gen);
      }
    },
    [renderPage],
  );

  // Load PDF only when blobUrl changes — not when content.page/zoom persist.
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setRestored(false);
    layoutReadyRef.current = false;
    prevZoomRef.current = zoomRef.current;
    isRestoringRef.current = true;
    setNumPages(0);
    setPageHeights([]);
    setPageWidths([]);
    pageHeightsRef.current = [];
    pageWidthsRef.current = [];
    destroyPdf();

    const run = async () => {
      try {
        const res = await fetch(blobUrl);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdf = await loadPdfDocument(buf);
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          onError?.();
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      destroyPdf();
    };
  }, [blobUrl, destroyPdf, onError]);

  // Wait for real container width before layout/restoration.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      if (width <= 0) return;

      const widthChanged = width !== containerWidthRef.current;
      containerWidthRef.current = width;

      const pdf = pdfRef.current;
      if (!pdf || numPages === 0) return;

      if (!layoutReadyRef.current) {
        void applyLayoutAndRestore();
        return;
      }

      if (!widthChanged) return;

      void applyLayoutAndRestore(visiblePageRef.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [numPages, applyLayoutAndRestore]);

  useEffect(() => {
    if (!layoutReadyRef.current || numPages === 0) return;
    if (zoom === prevZoomRef.current) return;
    prevZoomRef.current = zoom;
    if (!pdfRef.current || containerWidthRef.current <= 0) return;
    void applyLayoutAndRestore(visiblePageRef.current);
  }, [zoom, numPages, applyLayoutAndRestore]);

  useEffect(() => {
    if (!layoutReadyRef.current || pageHeightsRef.current.length === 0) return;
    if (page === lastExternalPageRef.current) return;
    lastExternalPageRef.current = page;
    const target = clampPage(page, numPages, pageCount);
    isProgrammaticScrollRef.current = true;
    scrollToPageIndex(target, pageHeightsRef.current);
    updateRenderWindowFromScroll();
    visiblePageRef.current = target;
    setVisiblePage(target);
    onVisiblePageChange(target);
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 120);
  }, [
    page,
    numPages,
    pageCount,
    scrollToPageIndex,
    updateRenderWindowFromScroll,
    onVisiblePageChange,
  ]);

  useEffect(() => {
    if (!restored || renderWindow.end < renderWindow.start || renderScale <= 0) return;
    scheduleRendersForWindow(renderWindow, renderScale, pageHeights, pageWidths);
    for (const [pageNum, task] of renderTasksRef.current.entries()) {
      const idx = pageNum - 1;
      if (idx < renderWindow.start || idx > renderWindow.end) {
        try {
          task.cancel();
        } catch {
          /* ignore */
        }
        renderTasksRef.current.delete(pageNum);
      }
    }
  }, [restored, renderWindow, renderScale, pageHeights, pageWidths, scheduleRendersForWindow]);

  const onScroll = useCallback(() => {
    updateRenderWindowFromScroll();
    scheduleScrollPageDetect();
  }, [updateRenderWindowFromScroll, scheduleScrollPageDetect]);

  if (loadError) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center text-[11px]"
        style={{ color: '#94a3b8', backgroundColor }}
      >
        Could not render PDF
      </div>
    );
  }

  if (numPages === 0 || pageHeights.length === 0) {
    return (
      <div
        ref={scrollRef}
        className="absolute inset-0"
        style={{ backgroundColor, opacity: restored ? 1 : 0 }}
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 overflow-auto"
      data-pdf-scroll-host="1"
      style={{
        backgroundColor,
        touchAction: 'pan-y',
        visibility: restored ? 'visible' : 'hidden',
      }}
      onScroll={onScroll}
    >
      <div className="flex flex-col items-center py-1" style={{ width: '100%' }}>
        {pageHeights.map((height, index) => {
          const pageNum = index + 1;
          const inWindow = index >= renderWindow.start && index <= renderWindow.end;
          const pageWidth = pageWidths[index] ?? containerWidthRef.current;
          return (
            <div
              key={pageNum}
              data-page={pageNum}
              className="relative shrink-0"
              style={{
                width: pageWidth > 0 ? pageWidth : '100%',
                height,
                marginBottom: index < pageHeights.length - 1 ? PDF_PAGE_GAP_PX : 0,
                overflow: 'hidden',
              }}
            >
              {inWindow ? (
                <canvas
                  ref={el => {
                    if (el) canvasRefs.current.set(pageNum, el);
                    else canvasRefs.current.delete(pageNum);
                  }}
                />
              ) : null}
              {renderPageOverlay && inWindow ? renderPageOverlay(pageNum) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
