/**
 * PDFViewerModal — iframe-based, portaled to document.body.
 *
 * Why iframe instead of pdfjs canvas:
 *   - Canvas rendering blocked the main thread and caused lag on every
 *     parent re-render (task toggles, onUpdate calls, etc.).
 *   - The modal is now completely isolated from the React item tree via
 *     createPortal, so re-renders of GroupComponent / ItemComponent never
 *     touch the modal's DOM node.
 *
 * Why createPortal:
 *   - Prevents the modal from being caught inside the sorted items list.
 *   - React reconciliation of group items no longer affects the modal.
 *
 * Keyboard effect runs exactly once (empty deps) using a ref for onClose,
 * so no listener churn on every parent re-render.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, FileText, Loader2, AlertTriangle } from 'lucide-react';

interface PDFViewerModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export function PDFViewerModal({ url, title, onClose }: PDFViewerModalProps) {
  const [loaded,  setLoaded]  = useState(false);
  const [errored, setErrored] = useState(false);

  // Always keep a fresh reference to onClose without adding it to effect deps.
  // This prevents the keyboard listener from being re-attached on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Keyboard handler — mounted once, never re-runs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // intentionally empty — onCloseRef keeps it fresh

  const modal = (
    <div
      className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onCloseRef.current(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-slide-up"
        style={{ height: 'min(90vh, 900px)' }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
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
              onClick={() => onCloseRef.current()}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── PDF body ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative bg-slate-100">

          {/* Loading overlay — hidden once iframe fires onLoad */}
          {!loaded && !errored && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Loading PDF…</span>
            </div>
          )}

          {/* Error state — shown if iframe fails */}
          {errored && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              </div>
              <p className="text-sm text-slate-600 max-w-xs leading-relaxed">
                This PDF could not be displayed inline. Open it directly in your browser instead.
              </p>
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

          {/*
           * Browser-native PDF rendering via iframe.
           * Zero JS rendering overhead — the browser's PDF engine handles it.
           * onLoad fires when the content (including the PDF plugin) is ready.
           * onError fires if the resource is unreachable or blocked.
           */}
          {!errored && (
            <iframe
              key={url}
              src={url}
              title={title}
              className="w-full h-full border-0 rounded-b-2xl"
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
