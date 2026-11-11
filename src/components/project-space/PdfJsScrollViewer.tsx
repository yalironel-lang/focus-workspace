import type { NormalizedPageRegion } from "../../lib/pdfGeometry/normalizedPageRegion";
import { assessPdfPageTextLayer } from "../../lib/ai/tutor/assessPdfPageTextLayer";
import { assessCaptureRegionExtraction } from "../../lib/ai/tutor/captureRegionDiagnostics";
import { extractPdfTextFromRegion, type PdfTextContent } from "../../lib/ai/tutor/pdfTutorTextExtraction";
import {
  renderPdfRegionImage,
  type RenderPdfRegionImageResult,
} from "../../lib/ai/visualCapture/renderPdfRegionImage";
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
  computeRenderWindow,
  pageAtViewportCenter,
  PDF_PAGE_GAP_PX,
  PDF_RENDER_BUFFER_PAGES,
  scrollTopForPage,
} from '../../lib/pdfPageVisibility';
import {
  capturePdfScrollAnchor,
  fitPageZoom,
  pdfFitScale,
  pdfOutputScale,
  pdfPageCssBox,
  PDF_RESIZE_DEBOUNCE_MS,
  scrollLeftForAnchor,
  scrollTopForAnchor,
  type PdfScrollAnchor,
} from '../../lib/pdfRenderGeometry';
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
  onExtractTextReady?: (
    extractor: (page: number, region: NormalizedPageRegion) => Promise<string | undefined>,
    probePageTextLayer: (
      page: number,
    ) => Promise<import('../../lib/ai/tutor/useTutorPdfCapture').PageTextLayerProbe>,
    assessRegion: (
      page: number,
      region: NormalizedPageRegion,
    ) => Promise<import('../../lib/ai/tutor/captureRegionDiagnostics').CaptureRegionDiagnostics | null>,
    renderRegionImage: (
      page: number,
      region: NormalizedPageRegion,
    ) => Promise<RenderPdfRegionImageResult>,
  ) => void;
  /** Increment to fit the visible page to the scrollport height. */
  fitPageToken?: number;
  /** Writes a zoom chosen by Fit page. Does not run for stored zoom values. */
  onCommitZoom?: (zoom: number) => void;
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
  onExtractTextReady,
  fitPageToken = 0,
  onCommitZoom,
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
  const pageRef = useRef(page);
  const zoomRef = useRef(zoom);
  const prevZoomRef = useRef(zoom);
  const scrollDetectRafRef = useRef<number | null>(null);
  const textContentCacheRef = useRef<Map<number, { content: PdfTextContent; width: number; height: number }>>(new Map());
  const pageSizeRef = useRef<Map<number, { width: number; height: number }>>(new Map());
  const layoutGenRef = useRef(0);
  const resizeTimerRef = useRef<number | null>(null);
  const fitPageTokenRef = useRef(0);

  pageRef.current = page;
  zoomRef.current = zoom;

  const [numPages, setNumPages] = useState(0);
  const [pageHeights, setPageHeights] = useState<number[]>([]);
  const [pageWidths, setPageWidths] = useState<number[]>([]);
  const [renderScale, setRenderScale] = useState(1);
  const [renderWindow, setRenderWindow] = useState({ start: 0, end: -1 });
  const [restored, setRestored] = useState(false);
  const [visiblePage, setVisiblePage] = useState(page);
  const [loadError, setLoadError] = useState(false);

  pageHeightsRef.current = pageHeights;
  visiblePageRef.current = visiblePage;

  const loadPageTextContent = useCallback(async (pageNum: number) => {
    const pdf = pdfRef.current;
    if (!pdf) return null;
    let cached = textContentCacheRef.current.get(pageNum);
    if (!cached) {
      const pdfPage = await pdf.getPage(pageNum);
      const viewport = pdfPage.getViewport({ scale: 1 });
      cached = {
        content: (await pdfPage.getTextContent()) as unknown as PdfTextContent,
        width: viewport.width,
        height: viewport.height,
      };
      textContentCacheRef.current.set(pageNum, cached);
    }
    return cached;
  }, []);

  const extractText = useCallback(async (pageNum: number, region: NormalizedPageRegion) => {
    const resolved = await loadPageTextContent(pageNum);
    return resolved
      ? extractPdfTextFromRegion(resolved.content, resolved.width, resolved.height, region)
      : undefined;
  }, [loadPageTextContent]);

  const probePageTextLayer = useCallback(async (pageNum: number) => {
    const resolved = await loadPageTextContent(pageNum);
    if (!resolved) {
      return {
        kind: 'empty' as const,
        itemCount: 0,
        meaningfulCharCount: 0,
        hasReadableText: false,
      };
    }
    const assessment = assessPdfPageTextLayer(
      resolved.content,
      resolved.width,
      resolved.height,
    );
    return {
      ...assessment,
      /** Useful full-page native text only — not a single leftover glyph. */
      hasReadableText: assessment.kind === 'useful',
    };
  }, [loadPageTextContent]);

  const assessRegion = useCallback(async (pageNum: number, region: NormalizedPageRegion) => {
    const resolved = await loadPageTextContent(pageNum);
    if (!resolved) return null;
    return assessCaptureRegionExtraction(
      resolved.content,
      resolved.width,
      resolved.height,
      region,
    );
  }, [loadPageTextContent]);

  const renderRegionImage = useCallback(
    async (pageNum: number, region: NormalizedPageRegion): Promise<RenderPdfRegionImageResult> => {
      const pdf = pdfRef.current;
      if (!pdf) return { ok: false, code: 'render_failed' };
      return renderPdfRegionImage({ pdf, pageNumber: pageNum, region });
    },
    [],
  );

  useEffect(() => {
    onExtractTextReady?.(extractText, probePageTextLayer, assessRegion, renderRegionImage);
  }, [extractText, probePageTextLayer, assessRegion, renderRegionImage, onExtractTextReady]);

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
    textContentCacheRef.current.clear();
    pageSizeRef.current.clear();
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

  const ensurePageSizes = useCallback(async (pdf: PDFDocumentProxy) => {
    if (pageSizeRef.current.size === pdf.numPages) return;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (pageSizeRef.current.has(i)) continue;
      const pdfPage = await pdf.getPage(i);
      const viewport = pdfPage.getViewport({ scale: 1 });
      pageSizeRef.current.set(i, { width: viewport.width, height: viewport.height });
    }
  }, []);

  const layoutFromCache = useCallback((width: number, zoomLevel: number, totalPages: number) => {
    const first = pageSizeRef.current.get(1);
    const fitScale = pdfFitScale(width, first?.width ?? 1);
    const scale = fitScale * zoomLevel;
    const heights: number[] = [];
    const widths: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const size = pageSizeRef.current.get(i) ?? first ?? { width: 1, height: 1 };
      const box = pdfPageCssBox(size.width, size.height, fitScale, zoomLevel);
      widths.push(box.cssWidth);
      heights.push(box.cssHeight);
    }
    return { scale, heights, widths };
  }, []);

  const applyLayoutAndRestore = useCallback(
    async (anchor?: PdfScrollAnchor) => {
      const pdf = pdfRef.current;
      const el = scrollRef.current;
      if (!pdf || !el || containerWidthRef.current <= 0) return;
      const gen = ++layoutGenRef.current;
      await ensurePageSizes(pdf);
      if (gen !== layoutGenRef.current || !pdfRef.current) return;
      const { scale, heights, widths } = layoutFromCache(
        containerWidthRef.current,
        zoomRef.current,
        pdf.numPages,
      );
      const fallbackPage = clampPage(anchor?.page ?? pageRef.current, pdf.numPages, pageCount);
      const scrollAnchor: PdfScrollAnchor = anchor ?? {
        page: fallbackPage,
        offsetRatio: 0,
        horizontalRatio: 0,
      };
      cancelAllRenderTasks();
      setRenderScale(scale);
      setPageHeights(heights);
      setPageWidths(widths);
      pageHeightsRef.current = heights;
      isRestoringRef.current = true;
      isProgrammaticScrollRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gen !== layoutGenRef.current) return;
          const scroller = scrollRef.current;
          if (!scroller) return;
          scroller.scrollTop = scrollTopForAnchor(scrollAnchor, heights, PDF_PAGE_GAP_PX);
          scroller.scrollLeft = scrollLeftForAnchor(
            scrollAnchor,
            scroller.scrollWidth,
            scroller.clientWidth,
          );
          updateRenderWindowFromScroll();
          visiblePageRef.current = scrollAnchor.page;
          setVisiblePage(scrollAnchor.page);
          onVisiblePageChange(scrollAnchor.page);
          lastExternalPageRef.current = scrollAnchor.page;
          setRestored(true);
          layoutReadyRef.current = true;
          window.setTimeout(() => {
            if (gen !== layoutGenRef.current) return;
            isRestoringRef.current = false;
            isProgrammaticScrollRef.current = false;
          }, 150);
        });
      });
    },
    [pageCount, ensurePageSizes, layoutFromCache, cancelAllRenderTasks, updateRenderWindowFromScroll, onVisiblePageChange],
  );

  const captureAnchor = useCallback((): PdfScrollAnchor | undefined => {
    const el = scrollRef.current;
    const heights = pageHeightsRef.current;
    if (!el || heights.length === 0) return undefined;
    return capturePdfScrollAnchor({
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      pageHeights: heights,
      gap: PDF_PAGE_GAP_PX,
      page: visiblePageRef.current,
    });
  }, []);

  const renderPage = useCallback(
    async (pageNum: number, scale: number, cssWidth: number, cssHeight: number, gen: number) => {
      const pdf = pdfRef.current;
      const canvas = canvasRefs.current.get(pageNum);
      if (!pdf || !canvas || cssWidth <= 0 || cssHeight <= 0) return;

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
        const viewport = pdfPage.getViewport({ scale });
        const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
        const outputScale = pdfOutputScale(cssWidth, cssHeight, dpr);
        const backingWidth = Math.max(1, Math.floor(cssWidth * outputScale));
        const backingHeight = Math.max(1, Math.floor(cssHeight * outputScale));
        canvas.width = backingWidth;
        canvas.height = backingHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        if (!ctx || gen !== renderGenRef.current) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const outputScaleX = backingWidth / cssWidth;
        const outputScaleY = backingHeight / cssHeight;
        const task = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: [outputScaleX, 0, 0, outputScaleY, 0, 0],
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
    pageHeightsRef.current = [];
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

      if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        void applyLayoutAndRestore(captureAnchor());
      }, PDF_RESIZE_DEBOUNCE_MS);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [numPages, restored, applyLayoutAndRestore, captureAnchor]);

  useEffect(() => {
    if (!layoutReadyRef.current || numPages === 0) return;
    if (zoom === prevZoomRef.current) return;
    prevZoomRef.current = zoom;
    if (!pdfRef.current || containerWidthRef.current <= 0) return;
    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }
    void applyLayoutAndRestore(captureAnchor());
  }, [zoom, numPages, applyLayoutAndRestore, captureAnchor]);

  useEffect(() => {
    if (!fitPageToken || fitPageToken === fitPageTokenRef.current) return;
    fitPageTokenRef.current = fitPageToken;
    const el = scrollRef.current;
    const first = pageSizeRef.current.get(1);
    const current = pageSizeRef.current.get(visiblePageRef.current) ?? first;
    if (!el || !first || !current || !onCommitZoom) return;
    onCommitZoom(fitPageZoom(el.clientWidth, el.clientHeight, first.width, current.height));
  }, [fitPageToken, onCommitZoom]);

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

  if (numPages === 0 || pageHeights.length === 0 || pageWidths.length === 0) {
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
      style={{
        backgroundColor,
        touchAction: 'pan-x pan-y',
        visibility: restored ? 'visible' : 'hidden',
      }}
      onScroll={onScroll}
    >
      <div className="flex flex-col items-center py-1" style={{ minWidth: '100%', width: 'max-content' }}>
        {pageHeights.map((height, index) => {
          const pageNum = index + 1;
          const width = pageWidths[index] ?? 0;
          const inWindow = index >= renderWindow.start && index <= renderWindow.end;
          return (
            <div
              key={pageNum}
              data-page={pageNum}
              data-testid="pdf-page-slot"
              className="relative shrink-0"
              style={{
                width,
                height,
                marginBottom: index < pageHeights.length - 1 ? PDF_PAGE_GAP_PX : 0,
                overflow: renderPageOverlay && visiblePage === pageNum ? 'visible' : 'hidden',
                zIndex: visiblePage === pageNum ? 10 : 1,
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
              {renderPageOverlay && visiblePage === pageNum ? renderPageOverlay(pageNum) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
