/**
 * M0.3 — compact Explain result panel (read-only).
 * Portaled chrome associated with the TipTap selection-toolbar session.
 */

import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import type { ExplainSelectionState } from '../../../lib/ai/explainSelection';
import {
  computeExplainPanelTop,
  isExplainRetryAllowed,
  userFacingExplainErrorMessage,
} from '../../../lib/ai/explainSelection';
import { AiExplanationContent } from './AiExplanationContent';

type Props = {
  state: ExplainSelectionState;
  anchor: { top: number; left: number; width: number } | null;
  borderColor?: string;
  onClose: () => void;
  onRetry: () => void;
};

export function NotebookExplainSelectionPanel({
  state,
  anchor,
  borderColor = 'rgba(255,255,255,0.12)',
  onClose,
  onRetry,
}: Props) {
  if (state.phase === 'idle' || typeof document === 'undefined') return null;

  const top = computeExplainPanelTop({ anchorTop: anchor?.top ?? null });
  const left = anchor ? anchor.left : 24;
  const width = Math.min(anchor?.width ?? 360, typeof window !== 'undefined' ? window.innerWidth - 24 : 360);
  const showRetry =
    state.phase === 'error' &&
    state.frozenContext != null &&
    isExplainRetryAllowed(state.errorCode);
  const errorText =
    state.phase === 'error'
      ? userFacingExplainErrorMessage(state.errorCode, state.errorMessage)
      : null;

  return createPortal(
    <div
      role="dialog"
      aria-label="Explanation · Beta"
      aria-busy={state.phase === 'loading'}
      data-nb-candidate-explain-panel="1"
      style={{
        position: 'fixed',
        zIndex: 10050,
        top,
        left: Math.max(12, Math.min(left, (typeof window !== 'undefined' ? window.innerWidth : 400) - width - 12)),
        width,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'min(40vh, 320px)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 10,
        border: `1px solid ${borderColor}`,
        background: 'rgba(10, 14, 24, 0.97)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(12px)',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
      onMouseDown={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={e => {
        e.stopPropagation();
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: 'rgba(226,232,240,0.95)',
          }}
        >
          Explanation · Beta
        </div>
        <button
          type="button"
          data-nb-candidate-explain-close="1"
          aria-label="Close explanation"
          className="nb-toolbar-btn"
          style={{ padding: 4, color: 'rgba(148,163,184,0.9)' }}
          onPointerDown={e => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div
        style={{
          padding: '10px 12px',
          overflowY: 'auto',
          flex: 1,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'rgba(203,213,225,0.95)',
          whiteSpace: 'pre-wrap',
        }}
        data-nb-candidate-explain-body="1"
      >
        {state.phase === 'loading' ? (
          <div
            data-nb-candidate-explain-loading="1"
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(148,163,184,0.95)' }}
          >
            <Loader2 size={16} className="animate-spin" aria-hidden />
            <span>Explaining selection…</span>
          </div>
        ) : null}

        {state.phase === 'success' && state.resultText != null ? (
          <div data-nb-candidate-explain-success="1">
            <AiExplanationContent text={state.resultText} />
          </div>
        ) : null}

        {state.phase === 'error' ? (
          <div data-nb-candidate-explain-error="1">
            <div style={{ color: '#fca5a5', marginBottom: 10 }}>{errorText}</div>
            {showRetry ? (
              <button
                type="button"
                data-nb-candidate-explain-retry="1"
                className="nb-toolbar-btn"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  background: 'rgba(59, 130, 246, 0.25)',
                  color: '#93c5fd',
                }}
                onPointerDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRetry();
                }}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
