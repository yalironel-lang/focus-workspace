/**
 * useCanvasMode — grid vs freeform canvas mode + viewport state.
 *
 * Grid mode:   existing 12-col bento layout (unchanged).
 * Freeform mode: infinite canvas with pan / zoom / snap-to-grid.
 *
 * Persists mode + snap config in localStorage.
 * Viewport (zoom/pan) persists for object permanence — the environment
 * stays where you left it, so objects have stable spatial identity.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const MODE_KEY = 'fw_canvas_mode_v1';
const VIEW_KEY = 'fw_viewport_v1';

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.0;
export const ZOOM_STEP = 0.1;
export const DEFAULT_GRID_SIZE = 24;

// ── Types ─────────────────────────────────────────────────────────────────────

export type CanvasMode = 'grid' | 'freeform';

interface PersistedConfig {
  mode:        CanvasMode;
  snapToGrid:  boolean;
  gridSize:    number;
}

const DEFAULTS: PersistedConfig = {
  mode:       'freeform',   // Space is the primary experience
  snapToGrid: true,
  gridSize:   DEFAULT_GRID_SIZE,
};

interface PersistedViewport {
  zoom:  number;
  panX:  number;
  panY:  number;
}

const VIEWPORT_DEFAULTS: PersistedViewport = { zoom: 1, panX: 40, panY: 40 };

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadConfig(): PersistedConfig {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveConfig(c: PersistedConfig): void {
  try { localStorage.setItem(MODE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

function loadViewport(): PersistedViewport {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return VIEWPORT_DEFAULTS;
    const v = JSON.parse(raw) as Partial<PersistedViewport>;
    return {
      zoom: typeof v.zoom === 'number' ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom)) : VIEWPORT_DEFAULTS.zoom,
      panX: typeof v.panX === 'number' ? v.panX : VIEWPORT_DEFAULTS.panX,
      panY: typeof v.panY === 'number' ? v.panY : VIEWPORT_DEFAULTS.panY,
    };
  } catch {
    return VIEWPORT_DEFAULTS;
  }
}

function saveViewport(v: PersistedViewport): void {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* quota */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface CanvasModeState {
  mode:       CanvasMode;
  snapToGrid: boolean;
  gridSize:   number;
  zoom:       number;
  panX:       number;
  panY:       number;
  setMode:       (m: CanvasMode) => void;
  toggleMode:    () => void;
  toggleSnap:    () => void;
  /** Set zoom and pan simultaneously (e.g. zoom-toward-cursor) */
  setViewport:   (zoom: number, panX: number, panY: number) => void;
  setZoom:       (z: number) => void;
  setPan:        (x: number, y: number) => void;
  resetView:     () => void;
  /** Center content of given pixel dimensions in a viewport of given size */
  centerView:    (contentW: number, contentH: number, vpW: number, vpH: number) => void;
}

export function useCanvasMode(): CanvasModeState {
  const [config, setConfig] = useState<PersistedConfig>(loadConfig);

  // Viewport initializes from saved values — object permanence
  const [zoom,   setZoomRaw] = useState<number>(() => loadViewport().zoom);
  const [panX,   setPanXRaw] = useState<number>(() => loadViewport().panX);
  const [panY,   setPanYRaw] = useState<number>(() => loadViewport().panY);

  // Debounce viewport saves so rapid pan/zoom doesn't thrash localStorage
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef   = useRef<PersistedViewport>({ zoom, panX, panY });

  // Sync pendingRef + schedule debounced save whenever viewport changes
  useEffect(() => {
    pendingRef.current = { zoom, panX, panY };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveViewport(pendingRef.current);
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [zoom, panX, panY]);

  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  const setMode = useCallback((m: CanvasMode) => {
    setConfig(c => {
      const next = { ...c, mode: m };
      saveConfig(next);
      return next;
    });
  }, []);

  const toggleMode = useCallback(() => {
    setConfig(c => {
      const next: PersistedConfig = { ...c, mode: c.mode === 'grid' ? 'freeform' : 'grid' };
      saveConfig(next);
      return next;
    });
  }, []);

  const toggleSnap = useCallback(() => {
    setConfig(c => {
      const next = { ...c, snapToGrid: !c.snapToGrid };
      saveConfig(next);
      return next;
    });
  }, []);

  const setViewport = useCallback((z: number, px: number, py: number) => {
    setZoomRaw(clampZoom(z));
    setPanXRaw(px);
    setPanYRaw(py);
  }, []);

  const setZoom = useCallback((z: number) => {
    setZoomRaw(clampZoom(z));
  }, []);

  const setPan = useCallback((x: number, y: number) => {
    setPanXRaw(x);
    setPanYRaw(y);
  }, []);

  const resetView = useCallback(() => {
    setZoomRaw(1);
    setPanXRaw(40);
    setPanYRaw(40);
  }, []);

  const centerView = useCallback((cw: number, ch: number, vw: number, vh: number) => {
    const z = clampZoom(Math.min(0.9, vw / (cw + 120), vh / (ch + 120)));
    const px = (vw - cw * z) / 2;
    const py = (vh - ch * z) / 2;
    setZoomRaw(z);
    setPanXRaw(px);
    setPanYRaw(py);
  }, []);

  return {
    mode:       config.mode,
    snapToGrid: config.snapToGrid,
    gridSize:   config.gridSize,
    zoom, panX, panY,
    setMode, toggleMode, toggleSnap,
    setViewport, setZoom, setPan, resetView, centerView,
  };
}
