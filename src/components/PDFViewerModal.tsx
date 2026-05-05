import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
// Vite serves the worker as a plain URL asset — no bundler config needed
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  X, ChevronLeft, ChevronRight, ExternalLink, Loader2, AlertTriangle, FileText,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface PDFViewerModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export function PDFViewerModal({ url, title, onClose }: PDFViewerModalProps) {
  const [pdfDoc,      setPdfDoc]      = useState<PDFDocumentProxy | null>(null);
  const [numPages,    setNumPages]    = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [rendering,   setRendering]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const renderTaskRef  = useRef<RenderTask | null>(null);

  // ── Load PDF document ──────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setCurrentPage(1);

    const task = pdfjsLib.getDocument({ url, cMapPacked: true });

    task.promise.then(doc => {
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load this PDF. You can still open it in a new tab.');
      setLoading(false);
    });

    return () => { task.destroy().catch(() => undefined); };
  }, [url]);

  // ── Render current page to canvas ──────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    renderTaskRef.current?.cancel();
    setRendering(true);

    let cancelled = false;

    pdfDoc.getPage(currentPage).then(page => {
      if (cancelled || !canvasRef.current) return;

      const containerWidth = (containerRef.current?.clientWidth ?? 800) - 48;
      const baseVp  = page.getViewport({ scale: 1 });
      const scale   = Math.min(containerWidth / baseVp.width, 2.5);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      canvas.width  = viewport.width;
      canvas.height = viewport.height;

      // pdfjs-dist v5: pass the canvas element directly (canvasContext deprecated)
      const renderTask = page.render({ canvas, viewport });
      renderTaskRef.current = renderTask;

      return renderTask.promise;
    }).then(() => {
      if (!cancelled) setRendering(false);
    }).catch(err => {
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
        setRendering(false);
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, currentPage]);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't steal keys from inputs / textareas
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentPage(p => Math.min(p + 1, numPages));
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(p - 1, 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages, onClose]);

  const goToPrev = () => setCurrentPage(p => Math.max(p - 1, 1));
  const goToNext = () => setCurrentPage(p => Math.min(p + 1, numPages));

  return (
    <div
      className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-slide-up"
        style={{ maxHeight: 'min(90vh, 900px)' }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800 truncate">{title}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open in new tab</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-6 min-h-0"
        >
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-3 text-slate-400 py-20">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Loading PDF…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex flex-col items-center gap-4 text-center max-w-xs py-16">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in new tab
              </a>
            </div>
          )}

          {/* Canvas */}
          {!loading && !error && (
            <div className="relative">
              {rendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg z-10">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              )}
              <canvas
                ref={canvasRef}
                className="rounded-lg shadow-lg block max-w-full"
              />
            </div>
          )}
        </div>

        {/* ── Footer — page controls ─────────────────────────────────────── */}
        {!loading && !error && numPages > 0 && (
          <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-slate-100 flex-shrink-0">
            <button
              onClick={goToPrev}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <span className="text-sm font-medium text-slate-500 tabular-nums min-w-[90px] text-center">
              Page {currentPage} / {numPages}
            </span>

            <button
              onClick={goToNext}
              disabled={currentPage >= numPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
