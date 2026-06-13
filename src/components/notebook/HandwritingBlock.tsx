import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Eraser,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import {
  hwDiagLog,
  hwDiagPressureSummary,
  hwDiagRecordPressure,
} from '../../lib/handwritingDiagnostics';
import {
  appendPoint,
  canvasHasVisualScale,
  collectPointerSamples,
  drawStrokes,
  isInkPointer,
  logPointerCoordinateSample,
  pointerToNormalized,
  readVisualViewportMetrics,
  strokeCornerSharpness,
  strokesAfterEraser,
} from '../../lib/handwritingGeometry';
import { hwPointerSamplingStats } from '../../lib/handwritingPointerSamples';
import {
  getHwSpikeSettings,
  getStrokeSampleStats,
  recordPointAppended,
  resetStrokeSampleStats,
  hwSpikeLog,
  type HwSpikeSettings,
} from '../../lib/handwritingSpikeDebug';
import { setHwRenderMode, type HwRenderMode } from '../../lib/handwritingRenderMode';
import { registerHandwritingFlush } from '../../lib/handwritingFlushRegistry';
import { hwGet, hwSet, type HwSetResult } from '../../lib/notebookHandwritingStore';
import {
  CANVAS_HEIGHT_MAX,
  CANVAS_HEIGHT_MIN,
  CANVAS_HEIGHT_STEP,
  PAGE_INK_INITIAL_HEIGHT,
  clampCanvasHeight,
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
  /** Remove this handwriting block from the notebook (parent handles IDB + body). */
  onDelete?: () => void;
  /** Notebook page ink — full-width surface, no delete block. */
  pageLayout?: boolean;
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
const SAVE_DEBOUNCE_MS = 120;
const SAVE_RETRY_DELAY_MS = 250;

function saveErrorMessage(result: HwSetResult): string {
  if (result.failureStage === 'missing_params') {
    return 'Could not save handwriting — notebook not ready.';
  }
  if (result.failureStage === 'sanitize' || result.failureStage === 'serialization') {
    return 'Could not save handwriting — data error.';
  }
  if (result.isQuota) {
    return 'Could not save handwriting — storage is full.';
  }
  if (result.failureStage === 'idb') {
    return `Could not save handwriting — ${result.errorName ?? 'storage error'}.`;
  }
  return 'Could not save handwriting.';
}

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

/** Wait for keyboard dismiss / visualViewport layout to settle before first ink sample. */
function afterLayoutSettle(run: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
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
  onDelete,
  pageLayout = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<HandwritingBlockData | null>(null);
  const draftRef = useRef<HandwritingStroke | null>(null);
  const undoRef = useRef<HandwritingStroke[][]>([]);
  const drawingRef = useRef(false);
  const toolRef = useRef<HandwritingTool>('pen');
  const rafRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<HandwritingBlockData | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef(Promise.resolve(true));
  const layoutRef = useRef({ w: 1, h: DEFAULT_CANVAS_MIN_HEIGHT });
  const pointerCaptureRef = useRef<{ id: number; target: HTMLCanvasElement } | null>(null);

  const [tool, setTool] = useState<HandwritingTool>('pen');
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [displayHeight, setDisplayHeight] = useState(CANVAS_HEIGHT_MIN);
  const [strokeCount, setStrokeCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [debugDot, setDebugDot] = useState<{ x: number; y: number } | null>(null);
  const [devRenderMode, setDevRenderMode] = useState<HwRenderMode>(() =>
    import.meta.env.DEV ? getHwSpikeSettings().render : 'polyline',
  );
  const [spikeSettings, setSpikeSettings] = useState<HwSpikeSettings>(() =>
    import.meta.env.DEV ? getHwSpikeSettings() : {
      coalesced: 'auto',
      pressure: 'real',
      smoothing: 'low',
      minDist: 'normal',
      render: 'polyline',
    },
  );

  toolRef.current = tool;

  const inkColor = tokens.textPrimary ?? '#1c1917';
  const atMaxHeight = displayHeight >= CANVAS_HEIGHT_MAX;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    if (!canvas || !data) return;
    const synced = syncCanvasFromRect(canvas, { allowResize: !drawingRef.current });
    if (!synced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = synced;
    layoutRef.current = { w, h };
    const refW = data.canvas.width;
    const draft = draftRef.current;
    drawStrokes(ctx, data.strokes, w, h, refW, draft);
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  const persistPayload = useCallback(
    async (payload: HandwritingBlockData, attempt: number): Promise<boolean> => {
      if (!objectId || !blockKey) {
        hwDiagLog('HandwritingBlock.tsx:persist', 'skipped — missing ids', {
          objectId,
          blockKey,
          attempt,
        });
        return false;
      }
      const result = await hwSet(objectId, blockKey, payload);
      hwDiagLog('HandwritingBlock.tsx:persist', result.ok ? 'save ok' : 'save failed', {
        objectId,
        blockKey,
        storageKey: `${objectId}:${blockKey}`,
        attempt,
        strokeCount: payload.strokes.length,
        ...result,
      });
      if (result.ok) return true;
      if (attempt < 2 && result.failureStage === 'idb') {
        await new Promise(r => setTimeout(r, SAVE_RETRY_DELAY_MS * attempt));
        return persistPayload(payload, attempt + 1);
      }
      toast.error(saveErrorMessage(result));
      return false;
    },
    [objectId, blockKey],
  );

  const flushSave = useCallback((): Promise<boolean> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (dataRef.current) {
      pendingSaveRef.current = dataRef.current;
    }
    const payload = pendingSaveRef.current;
    if (!payload) {
      return Promise.resolve(true);
    }
    pendingSaveRef.current = null;
    const captured = payload;
    saveChainRef.current = saveChainRef.current.then(() => persistPayload(captured, 1));
    return saveChainRef.current;
  }, [persistPayload]);

  const queueSave = useCallback(
    (data: HandwritingBlockData) => {
      pendingSaveRef.current = data;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const commitData = useCallback(
    (next: HandwritingBlockData, pushUndo: boolean) => {
      if (pushUndo && dataRef.current) {
        undoRef.current = [...undoRef.current.slice(-(UNDO_CAP - 1)), dataRef.current.strokes];
        setCanUndo(true);
      }
      dataRef.current = { ...next, updatedAt: Date.now() };
      setStrokeCount(next.strokes.length);
      setMissing(false);
      schedulePaint();
      queueSave(dataRef.current);
    },
    [queueSave, schedulePaint],
  );

  const syncCanvasWidth = useCallback(() => {
    if (drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas || !dataRef.current) return;
    const synced = syncCanvasFromRect(canvas);
    if (!synced) return;
    const { w, h } = synced;
    layoutRef.current = { w, h };
    const preservedHeight = dataRef.current.canvas.height;
    dataRef.current = {
      ...dataRef.current,
      canvas: { width: w, height: preservedHeight },
    };
    schedulePaint();
  }, [schedulePaint]);

  useEffect(() => {
    let cancelled = false;
    dataRef.current = null;
    draftRef.current = null;
    pendingSaveRef.current = null;
    undoRef.current = [];
    setLoaded(false);
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
      const defaultMinH = pageLayout ? PAGE_INK_INITIAL_HEIGHT : CANVAS_HEIGHT_MIN;
      const h = clampCanvasHeight(
        existing?.canvas.height ?? (rect && rect.height >= 1 ? rect.height : defaultMinH),
      );
      if (existing) {
        dataRef.current = { ...existing, canvas: { ...existing.canvas, height: h } };
        setDisplayHeight(h);
        setStrokeCount(existing.strokes.length);
        setMissing(false);
      } else {
        dataRef.current = emptyHandwritingData(w, h);
        setDisplayHeight(h);
        setStrokeCount(0);
        setMissing(true);
      }
      undoRef.current = [];
      setCanUndo(false);
      setLoaded(true);
      syncCanvasWidth();
    })();
    return () => {
      cancelled = true;
      void flushSave();
    };
  }, [objectId, blockKey, pageLayout, syncCanvasWidth, flushSave]);

  useLayoutEffect(() => {
    if (!loaded) return;
    syncCanvasWidth();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        syncCanvasWidth();
      }, 100);
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [loaded, syncCanvasWidth, displayHeight]);

  useEffect(() => {
    if (!loaded) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onVvChange = () => {
      if (!drawingRef.current) syncCanvasWidth();
    };
    vv.addEventListener('resize', onVvChange);
    vv.addEventListener('scroll', onVvChange);
    return () => {
      vv.removeEventListener('resize', onVvChange);
      vv.removeEventListener('scroll', onVvChange);
    };
  }, [loaded, syncCanvasWidth]);

  useEffect(() => {
    if (!objectId || !blockKey) return;
    return registerHandwritingFlush(objectId, blockKey, flushSave);
  }, [objectId, blockKey, flushSave]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') void flushSave();
    };
    const onPageHide = () => {
      void flushSave();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
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

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const syncFromSpike = () => {
      const s = getHwSpikeSettings();
      setSpikeSettings(s);
      setDevRenderMode(s.render);
      setHwRenderMode(s.render);
      schedulePaint();
    };
    syncFromSpike();
    const onSpike = () => syncFromSpike();
    const onMode = () => syncFromSpike();
    window.addEventListener('fw-hw-spike-settings', onSpike);
    window.addEventListener('fw-hw-render-mode', onMode);
    return () => {
      window.removeEventListener('fw-hw-spike-settings', onSpike);
      window.removeEventListener('fw-hw-render-mode', onMode);
    };
  }, [schedulePaint]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => document.removeEventListener('pointerdown', onDocPointer, true);
  }, [menuOpen]);

  const finishStroke = useCallback(() => {
    const draft = draftRef.current;
    draftRef.current = null;
    drawingRef.current = false;
    pointerCaptureRef.current = null;
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
    const strokePressures = draft.points
      .map(p => p.pressure)
      .filter((v): v is number => v !== undefined && v > 0);
    const sampleStats = getStrokeSampleStats();
    const corners = draft.tool === 'pen' ? strokeCornerSharpness(draft) : null;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    hwDiagLog('HandwritingBlock.tsx:finishStroke', 'stroke committed', {
      tool: draft.tool,
      pointCount: draft.points.length,
      strokePressureMin: strokePressures.length ? Math.min(...strokePressures) : null,
      strokePressureMax: strokePressures.length ? Math.max(...strokePressures) : null,
      sessionPressure: hwDiagPressureSummary(),
      sampling: hwPointerSamplingStats(),
    });
    hwSpikeLog('H-C', 'HandwritingBlock:finishStroke', 'stroke summary', {
      tool: draft.tool,
      pointCount: draft.points.length,
      sampleStats,
      corners,
      pressureMin: strokePressures.length ? Math.min(...strokePressures) : null,
      pressureMax: strokePressures.length ? Math.max(...strokePressures) : null,
      settings: getHwSpikeSettings(),
      canvasCss: rect ? { w: rect.width, h: rect.height } : null,
      canvasBitmap: canvas ? { w: canvas.width, h: canvas.height } : null,
      displayHeight,
      dpr: window.devicePixelRatio,
    });
    commitData({ ...base, strokes }, true);
    void flushSave();
  }, [commitData, onDrawingChange, schedulePaint, flushSave]);

  const beginStroke = useCallback(
    (
      sample: Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure' | 'pointerType' | 'offsetX' | 'offsetY'>,
    ) => {
      if (!objectId || !blockKey) return;
      const canvas = canvasRef.current;
      if (!canvas || !dataRef.current) return;
      resetStrokeSampleStats();
      recordPointAppended();
      const rect = canvas.getBoundingClientRect();
      logPointerCoordinateSample(canvas, sample, 'down');
      const pt = pointerToNormalized(canvas, sample);
      if (!pt) return;
      const expectedDrawY = pt.y * rect.height;
      if (hwDebugEnabled()) {
        setDebugDot({ x: pt.x * rect.width, y: expectedDrawY });
      }
      hwDiagLog('HandwritingBlock.tsx:beginStroke', 'pointer sample', {
        clientX: sample.clientX,
        clientY: sample.clientY,
        rectLeft: rect.left,
        rectTop: rect.top,
        rectW: rect.width,
        rectH: rect.height,
        normX: pt.x,
        normY: pt.y,
        canvasW: canvas.width,
        canvasH: canvas.height,
        dpr: window.devicePixelRatio,
        visualViewport: readVisualViewportMetrics(),
        visualScale: canvasHasVisualScale(canvas),
        pointerType: sample.pointerType,
      });
      if (sample.pressure > 0) {
        pt.pressure = sample.pressure;
        hwDiagRecordPressure(sample.pressure, sample.pointerType);
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
    },
    [inkColor, objectId, blockKey, onDrawingChange, schedulePaint],
  );

  const saveNotReady = !objectId || !blockKey;

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly || saveNotReady || e.button !== 0) return;
    if (!isInkPointer(e.nativeEvent)) return;

    const hadTextFocus =
      document.activeElement instanceof HTMLElement &&
      (document.activeElement.isContentEditable ||
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA');
    onDismissTextEditing?.();
    dismissEditableFocus();
    onFocus?.();
    e.stopPropagation();
    e.preventDefault();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerCaptureRef.current = { id: e.pointerId, target: e.currentTarget };
    } catch {
      /* ignore */
    }

    const sample = e.nativeEvent;
    const start = () => beginStroke(sample);
    if (hadTextFocus) {
      afterLayoutSettle(start);
    } else {
      start();
    }
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
    if (!drawingRef.current) return;
    e.stopPropagation();
    draftRef.current = null;
    drawingRef.current = false;
    pointerCaptureRef.current = null;
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
    setCanUndo(undoRef.current.length > 0);
    commitData({ ...dataRef.current, strokes: prev }, false);
    void flushSave();
  };

  const handleClear = () => {
    if (!dataRef.current || dataRef.current.strokes.length === 0) return;
    undoRef.current = [...undoRef.current.slice(-(UNDO_CAP - 1)), dataRef.current.strokes];
    setCanUndo(true);
    commitData({ ...dataRef.current, strokes: [] }, false);
    void flushSave();
  };

  const handleAddSpace = () => {
    if (!dataRef.current || atMaxHeight) return;
    const nextHeight = clampCanvasHeight(displayHeight + CANVAS_HEIGHT_STEP);
    setDisplayHeight(nextHeight);
    const next = {
      ...dataRef.current,
      canvas: { width: dataRef.current.canvas.width, height: nextHeight },
    };
    dataRef.current = next;
    commitData(next, false);
    void flushSave();
  };

  const handleDeleteBlock = async () => {
    setMenuOpen(false);
    if (!onDelete) return;
    if (
      !window.confirm(
        'Delete this handwriting block? All writing in this block will be permanently removed.',
      )
    ) {
      return;
    }
    if (drawingRef.current) {
      finishStroke();
    }
    await flushSave();
    onDelete();
  };

  const toolbarBtnStyle = (active: boolean, disabled: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 12,
    minHeight: 44,
    minWidth: 44,
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? tokens.accent : 'rgba(255,255,255,0.14)'}`,
    background: active ? `${tokens.accent}24` : 'rgba(0,0,0,0.24)',
    color: active ? tokens.accent : tokens.textMuted,
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 600,
    touchAction: 'manipulation',
    opacity: disabled ? 0.38 : 1,
    pointerEvents: disabled ? 'none' : 'auto',
  });

  const onToolbarPointer = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDismissTextEditing?.();
    dismissEditableFocus();
  };

  return (
    <div
      data-nb-surface-block
      data-block-id={blockId}
      style={{
        margin: pageLayout ? 0 : '10px 0',
        userSelect: 'none',
        touchAction: 'pan-y',
        ...surfaceChrome,
      }}
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest('.hw-toolbar')) return;
        e.stopPropagation();
        onDismissTextEditing?.();
        dismissEditableFocus();
      }}
    >
      {!readOnly ? (
        <div
          className="hw-toolbar"
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {!pageLayout ? (
            <span
              style={{
                fontSize: 11,
                color: tokens.textMuted,
                letterSpacing: '0.04em',
                marginRight: 2,
                opacity: 0.7,
              }}
            >
              Handwriting
            </span>
          ) : null}
          {import.meta.env.DEV ? (
            <span
              title="Spike debug — console: __fwHwSpikeHelp()"
              style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.08)',
                color: tokens.textMuted,
                letterSpacing: '0.02em',
                lineHeight: 1.3,
              }}
            >
              {devRenderMode}|c:{spikeSettings.coalesced}|p:{spikeSettings.pressure}|d:
              {spikeSettings.minDist}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Pen"
            title="Pen"
            style={toolbarBtnStyle(tool === 'pen', false)}
            onPointerDown={onToolbarPointer}
            onClick={() => setTool('pen')}
          >
            <Pencil size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Eraser"
            title="Eraser"
            style={toolbarBtnStyle(tool === 'eraser', false)}
            onPointerDown={onToolbarPointer}
            onClick={() => setTool('eraser')}
          >
            <Eraser size={16} aria-hidden />
          </button>
          <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
          <button
            type="button"
            aria-label="Undo"
            title="Undo"
            style={toolbarBtnStyle(false, !canUndo)}
            onPointerDown={onToolbarPointer}
            onClick={handleUndo}
          >
            <RotateCcw size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Clear"
            title="Clear all strokes"
            style={toolbarBtnStyle(false, strokeCount === 0)}
            onPointerDown={onToolbarPointer}
            onClick={handleClear}
          >
            <Trash2 size={16} aria-hidden />
          </button>
          <span style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
          <button
            type="button"
            aria-label="Add writing space"
            title="Add writing space"
            style={toolbarBtnStyle(false, atMaxHeight)}
            onPointerDown={onToolbarPointer}
            onClick={handleAddSpace}
          >
            <Plus size={16} aria-hidden />
            <span style={{ fontSize: 11 }}>Space</span>
          </button>
          {onDelete ? (
            <div ref={menuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                type="button"
                aria-label="More actions"
                aria-expanded={menuOpen}
                title="More actions"
                style={toolbarBtnStyle(false, false)}
                onPointerDown={onToolbarPointer}
                onClick={() => setMenuOpen(o => !o)}
              >
                <MoreHorizontal size={16} aria-hidden />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    minWidth: 168,
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(18,16,14,0.96)',
                    boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
                    zIndex: 20,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#f87171',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      minHeight: 44,
                    }}
                    onPointerDown={onToolbarPointer}
                    onClick={() => void handleDeleteBlock()}
                  >
                    Delete block…
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          width: '100%',
          height: displayHeight,
          flex: pageLayout ? 1 : undefined,
          minHeight: pageLayout ? PAGE_INK_INITIAL_HEIGHT : undefined,
          borderRadius: pageLayout ? 2 : 8,
          border: pageLayout
            ? '1px solid rgba(28,25,23,0.1)'
            : '1px solid rgba(255,255,255,0.1)',
          background: pageLayout ? 'rgba(255,251,245,0.98)' : 'rgba(0,0,0,0.18)',
          boxShadow: pageLayout
            ? '0 1px 3px rgba(28,25,23,0.06), inset 0 0 0 1px rgba(255,255,255,0.65)'
            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
          overflow: 'hidden',
          touchAction: 'pan-y',
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Handwriting canvas"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            touchAction: 'pan-y',
            cursor: readOnly ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
        {loaded && saveNotReady ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              fontSize: 11,
              color: 'rgba(255,255,255,0.28)',
              letterSpacing: '0.03em',
              textAlign: 'center',
              padding: '0 12px',
            }}
          >
            Handwriting not ready — notebook is still loading.
          </div>
        ) : null}
        {loaded && !saveNotReady && missing && strokeCount === 0 ? (
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
            {readOnly
              ? pageLayout
                ? 'Page ink'
                : 'Handwriting'
              : pageLayout
                ? 'Write on this page with Apple Pencil…'
                : 'Write with Apple Pencil…'}
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
