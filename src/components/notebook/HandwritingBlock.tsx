import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import toast from 'react-hot-toast';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  appendPoint,
  canvasHasVisualScale,
  collectPointerSamples,
  drawStrokes,
  pointerToNormalized,
  readVisualViewportMetrics,
  strokesAfterEraser,
} from '../../lib/handwritingGeometry';
import { hwGet, hwSet } from '../../lib/notebookHandwritingStore';
import {
  DEFAULT_CANVAS_MIN_HEIGHT,
  emptyHandwritingData,
  newStrokeId,
  type HandwritingBlockData,
  type HandwritingStroke,
} from '../../lib/handwritingTypes';

export type HandwritingTool = 'pen' | 'eraser';

type Props = {
  objectId: string;
  blockKey: string;
  tokens: AtmosphereTokens;
  readOnly?: boolean;
  surfaceChrome?: CSSProperties;
  blockId: string;
  onFocus?: () => void;
  onDrawingChange?: (drawing: boolean) => void;
  /** Blur notebook text fields so the iPad software keyboard dismisses. */
  onDismissTextEditing?: () => void;
};

declare global {
  interface Window {
    __fwHwDebug?: boolean;
  }
}

function hwDebugEnabled(): boolean {
  return import.meta.env.DEV && window.__fwHwDebug === true;
}

const UNDO_CAP = 50;
const ERASER_WIDTH = 16;
const PEN_WIDTH = 2.5;
const ERASER_RADIUS_NORM = 0.02;

/** Size bitmap from painted geometry; draw in CSS pixel coordinates (DPR via transform). */
function syncCanvasFromRect(
  canvas: HTMLCanvasElement,
  opts?: { allowResize?: boolean },
): { w: number; h: number; dpr: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const bw = Math.round(rect.width * dpr);
  const bh = Math.round(rect.height * dpr);
  if (opts?.allowResize !== false && (canvas.width !== bw || canvas.height !== bh)) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: rect.width, h: rect.height, dpr };
}

function dismissEditableFocus(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (
    active.isContentEditable ||
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    active.tagName === 'SELECT'
  ) {
    active.blur();
  }
}

export function HandwritingBlock({
  objectId,
  blockKey,
  tokens,
  readOnly = false,
  surfaceChrome,
  blockId,
  onFocus,
  onDrawingChange,
  onDismissTextEditing,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<HandwritingBlockData | null>(null);
  const draftRef = useRef<HandwritingStroke | null>(null);
  const undoRef = useRef<HandwritingStroke[][]>([]);
  const drawingRef = useRef(false);
  const toolRef = useRef<HandwritingTool>('pen');
  const rafRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<HandwritingBlockData | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef({ w: 1, h: DEFAULT_CANVAS_MIN_HEIGHT });

  const [tool, setTool] = useState<HandwritingTool>('pen');
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [debugDot, setDebugDot] = useState<{ x: number; y: number } | null>(null);
  const [, bump] = useState(0);

  toolRef.current = tool;

  const inkColor = tokens.textPrimary ?? '#1c1917';

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    if (!canvas || !data) return;
    const synced = syncCanvasFromRect(canvas, { allowResize: !drawingRef.current });
    if (!synced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = synced;
    layoutRef.current = { w, h };
    const refW = data.canvas.width;
    const rect = canvas.getBoundingClientRect();
    const draft = draftRef.current;
    const draftDrawY = draft?.points[0] ? draft.points[0].y * h : null;
    // #region agent log
    fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7fb648'},body:JSON.stringify({sessionId:'7fb648',location:'HandwritingBlock.tsx:paint',message:'paint dims',data:{paintW:w,paintH:h,rectW:rect.width,rectH:rect.height,rectTop:rect.top,canvasW:canvas.width,canvasH:canvas.height,dpr,transformA:ctx.getTransform().a,strokeCount:data.strokes.length,refW,draftDrawY,visualViewport:readVisualViewportMetrics(),visualScale:canvasHasVisualScale(canvas),runId:'ipad-fix'},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    drawStrokes(ctx, data.strokes, w, h, refW, draft);
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  const flushSave = useCallback(async () => {
    const payload = pendingSaveRef.current;
    if (!payload || !objectId || !blockKey) return;
    pendingSaveRef.current = null;
    const ok = await hwSet(objectId, blockKey, payload);
    // #region agent log
    fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7fb648'},body:JSON.stringify({sessionId:'7fb648',location:'HandwritingBlock.tsx:flushSave',message:'idb save',data:{objectId,blockKey,ok,strokeCount:payload.strokes.length},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!ok) toast.error('Could not save handwriting — storage may be full.');
  }, [objectId, blockKey]);

  const queueSave = useCallback(
    (data: HandwritingBlockData) => {
      pendingSaveRef.current = data;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave();
      }, 80);
    },
    [flushSave],
  );

  const commitData = useCallback(
    (next: HandwritingBlockData, pushUndo: boolean) => {
      if (pushUndo && dataRef.current) {
        undoRef.current = [...undoRef.current.slice(-(UNDO_CAP - 1)), dataRef.current.strokes];
      }
      dataRef.current = { ...next, updatedAt: Date.now() };
      setMissing(false);
      bump(n => n + 1);
      schedulePaint();
      queueSave(dataRef.current);
    },
    [queueSave, schedulePaint],
  );

  const resizeCanvas = useCallback(() => {
    if (drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const synced = syncCanvasFromRect(canvas);
    if (!synced) return;
    const { w, h } = synced;
    layoutRef.current = { w, h };
    if (dataRef.current) {
      dataRef.current = {
        ...dataRef.current,
        canvas: { width: w, height: h },
      };
    }
    schedulePaint();
  }, [schedulePaint]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!objectId || !blockKey) {
        setLoaded(true);
        setMissing(true);
        return;
      }
      const existing = await hwGet(objectId, blockKey);
      if (cancelled) return;
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const w = rect && rect.width >= 1 ? rect.width : 600;
      const h = rect && rect.height >= 1 ? rect.height : DEFAULT_CANVAS_MIN_HEIGHT;
      if (existing) {
        dataRef.current = existing;
        setMissing(false);
      } else {
        dataRef.current = emptyHandwritingData(w, h);
        setMissing(true);
      }
      undoRef.current = [];
      setLoaded(true);
      resizeCanvas();
    })();
    return () => {
      cancelled = true;
    };
  }, [objectId, blockKey, resizeCanvas]);

  useLayoutEffect(() => {
    if (!loaded) return;
    resizeCanvas();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        resizeCanvas();
      }, 100);
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [loaded, resizeCanvas]);

  useEffect(() => {
    if (!loaded) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onVvChange = () => {
      if (!drawingRef.current) resizeCanvas();
    };
    vv.addEventListener('resize', onVvChange);
    vv.addEventListener('scroll', onVvChange);
    return () => {
      vv.removeEventListener('resize', onVvChange);
      vv.removeEventListener('scroll', onVvChange);
    };
  }, [loaded, resizeCanvas]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') void flushSave();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void flushSave();
    };
  }, [flushSave]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readOnly) return;

    const suppressTouch = (e: TouchEvent) => {
      if (drawingRef.current) e.preventDefault();
    };
    canvas.addEventListener('touchstart', suppressTouch, { passive: false });
    canvas.addEventListener('touchmove', suppressTouch, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', suppressTouch);
      canvas.removeEventListener('touchmove', suppressTouch);
    };
  }, [readOnly, loaded]);

  const finishStroke = useCallback(() => {
    const draft = draftRef.current;
    draftRef.current = null;
    drawingRef.current = false;
    onDrawingChange?.(false);
    if (!draft || !dataRef.current) {
      schedulePaint();
      return;
    }
    const base = dataRef.current;
    let strokes = base.strokes;
    if (draft.tool === 'pen' && draft.points.length > 0) {
      strokes = [...strokes, draft];
    } else if (draft.tool === 'eraser' && draft.points.length > 0) {
      strokes = strokesAfterEraser(strokes, draft.points, ERASER_RADIUS_NORM);
    }
    commitData({ ...base, strokes }, true);
    void flushSave();
  }, [commitData, onDrawingChange, schedulePaint, flushSave]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly || e.button !== 0) return;
    onDismissTextEditing?.();
    dismissEditableFocus();
    onFocus?.();
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !dataRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const pt = pointerToNormalized(canvas, e.nativeEvent);
    if (!pt) return;
    const offsetX = e.nativeEvent.offsetX;
    const offsetY = e.nativeEvent.offsetY;
    const clientOffsetY = e.clientY - rect.top;
    const expectedDrawY = pt.y * rect.height;
    const renderedX = pt.x * rect.width;
    const renderedY = pt.y * rect.height;
    if (hwDebugEnabled()) {
      setDebugDot({ x: renderedX, y: renderedY });
    }
    // #region agent log
    fetch('http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7fb648'},body:JSON.stringify({sessionId:'7fb648',location:'HandwritingBlock.tsx:onPointerDown',message:'pointer vs paint',data:{clientX:e.clientX,clientY:e.clientY,offsetX,offsetY,rectLeft:rect.left,rectTop:rect.top,rectW:rect.width,rectH:rect.height,clientOffsetY,expectedDrawY,renderedX,renderedY,normX:pt.x,normY:pt.y,canvasW:canvas.width,canvasH:canvas.height,dpr:window.devicePixelRatio,visualViewport:readVisualViewportMetrics(),visualScale:canvasHasVisualScale(canvas),pointerType:e.pointerType,runId:'ipad-fix'},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (e.pressure > 0) pt.pressure = e.pressure;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drawingRef.current = true;
    onDrawingChange?.(true);
    const activeTool = toolRef.current;
    draftRef.current = {
      id: newStrokeId(),
      tool: activeTool,
      color: activeTool === 'pen' ? inkColor : 'rgba(0,0,0,1)',
      width: activeTool === 'pen' ? PEN_WIDTH : ERASER_WIDTH,
      points: [pt],
    };
    schedulePaint();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !draftRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const samples = collectPointerSamples(e.nativeEvent);
    let points = draftRef.current.points;
    for (const pt of samples) {
      points = appendPoint(points, pt, pt.pressure);
    }
    draftRef.current = { ...draftRef.current, points };
    schedulePaint();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    finishStroke();
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    draftRef.current = null;
    drawingRef.current = false;
    onDrawingChange?.(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    schedulePaint();
  };

  const handleUndo = () => {
    const prev = undoRef.current.pop();
    if (!dataRef.current || prev === undefined) return;
    commitData({ ...dataRef.current, strokes: prev }, false);
    void flushSave();
  };

  const handleClear = () => {
    if (!dataRef.current || dataRef.current.strokes.length === 0) return;
    undoRef.current = [...undoRef.current.slice(-(UNDO_CAP - 1)), dataRef.current.strokes];
    commitData({ ...dataRef.current, strokes: [] }, false);
    void flushSave();
  };

  const btnStyle = (active: boolean): CSSProperties => ({
    fontSize: 12,
    minHeight: 36,
    minWidth: 44,
    padding: '6px 12px',
    borderRadius: 8,
    border: `1px solid ${active ? tokens.accent : 'rgba(255,255,255,0.14)'}`,
    background: active ? `${tokens.accent}24` : 'rgba(0,0,0,0.24)',
    color: active ? tokens.accent : tokens.textMuted,
    cursor: 'pointer',
    fontWeight: 600,
    touchAction: 'manipulation',
  });

  return (
    <div
      data-nb-surface-block
      data-block-id={blockId}
      style={{
        margin: '10px 0',
        userSelect: 'none',
        ...surfaceChrome,
      }}
      onPointerDown={e => {
        e.stopPropagation();
        onDismissTextEditing?.();
        dismissEditableFocus();
      }}
    >
      {!readOnly ? (
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 4,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button type="button" style={btnStyle(tool === 'pen')} onClick={() => setTool('pen')}>
            Pen
          </button>
          <button type="button" style={btnStyle(tool === 'eraser')} onClick={() => setTool('eraser')}>
            Eraser
          </button>
          <button type="button" style={btnStyle(false)} onClick={handleUndo}>
            Undo
          </button>
          <button type="button" style={btnStyle(false)} onClick={handleClear}>
            Clear
          </button>
        </div>
      ) : null}
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          width: '100%',
          height: DEFAULT_CANVAS_MIN_HEIGHT,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.18)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Handwriting canvas"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            touchAction: 'none',
            cursor: readOnly ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
        {loaded && missing && dataRef.current?.strokes.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              fontSize: 11,
              color: 'rgba(255,255,255,0.2)',
              letterSpacing: '0.03em',
            }}
          >
            {readOnly ? 'Handwriting' : 'Write here…'}
          </div>
        ) : null}
        {hwDebugEnabled() && debugDot ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: debugDot.x - 5,
              top: debugDot.y - 5,
              width: 10,
              height: 10,
              borderRadius: '50%',
              border: '2px solid #f43f5e',
              background: 'rgba(244,63,94,0.35)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
