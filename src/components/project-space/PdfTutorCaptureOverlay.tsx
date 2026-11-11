import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { normPointFromClientRect } from '../../lib/pdfGeometry/normFromClient';
import type { NormalizedPageRegion } from '../../lib/pdfGeometry/normalizedPageRegion';
import { regionFromDragCorners } from '../../lib/ai/tutor/tutorCaptureGeometry';
import {
  TUTOR_CAPTURE_ACTION_OPTIONS,
  type TutorCaptureAction,
} from '../../lib/ai/tutor/tutorCaptureTypes';
import { Lightbulb, HelpCircle, Zap, X, Eye } from 'lucide-react';

type Props = {
  tokens: AtmosphereTokens;
  active: boolean;
  selection: NormalizedPageRegion | null;
  onCommitSelection: (region: NormalizedPageRegion | null) => void;
  onChooseAction: (action: TutorCaptureAction, options?: { forceVisual?: boolean }) => void;
  onClearSelection: () => void;
  onCancelCapture: () => void;
};

type DragState = {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
};

function actionIcon(action: TutorCaptureAction) {
  switch (action) {
    case 'hint':
      return <Lightbulb className="w-3.5 h-3.5 text-amber-400" />;
    case 'explain':
      return <HelpCircle className="w-3.5 h-3.5 text-sky-400" />;
    case 'solve':
      return <Zap className="w-3.5 h-3.5 text-emerald-400" />;
  }
}

export function PdfTutorCaptureOverlay({
  tokens,
  active,
  selection,
  onCommitSelection,
  onChooseAction,
  onClearSelection,
  onCancelCapture,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || !layerRef.current) return;
    if (e.button !== 0) return;
    onClearSelection();
    const rect = layerRef.current.getBoundingClientRect();
    const { x, y } = normPointFromClientRect(e.clientX, e.clientY, rect);
    setDrag({ startX: x, startY: y, curX: x, curY: y });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !layerRef.current) return;
    const rect = layerRef.current.getBoundingClientRect();
    const { x, y } = normPointFromClientRect(e.clientX, e.clientY, rect);
    setDrag(prev => (prev ? { ...prev, curX: x, curY: y } : null));
  };

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const region = regionFromDragCorners(drag.startX, drag.startY, drag.curX, drag.curY);
      onCommitSelection(region);
      setDrag(null);
    },
    [drag, onCommitSelection],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setDrag(null);
    },
    [drag],
  );

  if (!active && !selection) return null;

  const draft =
    drag &&
    ({
      left: `${Math.min(drag.startX, drag.curX) * 100}%`,
      top: `${Math.min(drag.startY, drag.curY) * 100}%`,
      width: `${Math.abs(drag.curX - drag.startX) * 100}%`,
      height: `${Math.abs(drag.curY - drag.startY) * 100}%`,
    } as const);

  const focusRect =
    selection && !drag
      ? ({
          left: `${selection.x * 100}%`,
          top: `${selection.y * 100}%`,
          width: `${selection.w * 100}%`,
          height: `${selection.h * 100}%`,
        } as const)
      : null;

  const showActions = !!selection && !drag;
  const actionTop = selection ? Math.min(94, (selection.y + selection.h) * 100 + 1.5) : 0;
  const actionLeft = selection ? Math.max(0, Math.min(65, selection.x * 100)) : 0;

  return (
    <div
      ref={layerRef}
      data-testid="pdf-tutor-capture-overlay"
      className="absolute inset-0 select-none"
      style={{
        zIndex: 35,
        cursor: active ? 'crosshair' : 'default',
        pointerEvents: active || showActions ? 'auto' : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Active dragging bounding box */}
      {draft && (
        <div
          data-testid="pdf-tutor-drag-rect"
          className="absolute pointer-events-none rounded border-2 border-indigo-400 bg-indigo-500/15"
          style={draft}
        />
      )}

      {/* Committed selection box */}
      {focusRect && (
        <div
          data-testid="pdf-tutor-selection-rect"
          className="absolute rounded border-2 border-indigo-400 bg-indigo-500/20 shadow-sm"
          style={focusRect}
        />
      )}

      {/* Action popover */}
      {showActions && (
        <div
          data-testid="pdf-tutor-action-popover"
          className="absolute z-50 flex items-center gap-1 p-1 rounded-xl shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          style={{
            top: `${actionTop}%`,
            left: `${actionLeft}%`,
            background: tokens.cardBg || 'rgba(15, 23, 42, 0.92)',
            border: `1px solid ${tokens.cardBorder || 'rgba(255, 255, 255, 0.15)'}`,
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.4)',
          }}
          onPointerDown={e => e.stopPropagation()}
        >
          {TUTOR_CAPTURE_ACTION_OPTIONS.map(opt => (
            <button
              key={opt.action}
              type="button"
              data-testid={`tutor-action-${opt.action}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-white/10 active:scale-95"
              style={{ color: tokens.textPrimary || '#fff' }}
              onClick={() => onChooseAction(opt.action)}
            >
              {actionIcon(opt.action)}
              <span>{opt.label}</span>
            </button>
          ))}
          <div className="w-px h-4 bg-white/15 mx-0.5" />
          <button
            type="button"
            data-testid="tutor-action-visual"
            aria-label="Understand visually"
            title="Understand selected area visually"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-white/10 active:scale-95"
            style={{ color: tokens.textPrimary || '#fff' }}
            onClick={() => onChooseAction('explain', { forceVisual: true })}
          >
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            <span>Visual</span>
          </button>
          <div className="w-px h-4 bg-white/15 mx-0.5" />
          <button
            type="button"
            data-testid="tutor-action-cancel"
            aria-label="Cancel selection"
            className="p-1.5 text-xs rounded-lg transition-colors hover:bg-white/10 active:scale-95"
            style={{ color: tokens.textSecondary || '#94a3b8' }}
            onClick={() => {
              onClearSelection();
              onCancelCapture();
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
