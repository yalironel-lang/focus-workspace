import { useEffect, type MutableRefObject, type RefObject } from 'react';
import type { CanvasViewport } from '../lib/canvasCoordinates';
import { zoomViewportTowardPoint } from '../lib/canvasCoordinates';
import { getGitCommit } from '../lib/appBuildInfo';

const PAN_THRESHOLD_PX = 4;
/** Touch pan is direct 1:1 — no mouse-style smoothing (feels laggy on iPad). */
const PAN_VELOCITY_CLAMP = 2.8;
const PAN_FRICTION = 8.0;
const TOUCH_MOMENTUM_MIN_V = 0.35; // px/ms — ignore tiny release drift

const DEBUG_INGEST =
  'http://127.0.0.1:7714/ingest/e6af15d9-7b0a-4fc6-884e-236751805517';

interface TouchPointer {
  id: number;
  x: number;
  y: number;
}

interface PinchState {
  lastDist: number;
}

interface PanState {
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  started: boolean;
  lastX: number;
  lastY: number;
  lastT: number;
  vx: number;
  vy: number;
}

type TouchNavDbgWindow = Window & {
  __fwTouchNavDbg?: Array<Record<string, unknown>>;
  __fwTouchNavBuild?: string;
  __fwTouchNavStats?: {
    pointerMoveCount: number;
    lastCaptureOk: boolean | null;
    lastHandler: string | null;
    lastDx: number | null;
    lastDy: number | null;
    lastWrittenPanX: number | null;
    lastWrittenPanY: number | null;
    lastCommittedPanX: number | null;
    lastCommittedPanY: number | null;
  };
};

function touchNavDbg(
  event: string,
  data: Record<string, unknown>,
  hypothesisId?: string,
): void {
  const w = window as TouchNavDbgWindow;
  w.__fwTouchNavDbg ??= [];
  const entry = {
    t: Date.now(),
    event,
    hypothesisId,
    ...data,
  };
  w.__fwTouchNavDbg.push(entry);
  if (w.__fwTouchNavDbg.length > 300) w.__fwTouchNavDbg.shift();

  // #region agent log
  fetch(DEBUG_INGEST, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'a618f3',
    },
    body: JSON.stringify({
      sessionId: 'a618f3',
      location: 'useFreeSpaceTouchNavigation.ts',
      message: event,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function isNavigationExcludedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return !!target.closest(
    [
      '[data-freeform-block]',
      '[data-fw-minimap]',
      'button',
      'a',
      'input',
      'textarea',
      '[contenteditable="true"]',
      '[contenteditable=""]',
    ].join(', '),
  );
}

/** True when the touch landed on empty canvas (viewport/world), not chrome or blocks. */
function isEmptyCanvasPanTarget(target: EventTarget | null, viewport: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  if (isNavigationExcludedTarget(target)) return false;
  const world = viewport.querySelector('[data-fw-canvas-world]');
  return target === viewport || target === world || !!world?.contains(target);
}

function touchPointers(map: Map<number, TouchPointer>): TouchPointer[] {
  return [...map.values()];
}

function pinchMidpointAndDist(
  pts: TouchPointer[],
  rect: DOMRect,
): { midX: number; midY: number; dist: number } | null {
  if (pts.length < 2) return null;
  const a = pts[0]!;
  const b = pts[1]!;
  const ax = a.x - rect.left;
  const ay = a.y - rect.top;
  const bx = b.x - rect.left;
  const by = b.y - rect.top;
  return {
    midX: (ax + bx) / 2,
    midY: (ay + by) / 2,
    dist: Math.hypot(bx - ax, by - ay),
  };
}

function clampPan(px: number, py: number): { panX: number; panY: number } {
  return {
    panX: Math.min(10_000_000, Math.max(-10_000_000, px)),
    panY: Math.min(10_000_000, Math.max(-10_000_000, py)),
  };
}

export interface FreeSpaceTouchNavigationOptions {
  enabled: boolean;
  viewportRef: RefObject<HTMLElement | null>;
  liveViewRef: MutableRefObject<CanvasViewport>;
  targetViewRef: MutableRefObject<CanvasViewport>;
  touchPanActiveRef: MutableRefObject<boolean>;
  setTouchPanActive: (active: boolean) => void;
  zoomMin: number;
  zoomMax: number;
  applyWorldTransform: (panX: number, panY: number, zoom: number) => void;
  syncDotGridVars: (panX: number, panY: number, zoom: number) => void;
  setViewport: (zoom: number, panX: number, panY: number) => void;
  setPan: (panX: number, panY: number) => void;
  onNavigationStart?: () => void;
  onDeselect?: () => void;
  momentumRafRef: MutableRefObject<number>;
}

/**
 * iPad touch pan + pinch zoom for Section Free Space.
 * Mouse and pen pointers are ignored — desktop mouse path stays unchanged.
 */
export function useFreeSpaceTouchNavigation({
  enabled,
  viewportRef,
  liveViewRef,
  targetViewRef,
  touchPanActiveRef,
  setTouchPanActive,
  zoomMin,
  zoomMax,
  applyWorldTransform,
  syncDotGridVars,
  setViewport,
  setPan,
  onNavigationStart,
  onDeselect,
  momentumRafRef,
}: FreeSpaceTouchNavigationOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const w = window as TouchNavDbgWindow;
    w.__fwTouchNavBuild = getGitCommit();
    w.__fwTouchNavStats = {
      pointerMoveCount: 0,
      lastCaptureOk: null,
      lastHandler: 'viewport-capture-pointerdown',
      lastDx: null,
      lastDy: null,
      lastWrittenPanX: null,
      lastWrittenPanY: null,
      lastCommittedPanX: null,
      lastCommittedPanY: null,
    };

    const pointers = new Map<number, TouchPointer>();
    let panState: PanState | null = null;
    let pinchState: PinchState | null = null;
    let panAnchorExcluded = false;

    const cancelMomentum = () => {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = 0;
    };

    const writeView = (view: CanvasViewport) => {
      const clamped = clampPan(view.panX, view.panY);
      const z = Math.min(zoomMax, Math.max(zoomMin, view.zoom));
      liveViewRef.current = { panX: clamped.panX, panY: clamped.panY, zoom: z };
      applyWorldTransform(clamped.panX, clamped.panY, z);
      syncDotGridVars(clamped.panX, clamped.panY, z);
      if (w.__fwTouchNavStats) {
        w.__fwTouchNavStats.lastWrittenPanX = clamped.panX;
        w.__fwTouchNavStats.lastWrittenPanY = clamped.panY;
      }
    };

    const commitViewport = () => {
      const v = liveViewRef.current;
      setViewport(v.zoom, v.panX, v.panY);
      targetViewRef.current = { ...v };
    };

    const launchPanMomentum = (vx: number, vy: number) => {
      const cvx = Math.sign(vx) * Math.min(Math.abs(vx), PAN_VELOCITY_CLAMP);
      const cvy = Math.sign(vy) * Math.min(Math.abs(vy), PAN_VELOCITY_CLAMP);
      if (Math.abs(cvx) < TOUCH_MOMENTUM_MIN_V && Math.abs(cvy) < TOUCH_MOMENTUM_MIN_V) return;

      let px = liveViewRef.current.panX;
      let py = liveViewRef.current.panY;
      let mvx = cvx;
      let mvy = cvy;
      let lastTs = performance.now();

      cancelMomentum();
      const step = (ts: number) => {
        const dtMs = Math.min(40, Math.max(0.5, ts - lastTs));
        const dtSec = dtMs / 1000;
        lastTs = ts;
        const decay = Math.exp(-PAN_FRICTION * dtSec);
        mvx *= decay;
        mvy *= decay;
        if (Math.abs(mvx) < 0.01 && Math.abs(mvy) < 0.01) {
          momentumRafRef.current = 0;
          setPan(px, py);
          targetViewRef.current = { zoom: liveViewRef.current.zoom, panX: px, panY: py };
          return;
        }
        px += mvx * dtMs;
        py += mvy * dtMs;
        const clamped = clampPan(px, py);
        px = clamped.panX;
        py = clamped.panY;
        writeView({ panX: px, panY: py, zoom: liveViewRef.current.zoom });
        momentumRafRef.current = requestAnimationFrame(step);
      };
      momentumRafRef.current = requestAnimationFrame(step);
    };

    const clearTouchPanActive = () => {
      touchPanActiveRef.current = false;
      setTouchPanActive(false);
    };

    const endPan = () => {
      const hadPan = panState?.started ?? false;
      clearTouchPanActive();
      if (!hadPan) {
        panState = null;
        return;
      }
      onDeselect?.();
      const final = liveViewRef.current;
      setPan(final.panX, final.panY);
      targetViewRef.current = { zoom: final.zoom, panX: final.panX, panY: final.panY };
      if (w.__fwTouchNavStats) {
        w.__fwTouchNavStats.lastCommittedPanX = final.panX;
        w.__fwTouchNavStats.lastCommittedPanY = final.panY;
      }
      touchNavDbg(
        'panCommit',
        { panX: final.panX, panY: final.panY, zoom: final.zoom },
        'H4',
      );
      launchPanMomentum(panState!.vx, panState!.vy);
      panState = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

      const touchCount = pointers.size;
      if (touchCount === 1) {
        panAnchorExcluded = !isEmptyCanvasPanTarget(e.target, viewport);
        let captureOk = false;
        touchNavDbg(
          'pointerdown',
          {
            handler: 'viewport-capture-pointerdown',
            excluded: panAnchorExcluded,
            tag: e.target instanceof Element ? e.target.tagName : null,
            id: e.target instanceof Element ? e.target.id : null,
          },
          'H1',
        );
        if (!panAnchorExcluded) {
          // iPad Safari needs early preventDefault + capture or pointermove never arrives.
          e.preventDefault();
          try {
            viewport.setPointerCapture(e.pointerId);
            captureOk = viewport.hasPointerCapture(e.pointerId);
          } catch {
            captureOk = false;
          }
          if (w.__fwTouchNavStats) w.__fwTouchNavStats.lastCaptureOk = captureOk;
          touchPanActiveRef.current = true;
          setTouchPanActive(true);
          onNavigationStart?.();
          panState = {
            startX: e.clientX,
            startY: e.clientY,
            startPanX: liveViewRef.current.panX,
            startPanY: liveViewRef.current.panY,
            started: false,
            lastX: e.clientX,
            lastY: e.clientY,
            lastT: performance.now(),
            vx: 0,
            vy: 0,
          };
          touchNavDbg('panAnchor', { captureOk, startPanX: panState.startPanX, startPanY: panState.startPanY }, 'H1');
        }
        return;
      }

      if (touchCount === 2) {
        e.preventDefault();
        onNavigationStart?.();
        cancelMomentum();
        panState = null;
        clearTouchPanActive();
        const rect = viewport.getBoundingClientRect();
        const metrics = pinchMidpointAndDist(touchPointers(pointers), rect);
        if (!metrics || metrics.dist < 8) return;
        pinchState = { lastDist: metrics.dist };
        try {
          viewport.setPointerCapture(e.pointerId);
        } catch { /* already captured */ }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const existing = pointers.get(e.pointerId);
      if (!existing) return;
      existing.x = e.clientX;
      existing.y = e.clientY;

      if (w.__fwTouchNavStats) w.__fwTouchNavStats.pointerMoveCount += 1;

      const touchCount = pointers.size;
      const rect = viewport.getBoundingClientRect();

      if (touchCount >= 2) {
        e.preventDefault();
        const metrics = pinchMidpointAndDist(touchPointers(pointers), rect);
        if (!metrics || metrics.dist < 1) return;

        if (!pinchState) {
          pinchState = { lastDist: metrics.dist };
          return;
        }

        const scale = metrics.dist / pinchState.lastDist;
        if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.0005) return;

        const cur = liveViewRef.current;
        const newZ = Math.min(zoomMax, Math.max(zoomMin, cur.zoom * scale));
        const next = zoomViewportTowardPoint(cur, metrics.midX, metrics.midY, newZ);
        writeView(next);
        pinchState.lastDist = metrics.dist;
        return;
      }

      if (touchCount === 1 && panState && !panAnchorExcluded) {
        const dx = e.clientX - panState.startX;
        const dy = e.clientY - panState.startY;
        if (!panState.started) {
          if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
          panState.started = true;
          // Defer onDeselect until pointerup — avoids mid-drag React re-render jank (H2).
          touchNavDbg('panStart', { dx, dy, smoothing: 'none' }, 'H2');
          e.preventDefault();
        } else {
          e.preventDefault();
        }

        const targetPanX = panState.startPanX + dx;
        const targetPanY = panState.startPanY + dy;
        // Direct 1:1 finger tracking — DOM only; React commits on pointerup.
        writeView({ panX: targetPanX, panY: targetPanY, zoom: liveViewRef.current.zoom });

        if (w.__fwTouchNavStats) {
          w.__fwTouchNavStats.lastDx = dx;
          w.__fwTouchNavStats.lastDy = dy;
        }
        if (w.__fwTouchNavStats && w.__fwTouchNavStats.pointerMoveCount % 8 === 0) {
          touchNavDbg(
            'panMoveSample',
            {
              moveCount: w.__fwTouchNavStats.pointerMoveCount,
              dx,
              dy,
              panX: liveViewRef.current.panX,
              panY: liveViewRef.current.panY,
            },
            'H3',
          );
        }

        const now = performance.now();
        const dt = now - panState.lastT;
        if (dt > 0 && dt < 50) {
          const rawVx = (e.clientX - panState.lastX) / dt;
          const rawVy = (e.clientY - panState.lastY) / dt;
          panState.vx = rawVx;
          panState.vy = rawVy;
        }
        panState.lastX = e.clientX;
        panState.lastY = e.clientY;
        panState.lastT = now;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;

      pointers.delete(e.pointerId);

      if (pointers.size < 2 && pinchState) {
        pinchState = null;
        commitViewport();
      }

      if (pointers.size === 0) {
        if (panState && !panState.started && !panAnchorExcluded) {
          onDeselect?.();
        }
        endPan();
        panAnchorExcluded = false;
      } else if (pointers.size === 1 && pinchState === null) {
        // Transition pinch → single finger: do not continue pan from stale anchor.
        panState = null;
        panAnchorExcluded = true;
        clearTouchPanActive();
      }

      try {
        if (viewport.hasPointerCapture(e.pointerId)) {
          viewport.releasePointerCapture(e.pointerId);
        }
      } catch { /* ignore */ }
    };

    const captureOpts: AddEventListenerOptions = { capture: true };
    const moveOpts: AddEventListenerOptions = { capture: true, passive: false };
    viewport.addEventListener('pointerdown', onPointerDown, captureOpts);
    viewport.addEventListener('pointermove', onPointerMove, moveOpts);
    viewport.addEventListener('pointerup', onPointerUp, captureOpts);
    viewport.addEventListener('pointercancel', onPointerUp, captureOpts);

    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown, captureOpts);
      viewport.removeEventListener('pointermove', onPointerMove, moveOpts);
      viewport.removeEventListener('pointerup', onPointerUp, captureOpts);
      viewport.removeEventListener('pointercancel', onPointerUp, captureOpts);
      cancelMomentum();
      pointers.clear();
      clearTouchPanActive();
      panState = null;
      pinchState = null;
    };
  }, [
    enabled,
    viewportRef,
    liveViewRef,
    targetViewRef,
    zoomMin,
    zoomMax,
    applyWorldTransform,
    syncDotGridVars,
    setViewport,
    setPan,
    onNavigationStart,
    onDeselect,
    momentumRafRef,
    touchPanActiveRef,
    setTouchPanActive,
  ]);
}
