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
  hwDiagFinishStrokeSampling,
  hwDiagRecordPressure,
  hwDiagRecordSamplingPick,
  hwDiagResetStrokeSampling,
} from '../../lib/handwritingDiagnostics';
import {
  appendPoint,
  canvasHasVisualScale,
  drawStrokes,
  findHandwritingScrollContainer,
  HW_INK_CANVAS_TOUCH_ACTION,
  HW_INK_CONTAINER_TOUCH_ACTION,
  isInkPointer,
  isHandwritingCoalescedEnabled,
  logPointerCoordinateSample,
  pointerToNormalized,
  readVisualViewportMetrics,
  scrollHandwritingByFinger,
  strokeCornerSharpness,
  strokesAfterEraser,
} from '../../lib/handwritingGeometry';
import {
  appendCommittedStroke,
  appendDraftStrokeSegment,
  blitCommitLayer,
  getCommitLayerContext,
  rebuildCommitLayer,
  syncCommitCanvasSize,
} from '../../lib/handwritingLayers';
import { getHwRenderMode, setHwRenderMode, type HwRenderMode } from '../../lib/handwritingRenderMode';
import { hwPointerSamplingStats, pickPointerEventsForSample, recordPointerSamplePick } from '../../lib/handwritingPointerSamples';
import {
  getHwSpikeSettings,
  getStrokeSampleStats,
  recordPointAppended,
  resetStrokeSampleStats,
  hwSpikeLog,
  type HwSpikeSettings,
} from '../../lib/handwritingSpikeDebug';
import {
  finalizeHandwritingStrokeDiag,
  pageInkCanvasWrapStyle,
  recordHandwritingStrokePointerDown,
  recordHandwritingStrokePointAppended,
  recordHandwritingStrokePointDropped,
  recordHandwritingStrokePointerMove,
  recordHandwritingStrokeRawSample,
} from '../../lib/handwritingStrokeDiag';
import { registerHandwritingFlush } from '../../lib/handwritingFlushRegistry';
import {
  recordPageInkFlush,
  recordPageInkHydrate,
  recordPageInkMemory,
  recordPageInkPersist,
  recordPageInkRenderState,
} from '../../lib/handwritingPageInkDebug';
import {
  hwLoadBlock,
  hwLoadErrorMessage,
  hwLoadRecoveryGuidance,
  hwSet,
  type HwGetResult,
  type HwSetResult,
} from '../../lib/notebookHandwritingStore';
import {
  CANVAS_HEIGHT_MAX,
  CANVAS_HEIGHT_MIN,
  CANVAS_HEIGHT_STEP,
  PAGE_INK_INITIAL_HEIGHT,
  clampCanvasHeight,
  DEFAULT_CANVAS_MIN_HEIGHT,
  emptyHandwritingData,
  isNotebookPageInkKey,
  newStrokeId,
  type HandwritingBlockData,
  type HandwritingPoint,
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

function saveVerifyWarningMessage(): string {
  return 'Save verification failed — your notes may not have persisted correctly.';
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
  const isPageInkBlock = isNotebookPageInkKey(blockKey);
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
  const fingerScrollRef = useRef<{
    pointerId: number;
    lastY: number;
    scrollEl: HTMLElement | null;
  } | null>(null);
  const unmountFlushDoneRef = useRef(false);
  const flushSaveRef = useRef<
    (reason?: 'registry' | 'unmount' | 'stroke' | 'debounce' | 'visibility') => Promise<boolean>
  >(() => Promise.resolve(true));
  const syncCanvasWidthRef = useRef<() => void>(() => undefined);
  const schedulePaintRef = useRef<() => void>(() => undefined);
  const commitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftPaintedCountRef = useRef(0);
  const commitCacheValidRef = useRef(false);
  const commitCacheStrokeCountRef = useRef(0);

  const ensureCommitCanvas = useCallback((): HTMLCanvasElement => {
    if (!commitCanvasRef.current) {
      commitCanvasRef.current = document.createElement('canvas');
    }
    return commitCanvasRef.current;
  }, []);

  const invalidateCommitCache = useCallback(() => {
    commitCacheValidRef.current = false;
    commitCacheStrokeCountRef.current = -1;
  }, []);

  const formatCanvasSize = (canvas: HTMLCanvasElement | null): string => {
    if (!canvas) return 'no-canvas';
    const rect = canvas.getBoundingClientRect();
    return `${Math.round(rect.width)}x${Math.round(rect.height)} bmp=${canvas.width}x${canvas.height}`;
  };

  const MAX_HYDRATE_REDRAW_FRAMES = 24;

  const redrawAfterHydrate = useCallback(
    (reason: 'mount' | 'layout', attempt = 0): void => {
      const canvas = canvasRef.current;
      const data = dataRef.current;
      if (!canvas || !data) {
        if (isPageInkBlock) {
          recordPageInkRenderState({
            lastPaintStatus: `skip ${reason} a=${attempt} no-canvas-or-data`,
          });
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        if (attempt === 0 && isPageInkBlock) {
          recordPageInkRenderState({
            canvasSizeAtHydrate: formatCanvasSize(canvas),
            lastPaintStatus: `wait-layout ${reason}`,
          });
        }
        if (attempt < MAX_HYDRATE_REDRAW_FRAMES) {
          requestAnimationFrame(() => redrawAfterHydrate(reason, attempt + 1));
        } else if (isPageInkBlock) {
          recordPageInkRenderState({
            lastPaintStatus: `give-up ${reason} after ${attempt} frames`,
          });
        }
        return;
      }
      syncCanvasWidthRef.current();
      schedulePaintRef.current();
      if (isPageInkBlock) {
        recordPageInkRenderState({
          redrawCalledAfterHydrate: true,
          canvasSizeAtRedraw: formatCanvasSize(canvas),
          dataRefStrokeCountAfterHydrate: data.strokes.length,
          lastPaintStatus: `paint-scheduled ${reason} a=${attempt}`,
        });
        recordPageInkMemory(objectId, data.strokes.length);
      }
    },
    [isPageInkBlock, objectId],
  );

  const [tool, setTool] = useState<HandwritingTool>('pen');
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<Extract<HwGetResult, { status: 'error' }> | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
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

  const paintIdle = useCallback(() => {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    if (!canvas || !data) {
      if (isPageInkBlock) {
        recordPageInkRenderState({ lastPaintStatus: 'paint-skip no-canvas-or-data' });
      }
      return;
    }
    const synced = syncCanvasFromRect(canvas, { allowResize: true });
    if (!synced) {
      if (isPageInkBlock) {
        recordPageInkRenderState({
          lastPaintStatus: `paint-skip bad-rect ${formatCanvasSize(canvas)}`,
        });
      }
      return;
    }
    const visibleCtx = canvas.getContext('2d');
    if (!visibleCtx) {
      if (isPageInkBlock) {
        recordPageInkRenderState({ lastPaintStatus: 'paint-skip no-ctx' });
      }
      return;
    }
    const { w, h, dpr } = synced;
    layoutRef.current = { w, h };
    const refW = data.canvas.width;

    if (import.meta.env.DEV && getHwRenderMode() === 'polyline') {
      drawStrokes(visibleCtx, data.strokes, w, h, refW);
      if (isPageInkBlock) {
        recordPageInkRenderState({
          lastPaintStatus: `dev-polyline ${data.strokes.length} strokes`,
          canvasSizeAtRedraw: formatCanvasSize(canvas),
        });
      }
      return;
    }

    const commitCanvas = ensureCommitCanvas();
    syncCommitCanvasSize(commitCanvas, { w, h, dpr });
    const commitCtx = getCommitLayerContext(commitCanvas);
    if (!commitCtx) {
      if (isPageInkBlock) {
        recordPageInkRenderState({ lastPaintStatus: 'paint-skip no-commit-ctx' });
      }
      return;
    }

    const needsRebuild =
      !commitCacheValidRef.current ||
      commitCacheStrokeCountRef.current !== data.strokes.length;
    if (needsRebuild) {
      rebuildCommitLayer(commitCtx, data.strokes, w, h, refW);
      commitCacheValidRef.current = true;
      commitCacheStrokeCountRef.current = data.strokes.length;
    }

    blitCommitLayer(visibleCtx, commitCanvas, w, h);
    draftPaintedCountRef.current = 0;

    if (isPageInkBlock) {
      recordPageInkRenderState({
        lastPaintStatus: `commit-blit ${data.strokes.length} strokes ${needsRebuild ? 'rebuilt' : 'cached'}`,
        canvasSizeAtRedraw: formatCanvasSize(canvas),
      });
    }
  }, [ensureCommitCanvas, isPageInkBlock]);

  const paintDraft = useCallback(() => {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    const draft = draftRef.current;
    if (!canvas || !data || !draft) return;

    const synced = syncCanvasFromRect(canvas, { allowResize: false });
    if (!synced) return;
    const visibleCtx = canvas.getContext('2d');
    if (!visibleCtx) return;

    const { w, h, dpr } = synced;
    layoutRef.current = { w, h };
    const refW = data.canvas.width;
    const commitCanvas = ensureCommitCanvas();
    syncCommitCanvasSize(commitCanvas, { w, h, dpr });

    if (draftPaintedCountRef.current === 0) {
      const commitCtx = getCommitLayerContext(commitCanvas);
      if (!commitCtx) return;
      const needsRebuild =
        !commitCacheValidRef.current ||
        commitCacheStrokeCountRef.current !== data.strokes.length;
      if (needsRebuild) {
        rebuildCommitLayer(commitCtx, data.strokes, w, h, refW);
        commitCacheValidRef.current = true;
        commitCacheStrokeCountRef.current = data.strokes.length;
      }
      blitCommitLayer(visibleCtx, commitCanvas, w, h);
    }

    draftPaintedCountRef.current = appendDraftStrokeSegment(
      visibleCtx,
      draft,
      draftPaintedCountRef.current,
      w,
      h,
      refW,
    );

    if (isPageInkBlock) {
      recordPageInkRenderState({
        lastPaintStatus: `draft-append pts=${draft.points.length} painted=${draftPaintedCountRef.current}`,
        canvasSizeAtRedraw: formatCanvasSize(canvas),
      });
    }
  }, [ensureCommitCanvas, isPageInkBlock]);

  const paint = useCallback(() => {
    if (drawingRef.current && draftRef.current) {
      paintDraft();
      return;
    }
    paintIdle();
  }, [paintDraft, paintIdle]);

  /** Immediate draft paint while pen is down — avoids RAF wait on pointermove. */
  const paintDraftNow = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    paintDraft();
  }, [paintDraft]);

  const schedulePaint = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      paint();
    });
  }, [paint]);

  schedulePaintRef.current = schedulePaint;

  const mergeDraftIntoData = useCallback((base: HandwritingBlockData): HandwritingBlockData => {
    const draft = draftRef.current;
    if (!draft || draft.points.length === 0) return base;
    let strokes = base.strokes;
    if (draft.tool === 'pen') {
      strokes = [...strokes, draft];
    } else if (draft.tool === 'eraser') {
      strokes = strokesAfterEraser(strokes, draft.points, ERASER_RADIUS_NORM);
    }
    return { ...base, strokes, updatedAt: Date.now() };
  }, []);

  const persistPayload = useCallback(
    async (
      payload: HandwritingBlockData,
      attempt: number,
      reason: 'registry' | 'unmount' | 'stroke' | 'debounce' | 'visibility' = 'debounce',
    ): Promise<boolean> => {
      const storageKey = objectId && blockKey ? `${objectId}:${blockKey}` : '';
      if (!objectId || !blockKey) {
        hwDiagLog('HandwritingBlock.tsx:persist', 'skipped — missing ids', {
          objectId,
          blockKey,
          attempt,
          reason,
        });
        return false;
      }
      const result = await hwSet(objectId, blockKey, payload);
      if (isPageInkBlock) {
        recordPageInkPersist(
          objectId,
          payload.strokes.length,
          result.ok,
          reason,
          result.failureStage,
        );
      }
      hwDiagLog('HandwritingBlock.tsx:persist', result.ok ? 'save ok' : 'save failed', {
        objectId,
        blockKey,
        storageKey,
        attempt,
        reason,
        strokeCount: payload.strokes.length,
        ...result,
      });
      if (result.ok) {
        setSaveError(result.verifyMismatch ? saveVerifyWarningMessage() : null);
        return true;
      }
      const message = saveErrorMessage(result);
      setSaveError(message);
      if (attempt < 2 && result.failureStage === 'idb') {
        await new Promise(r => setTimeout(r, SAVE_RETRY_DELAY_MS * attempt));
        return persistPayload(payload, attempt + 1, reason);
      }
      toast.error(message);
      return false;
    },
    [objectId, blockKey, isPageInkBlock],
  );

  const flushSave = useCallback(
    (reason: 'registry' | 'unmount' | 'stroke' | 'debounce' | 'visibility' = 'debounce'): Promise<boolean> => {
      if (reason === 'unmount') {
        if (unmountFlushDoneRef.current) return saveChainRef.current;
        unmountFlushDoneRef.current = true;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (draftRef.current && dataRef.current) {
        dataRef.current = mergeDraftIntoData(dataRef.current);
        draftRef.current = null;
        drawingRef.current = false;
        onDrawingChange?.(false);
      }
      if (dataRef.current) {
        pendingSaveRef.current = dataRef.current;
      }
      const payload = pendingSaveRef.current;
      if (!payload) {
        if (reason === 'registry' || reason === 'unmount') {
          hwDiagLog('HandwritingBlock.tsx:flushSave', 'no payload during explicit flush', {
            objectId,
            blockKey,
            reason,
            dataRefNull: dataRef.current === null,
            draftActive: draftRef.current !== null,
          });
          if (isPageInkBlock) recordPageInkFlush(objectId, reason, null, false);
          return Promise.resolve(false);
        }
        return Promise.resolve(true);
      }
      pendingSaveRef.current = null;
      const captured = payload;
      saveChainRef.current = saveChainRef.current.then(async () => {
        const ok = await persistPayload(captured, 1, reason);
        if (isPageInkBlock) recordPageInkFlush(objectId, reason, captured.strokes.length, ok);
        return ok;
      });
      return saveChainRef.current;
    },
    [mergeDraftIntoData, onDrawingChange, objectId, blockKey, isPageInkBlock, persistPayload],
  );

  flushSaveRef.current = flushSave;

  const queueSave = useCallback(
    (data: HandwritingBlockData) => {
      pendingSaveRef.current = data;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave('debounce');
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const commitData = useCallback(
    (next: HandwritingBlockData, pushUndo: boolean, opts?: { skipCacheInvalidate?: boolean }) => {
      if (pushUndo && dataRef.current) {
        undoRef.current = [...undoRef.current.slice(-(UNDO_CAP - 1)), dataRef.current.strokes];
        setCanUndo(true);
      }
      if (!opts?.skipCacheInvalidate) {
        invalidateCommitCache();
      }
      dataRef.current = { ...next, updatedAt: Date.now() };
      setStrokeCount(next.strokes.length);
      setMissing(false);
      if (isPageInkBlock && objectId) recordPageInkMemory(objectId, next.strokes.length);
      schedulePaint();
      queueSave(dataRef.current);
    },
    [invalidateCommitCache, queueSave, schedulePaint, isPageInkBlock, objectId],
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
    invalidateCommitCache();
    schedulePaint();
  }, [invalidateCommitCache, schedulePaint]);

  syncCanvasWidthRef.current = syncCanvasWidth;

  useEffect(() => {
    let cancelled = false;
    unmountFlushDoneRef.current = false;
    dataRef.current = null;
    draftRef.current = null;
    pendingSaveRef.current = null;
    undoRef.current = [];
    commitCacheValidRef.current = false;
    commitCacheStrokeCountRef.current = -1;
    draftPaintedCountRef.current = 0;
    setLoaded(false);
    setLoadError(null);
    void (async () => {
      if (!objectId || !blockKey) {
        setLoaded(true);
        setMissing(true);
        return;
      }
      const loadResult = await hwLoadBlock(objectId, blockKey);
      if (cancelled) return;
      const isPageInk = isNotebookPageInkKey(blockKey);
      if (loadResult.status === 'error') {
        setLoadError(loadResult);
        setMissing(false);
        setStrokeCount(0);
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        const w = rect && rect.width >= 1 ? rect.width : 600;
        const defaultMinH = pageLayout ? PAGE_INK_INITIAL_HEIGHT : CANVAS_HEIGHT_MIN;
        const h = clampCanvasHeight(pageLayout ? PAGE_INK_INITIAL_HEIGHT : (rect && rect.height >= 1 ? rect.height : defaultMinH));
        dataRef.current = emptyHandwritingData(w, h);
        setDisplayHeight(h);
        if (isPageInk) {
          hwDiagLog('HandwritingBlock.tsx:mount', 'page-ink load failed', {
            objectId,
            blockKey,
            failureStage: loadResult.failureStage,
            errorName: loadResult.errorName,
          });
          recordPageInkHydrate(objectId, false, 0);
        }
        undoRef.current = [];
        setCanUndo(false);
        setLoaded(true);
        return;
      }
      const existing = loadResult.status === 'loaded' ? loadResult.data : null;
      if (isPageInk) {
        hwDiagLog('HandwritingBlock.tsx:mount', 'page-ink hydrate', {
          objectId,
          blockKey,
          storageKey: `${objectId}:${blockKey}`,
          found: Boolean(existing),
          strokeCount: existing?.strokes.length ?? 0,
          height: existing?.canvas.height ?? null,
          pageLayout,
          readOnly,
          loadStatus: loadResult.status,
        });
        recordPageInkHydrate(objectId, Boolean(existing), existing?.strokes.length ?? 0);
      }
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const w = rect && rect.width >= 1 ? rect.width : 600;
      const defaultMinH = pageLayout ? PAGE_INK_INITIAL_HEIGHT : CANVAS_HEIGHT_MIN;
      const h = pageLayout
        ? clampCanvasHeight(existing?.canvas.height ?? PAGE_INK_INITIAL_HEIGHT)
        : clampCanvasHeight(
            existing?.canvas.height ?? (rect && rect.height >= 1 ? rect.height : defaultMinH),
          );
      if (existing) {
        dataRef.current = { ...existing, canvas: { ...existing.canvas, height: h } };
        setDisplayHeight(h);
        setStrokeCount(existing.strokes.length);
        setMissing(false);
        if (isPageInk) {
          recordPageInkMemory(objectId, existing.strokes.length);
          recordPageInkRenderState({
            hydratedStrokeCount: existing.strokes.length,
            dataRefStrokeCountAfterHydrate: existing.strokes.length,
            canvasSizeAtHydrate: formatCanvasSize(canvas),
          });
        }
      } else {
        dataRef.current = emptyHandwritingData(w, h);
        setDisplayHeight(h);
        setStrokeCount(0);
        setMissing(true);
      }
      undoRef.current = [];
      setCanUndo(false);
      setLoaded(true);
      afterLayoutSettle(() => {
        if (cancelled) return;
        redrawAfterHydrate('mount');
      });
    })();
    return () => {
      cancelled = true;
      void flushSaveRef.current('unmount');
    };
  }, [objectId, blockKey, pageLayout, redrawAfterHydrate, reloadToken]);

  const retryLoad = useCallback(() => {
    setReloadToken(t => t + 1);
  }, []);

  const retrySave = useCallback(() => {
    void flushSave('registry');
  }, [flushSave]);

  useLayoutEffect(() => {
    if (!loaded) return;
    redrawAfterHydrate('layout');
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        redrawAfterHydrate('layout');
      }, 100);
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [loaded, displayHeight, redrawAfterHydrate]);

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
    return registerHandwritingFlush(objectId, blockKey, () => flushSaveRef.current('registry'));
  }, [objectId, blockKey]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') void flushSaveRef.current('visibility');
    };
    const onPageHide = () => {
      void flushSaveRef.current('visibility');
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void flushSaveRef.current('unmount');
    };
  }, []);

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
      invalidateCommitCache();
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
  }, [invalidateCommitCache, schedulePaint]);

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
    draftPaintedCountRef.current = 0;
    if (!draft || !dataRef.current) {
      finalizeHandwritingStrokeDiag(canvasRef.current, displayHeight);
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

    const canvas = canvasRef.current;
    if (canvas && import.meta.env.DEV && getHwRenderMode() === 'polyline') {
      /* dev legacy path — full redraw via commitData */
    } else if (canvas) {
      const synced = syncCanvasFromRect(canvas, { allowResize: false });
      if (synced) {
        const { w, h, dpr } = synced;
        const refW = base.canvas.width;
        const commitCanvas = ensureCommitCanvas();
        syncCommitCanvasSize(commitCanvas, { w, h, dpr });
        const commitCtx = getCommitLayerContext(commitCanvas);
        const visibleCtx = canvas.getContext('2d');
        if (commitCtx && visibleCtx) {
          if (draft.tool === 'pen' && draft.points.length > 0) {
            if (
              !commitCacheValidRef.current ||
              commitCacheStrokeCountRef.current !== base.strokes.length
            ) {
              rebuildCommitLayer(commitCtx, base.strokes, w, h, refW);
            }
            appendCommittedStroke(commitCtx, draft, w, h, refW);
            commitCacheValidRef.current = true;
            commitCacheStrokeCountRef.current = strokes.length;
            blitCommitLayer(visibleCtx, commitCanvas, w, h);
          } else if (draft.tool === 'eraser') {
            rebuildCommitLayer(commitCtx, strokes, w, h, refW);
            commitCacheValidRef.current = true;
            commitCacheStrokeCountRef.current = strokes.length;
            blitCommitLayer(visibleCtx, commitCanvas, w, h);
          }
        }
      }
    }
    const strokePressures = draft.points
      .map(p => p.pressure)
      .filter((v): v is number => v !== undefined && v > 0);
    const sampleStats = getStrokeSampleStats();
    const corners = draft.tool === 'pen' ? strokeCornerSharpness(draft) : null;
    const rect = canvasRef.current?.getBoundingClientRect();
    hwDiagLog('HandwritingBlock.tsx:finishStroke', 'stroke committed', {
      tool: draft.tool,
      pointCount: draft.points.length,
      strokePressureMin: strokePressures.length ? Math.min(...strokePressures) : null,
      strokePressureMax: strokePressures.length ? Math.max(...strokePressures) : null,
      sessionPressure: hwDiagPressureSummary(),
      sampling: hwPointerSamplingStats(),
      strokeSampling: hwDiagFinishStrokeSampling(
        draft.points.length,
        isHandwritingCoalescedEnabled(),
      ),
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
      canvasBitmap: canvasRef.current
        ? { w: canvasRef.current.width, h: canvasRef.current.height }
        : null,
      displayHeight,
      dpr: window.devicePixelRatio,
    });
    finalizeHandwritingStrokeDiag(canvasRef.current, displayHeight);
    const skipCacheInvalidate =
      draft.tool === 'pen' &&
      draft.points.length > 0 &&
      !(import.meta.env.DEV && getHwRenderMode() === 'polyline');
    commitData({ ...base, strokes }, true, { skipCacheInvalidate });
    void flushSave('stroke');
  }, [commitData, ensureCommitCanvas, onDrawingChange, schedulePaint, flushSave]);

  const beginStroke = useCallback(
    (
      sample: Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure' | 'pointerType' | 'offsetX' | 'offsetY'>,
    ) => {
      if (!objectId || !blockKey) return;
      const canvas = canvasRef.current;
      if (!canvas || !dataRef.current) return;
      hwDiagResetStrokeSampling();
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
      recordHandwritingStrokePointerDown(
        canvas,
        displayHeight,
        sample.pointerType,
        sample.pressure,
      );
      drawingRef.current = true;
      const activeTool = toolRef.current;
      draftRef.current = {
        id: newStrokeId(),
        tool: activeTool,
        color: activeTool === 'pen' ? inkColor : 'rgba(0,0,0,1)',
        width: activeTool === 'pen' ? PEN_WIDTH : ERASER_WIDTH,
        points: [pt],
      };
      draftPaintedCountRef.current = 0;
      recordHandwritingStrokePointAppended(pt.pressure);
      paintDraftNow();
      onDrawingChange?.(true);
    },
    [inkColor, objectId, blockKey, onDrawingChange, paintDraftNow, displayHeight],
  );

  const saveNotReady = !objectId || !blockKey;
  const inkBlocked = saveNotReady || loadError !== null;

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (inkBlocked || e.button !== 0) return;

    if (e.nativeEvent.pointerType === 'touch') {
      fingerScrollRef.current = {
        pointerId: e.pointerId,
        lastY: e.clientY,
        scrollEl: findHandwritingScrollContainer(e.currentTarget),
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      e.stopPropagation();
      return;
    }

    if (readOnly || !isInkPointer(e.nativeEvent)) return;

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
    const fingerScroll = fingerScrollRef.current;
    if (fingerScroll && e.pointerId === fingerScroll.pointerId) {
      const dy = e.clientY - fingerScroll.lastY;
      fingerScroll.lastY = e.clientY;
      scrollHandwritingByFinger(fingerScroll.scrollEl, dy);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!drawingRef.current || !draftRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const canvas = e.currentTarget;
    logPointerCoordinateSample(canvas, e.nativeEvent, 'move');
    const pick = pickPointerEventsForSample(e.nativeEvent, {
      allowCoalesced: isHandwritingCoalescedEnabled(),
    });
    recordHandwritingStrokePointerMove(
      canvas,
      e.nativeEvent.pointerType,
      pick.events.length,
      pick.usedCoalesced,
      pick.fallbackReason,
    );
    const samples: HandwritingPoint[] = [];
    for (const ev of pick.events) {
      const pt = pointerToNormalized(canvas, ev);
      if (!pt) continue;
      if (ev.pressure > 0) {
        pt.pressure = ev.pressure;
        hwDiagRecordPressure(ev.pressure, ev.pointerType);
      }
      samples.push(pt);
    }
    recordPointerSamplePick(pick);
    hwDiagRecordSamplingPick(
      pick.events.length,
      pick.usedCoalesced,
      pick.fallbackReason,
    );
    let points = draftRef.current.points;
    let pressureMerged = false;
    for (const pt of samples) {
      recordHandwritingStrokeRawSample(pt.pressure);
      const result = appendPoint(points, pt, pt.pressure);
      points = result.points;
      if (result.appended) {
        recordHandwritingStrokePointAppended(pt.pressure);
      } else {
        recordHandwritingStrokePointDropped(pt.pressure);
        if (result.pressureMerged) pressureMerged = true;
      }
    }
    if (pressureMerged) {
      draftPaintedCountRef.current = Math.max(0, draftPaintedCountRef.current - 1);
    }
    draftRef.current = { ...draftRef.current, points };
    paintDraftNow();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (fingerScrollRef.current?.pointerId === e.pointerId) {
      fingerScrollRef.current = null;
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
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
    if (fingerScrollRef.current?.pointerId === e.pointerId) {
      fingerScrollRef.current = null;
      e.stopPropagation();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!drawingRef.current) return;
    const cap = pointerCaptureRef.current;
    if (cap && e.pointerId !== cap.id) return;
    e.stopPropagation();
    hwDiagLog('HandwritingBlock.tsx:onPointerCancel', 'committing in-progress stroke', {
      pointerId: e.pointerId,
      capturedPointerId: cap?.id ?? null,
      draftPoints: draftRef.current?.points.length ?? 0,
    });
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    finishStroke();
  };

  const handleUndo = () => {
    const prev = undoRef.current.pop();
    if (!dataRef.current || prev === undefined) return;
    setCanUndo(undoRef.current.length > 0);
    commitData({ ...dataRef.current, strokes: prev }, false);
    void flushSave('stroke');
  };

  const handleClear = () => {
    if (!dataRef.current || dataRef.current.strokes.length === 0) return;
    undoRef.current = [...undoRef.current.slice(-(UNDO_CAP - 1)), dataRef.current.strokes];
    setCanUndo(true);
    commitData({ ...dataRef.current, strokes: [] }, false);
    void flushSave('stroke');
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
    void flushSave('stroke');
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
    await flushSave('registry');
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
        touchAction: HW_INK_CONTAINER_TOUCH_ACTION,
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
          ...(pageLayout ? pageInkCanvasWrapStyle(displayHeight) : { height: displayHeight }),
          borderRadius: pageLayout ? 2 : 8,
          border: pageLayout
            ? '1px solid rgba(28,25,23,0.1)'
            : '1px solid rgba(255,255,255,0.1)',
          background: pageLayout ? 'rgba(255,251,245,0.98)' : 'rgba(0,0,0,0.18)',
          boxShadow: pageLayout
            ? '0 1px 3px rgba(28,25,23,0.06), inset 0 0 0 1px rgba(255,255,255,0.65)'
            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
          overflow: 'hidden',
          touchAction: HW_INK_CANVAS_TOUCH_ACTION,
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Handwriting canvas"
          data-hw-ink-canvas="1"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            touchAction: HW_INK_CANVAS_TOUCH_ACTION,
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
        {loaded && loadError ? (
          <div
            role="alert"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              pointerEvents: 'auto',
              background: 'rgba(0,0,0,0.62)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.88)',
              letterSpacing: '0.02em',
              textAlign: 'center',
              padding: '16px 20px',
              zIndex: 4,
            }}
          >
            <strong style={{ fontSize: 12, fontWeight: 600 }}>Couldn&apos;t load handwriting</strong>
            <span style={{ color: 'rgba(255,255,255,0.72)' }}>
              Your notes may still be saved on this device.
            </span>
            <span style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 280 }}>
              {hwLoadErrorMessage(loadError)}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.45)', maxWidth: 300, lineHeight: 1.45 }}>
              {hwLoadRecoveryGuidance(loadError.failureStage)}
            </span>
            <button
              type="button"
              onClick={retryLoad}
              style={{
                marginTop: 4,
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : null}
        {loaded && saveError && !loadError ? (
          <div
            role="alert"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '6px 10px',
              background: 'rgba(127,29,29,0.88)',
              color: 'rgba(255,255,255,0.92)',
              fontSize: 10,
              letterSpacing: '0.02em',
              zIndex: 3,
              pointerEvents: 'auto',
            }}
          >
            <span style={{ textAlign: 'center', lineHeight: 1.35 }}>{saveError}</span>
            <button
              type="button"
              onClick={retrySave}
              style={{
                flexShrink: 0,
                padding: '3px 10px',
                borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              Retry save
            </button>
          </div>
        ) : null}
        {loaded && !saveNotReady && !loadError && missing && strokeCount === 0 ? (
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
