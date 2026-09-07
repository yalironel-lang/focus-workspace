import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { isInkPointer } from '../../lib/handwritingGeometry';
import { drawPenStrokeMathInk } from '../../lib/handwritingInk';
import type { HandwritingStroke } from '../../lib/handwritingTypes';
import {
  PDF_INK_DEFAULT_COLOR,
  PDF_INK_DEFAULT_WIDTH,
  type PdfHighlightRegion,
  type PdfInkPoint,
  type PdfInkStroke,
} from '../../lib/pdfStudyMarks/types';
import type { PdfStudyMarksTool } from '../../lib/pdfStudyMarks/usePdfStudyMarks';

type Props = {
  page: number;
  tokens: AtmosphereTokens;
  regions: PdfHighlightRegion[];
  strokes: PdfInkStroke[];
  tool: PdfStudyMarksTool;
  onAddRegion: (page: number, rect: { x: number; y: number; w: number; h: number }) => void;
  onRemoveRegion: (page: number, id: string) => void;
  onAddStroke: (page: number, stroke: Omit<PdfInkStroke, 'id'> & { id?: string }) => void;
  onRemoveStroke: (page: number, id: string) => void;
};

type DragState = {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
};

type DraftStroke = {
  points: PdfInkPoint[];
  pointerId: number;
};

function normFromEvent(el: HTMLElement, clientX: number, clientY: number): PdfInkPoint {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
    y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
  };
}

function findPdfScrollHost(from: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = from;
  while (el) {
    if (el.dataset?.pdfScrollHost === '1') return el;
    el = el.parentElement;
  }
  return null;
}

function toHandwritingStroke(stroke: PdfInkStroke): HandwritingStroke {
  return {
    id: stroke.id,
    tool: 'pen',
    color: stroke.color,
    width: stroke.width,
    points: stroke.points,
  };
}

function nearestStrokeId(strokes: PdfInkStroke[], x: number, y: number): string | null {
  let bestId: string | null = null;
  let best = 0.04; // ~4% of page diagonal-ish threshold in norm space
  for (const s of strokes) {
    for (const p of s.points) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) {
        best = d;
        bestId = s.id;
      }
    }
  }
  return bestId;
}

function paintInkCanvas(
  canvas: HTMLCanvasElement,
  strokes: PdfInkStroke[],
  draft: PdfInkPoint[] | null,
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, bw, bh);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const refWidth = cssW;
  for (const s of strokes) {
    drawPenStrokeMathInk(ctx, toHandwritingStroke(s), cssW, cssH, refWidth);
  }
  if (draft && draft.length > 0) {
    drawPenStrokeMathInk(
      ctx,
      {
        id: 'draft',
        tool: 'pen',
        color: PDF_INK_DEFAULT_COLOR,
        width: PDF_INK_DEFAULT_WIDTH,
        points: draft,
      },
      cssW,
      cssH,
      refWidth,
    );
  }
}

export function PdfStudyMarksOverlay({
  page,
  tokens,
  regions,
  strokes,
  tool,
  onAddRegion,
  onRemoveRegion,
  onAddStroke,
  onRemoveStroke,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<DraftStroke | null>(null);
  const draftRef = useRef<DraftStroke | null>(null);
  const fingerScrollRef = useRef<{
    pointerId: number;
    lastY: number;
    host: HTMLElement;
  } | null>(null);

  const interactive = tool === 'highlight' || tool === 'ink' || tool === 'eraser';
  const hasVisual = regions.length > 0 || strokes.length > 0 || !!draft;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintInkCanvas(canvas, strokes, draft?.points ?? null);
  }, [strokes, draft, page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      paintInkCanvas(canvas, strokes, draftRef.current?.points ?? null);
    });
    ro.observe(layer);
    return () => ro.disconnect();
  }, [strokes]);

  const finishDrag = useCallback(
    (d: DragState) => {
      const x1 = Math.min(d.startX, d.curX);
      const y1 = Math.min(d.startY, d.curY);
      const x2 = Math.max(d.startX, d.curX);
      const y2 = Math.max(d.startY, d.curY);
      onAddRegion(page, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    },
    [onAddRegion, page],
  );

  const commitDraft = useCallback(
    (d: DraftStroke | null) => {
      if (!d || d.points.length === 0) return;
      onAddStroke(page, {
        color: PDF_INK_DEFAULT_COLOR,
        width: PDF_INK_DEFAULT_WIDTH,
        points: d.points,
      });
    },
    [onAddStroke, page],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !layerRef.current) return;
    if (e.button !== 0) return;

    // Finger: scroll PDF; do not draw.
    if (e.nativeEvent.pointerType === 'touch') {
      const host = findPdfScrollHost(layerRef.current);
      if (!host) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      fingerScrollRef.current = { pointerId: e.pointerId, lastY: e.clientY, host };
      return;
    }

    if (!isInkPointer(e.nativeEvent)) return;

    const { x, y } = normFromEvent(layerRef.current, e.clientX, e.clientY);
    const pressure =
      typeof e.pressure === 'number' && e.pressure > 0 ? Math.min(1, e.pressure) : undefined;

    if (tool === 'highlight') {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setDrag({ startX: x, startY: y, curX: x, curY: y });
      return;
    }

    if (tool === 'eraser') {
      e.preventDefault();
      e.stopPropagation();
      const id = nearestStrokeId(strokes, x, y);
      if (id) onRemoveStroke(page, id);
      return;
    }

    if (tool === 'ink') {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const point: PdfInkPoint = pressure !== undefined ? { x, y, pressure } : { x, y };
      const next: DraftStroke = { pointerId: e.pointerId, points: [point] };
      draftRef.current = next;
      setDraft(next);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const finger = fingerScrollRef.current;
    if (finger && finger.pointerId === e.pointerId) {
      e.preventDefault();
      const dy = e.clientY - finger.lastY;
      finger.host.scrollTop -= dy;
      finger.lastY = e.clientY;
      return;
    }

    if (!layerRef.current) return;

    if (drag) {
      const { x, y } = normFromEvent(layerRef.current, e.clientX, e.clientY);
      setDrag(prev => (prev ? { ...prev, curX: x, curY: y } : null));
      return;
    }

    const active = draftRef.current;
    if (active && active.pointerId === e.pointerId) {
      e.preventDefault();
      const native = e.nativeEvent;
      const samples =
        typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
      const nextPoints = [...active.points];
      for (const sample of samples) {
        const { x, y } = normFromEvent(layerRef.current!, sample.clientX, sample.clientY);
        const pressure =
          typeof sample.pressure === 'number' && sample.pressure > 0
            ? Math.min(1, sample.pressure)
            : undefined;
        const last = nextPoints[nextPoints.length - 1];
        if (last && Math.hypot(last.x - x, last.y - y) < 0.0015) {
          if (pressure !== undefined) last.pressure = pressure;
          continue;
        }
        nextPoints.push(pressure !== undefined ? { x, y, pressure } : { x, y });
      }
      const next: DraftStroke = { ...active, points: nextPoints };
      draftRef.current = next;
      setDraft(next);
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const finger = fingerScrollRef.current;
    if (finger && finger.pointerId === e.pointerId) {
      fingerScrollRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (drag) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (commit) finishDrag(drag);
      setDrag(null);
      return;
    }

    const active = draftRef.current;
    if (active && active.pointerId === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (commit) commitDraft(active);
      draftRef.current = null;
      setDraft(null);
    }
  };

  const draftBox =
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
      data-pdf-page-overlay={page}
      aria-hidden={tool === 'view' && !hasVisual}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4,
        pointerEvents: interactive || regions.length > 0 ? 'auto' : 'none',
        cursor:
          tool === 'highlight' ? 'crosshair' : tool === 'ink' || tool === 'eraser' ? 'crosshair' : 'default',
        touchAction: interactive ? 'none' : 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => endPointer(e, true)}
      onPointerCancel={e => endPointer(e, false)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {regions.map(r => (
        <button
          key={r.id}
          type="button"
          title="Remove highlight"
          aria-label="Remove highlight"
          onClick={e => {
            e.stopPropagation();
            onRemoveRegion(page, r.id);
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
      {draftBox ? (
        <div
          style={{
            position: 'absolute',
            ...draftBox,
            border: `1px dashed ${tokens.accent}`,
            background: `${tokens.accent}22`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}
