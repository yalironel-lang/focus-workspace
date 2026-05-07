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
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCloseRef.current(); }}
    >
      <div
        className="w-full max-w-4xl flex flex-col overflow-hidden animate-slide-up rounded-2xl"
        style={{
          height: 'min(90vh, 900px)',
          backgroundColor: '#0d1424',
          border: '1px solid #1a2638',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid #1a2638' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#f87171' }} />
            <span className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{title}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
              style={{ color: '#475569' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.backgroundColor = '#111d2e'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open in new tab</span>
            </a>
            <button
              onClick={() => onCloseRef.current()}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#334155' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = '#111d2e'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#334155'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── PDF body ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative" style={{ backgroundColor: '#070b14' }}>

          {/* Loading overlay — hidden once iframe fires onLoad */}
          {!loaded && !errored && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#334155' }} />
              <span className="text-sm" style={{ color: '#334155' }}>Loading PDF…</span>
            </div>
          )}

          {/* Error state — shown if iframe fails */}
          {errored && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-6">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <AlertTriangle className="w-7 h-7" style={{ color: '#f59e0b' }} />
              </div>
              <p className="text-sm max-w-xs leading-relaxed" style={{ color: '#475569' }}>
                This PDF could not be displayed inline. Open it directly in your browser instead.
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ backgroundColor: '#f59e0b', color: '#000' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
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
