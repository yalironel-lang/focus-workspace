import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { PdfHighlightRegion } from '../../lib/pdfStudyMarks/types';
import type { PdfStudyMarksTool } from '../../lib/pdfStudyMarks/usePdfStudyMarks';

type Props = {
  tokens: AtmosphereTokens;
  regions: PdfHighlightRegion[];
  tool: PdfStudyMarksTool;
  onAddRegion: (rect: { x: number; y: number; w: number; h: number }) => void;
  onRemoveRegion: (id: string) => void;
};

type DragState = {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
};

function normFromEvent(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
    y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
  };
}

export function PdfStudyMarksOverlay({ tokens, regions, tool, onAddRegion, onRemoveRegion }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const finishDrag = useCallback(
    (d: DragState) => {
      const x1 = Math.min(d.startX, d.curX);
      const y1 = Math.min(d.startY, d.curY);
      const x2 = Math.max(d.startX, d.curX);
      const y2 = Math.max(d.startY, d.curY);
      onAddRegion({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    },
    [onAddRegion],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'highlight' || !layerRef.current) return;
    if (e.button !== 0) return;
    const { x, y } = normFromEvent(layerRef.current, e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ startX: x, startY: y, curX: x, curY: y });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !layerRef.current) return;
    const { x, y } = normFromEvent(layerRef.current, e.clientX, e.clientY);
    setDrag(prev => (prev ? { ...prev, curX: x, curY: y } : null));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    finishDrag(drag);
    setDrag(null);
  };

  const draft =
    drag &&
    ({
      left: `${Math.min(drag.startX, drag.curX) * 100}%`,
      top: `${Math.min(drag.startY, drag.curY) * 100}%`,
      width: `${Math.abs(drag.curX - drag.startX) * 100}%`,
      height: `${Math.abs(drag.curY - drag.startY) * 100}%`,
    } as const);

  return (
    <div
      ref={layerRef}
      aria-hidden={tool === 'view' && regions.length === 0}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4,
        pointerEvents: tool === 'highlight' ? 'auto' : regions.length ? 'auto' : 'none',
        cursor: tool === 'highlight' ? 'crosshair' : 'default',
        touchAction: tool === 'highlight' ? 'none' : 'auto',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {regions.map(r => (
        <button
          key={r.id}
          type="button"
          title="Remove highlight"
          aria-label="Remove highlight"
          onClick={e => {
            e.stopPropagation();
            onRemoveRegion(r.id);
          }}
          style={{
            position: 'absolute',
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
            margin: 0,
            padding: 0,
            border: `1px solid ${tokens.accent}66`,
            borderRadius: 2,
            background: `${tokens.accent}33`,
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        />
      ))}
      {draft ? (
        <div
          style={{
            position: 'absolute',
            ...draft,
            border: `1px dashed ${tokens.accent}`,
            background: `${tokens.accent}22`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}
