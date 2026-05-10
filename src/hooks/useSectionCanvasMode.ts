import { useState, useCallback, useRef, useEffect } from 'react';
import { ZOOM_MIN, ZOOM_MAX } from './useCanvasMode';

export const SECTION_ZOOM_STEP = 0.1;
export const SECTION_DEFAULT_GRID_SIZE = 24;

interface PersistedViewport {
  zoom: number;
  panX: number;
  panY: number;
}

interface PersistedPrefs {
  snapToGrid: boolean;
  gridSize: number;
}

export interface SectionCanvasState {
  zoom: number;
  panX: number;
  panY: number;
  snapToGrid: boolean;
  gridSize: number;
  setViewport: (zoom: number, panX: number, panY: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  centerView: (contentW: number, contentH: number, vpW: number, vpH: number) => void;
  toggleSnap: () => void;
}

function viewportKey(sectionId: string): string {
  return `fw_section_${sectionId}_free_space_viewport_v1`;
}

function prefsKey(sectionId: string): string {
  return `fw_section_${sectionId}_free_space_prefs_v1`;
}

const VIEW_DEFAULTS: PersistedViewport = { zoom: 1, panX: 40, panY: 40 };
const PREF_DEFAULTS: PersistedPrefs = { snapToGrid: true, gridSize: SECTION_DEFAULT_GRID_SIZE };

function loadViewport(sectionId: string): PersistedViewport {
  try {
    const raw = localStorage.getItem(viewportKey(sectionId));
    if (!raw) return VIEW_DEFAULTS;
    const v = JSON.parse(raw) as Partial<PersistedViewport>;
    return {
      zoom: typeof v.zoom === 'number' ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom)) : VIEW_DEFAULTS.zoom,
      panX: typeof v.panX === 'number' ? v.panX : VIEW_DEFAULTS.panX,
      panY: typeof v.panY === 'number' ? v.panY : VIEW_DEFAULTS.panY,
    };
  } catch {
    return VIEW_DEFAULTS;
  }
}

function loadPrefs(sectionId: string): PersistedPrefs {
  try {
    const raw = localStorage.getItem(prefsKey(sectionId));
    if (!raw) return PREF_DEFAULTS;
    const p = JSON.parse(raw) as Partial<PersistedPrefs>;
    return {
      snapToGrid: typeof p.snapToGrid === 'boolean' ? p.snapToGrid : PREF_DEFAULTS.snapToGrid,
      gridSize: typeof p.gridSize === 'number' ? p.gridSize : PREF_DEFAULTS.gridSize,
    };
  } catch {
    return PREF_DEFAULTS;
  }
}

function saveViewport(sectionId: string, v: PersistedViewport): void {
  try { localStorage.setItem(viewportKey(sectionId), JSON.stringify(v)); } catch { /* quota */ }
}

function savePrefs(sectionId: string, p: PersistedPrefs): void {
  try { localStorage.setItem(prefsKey(sectionId), JSON.stringify(p)); } catch { /* quota */ }
}

export function useSectionCanvasMode(sectionId: string): SectionCanvasState {
  const initialViewport = loadViewport(sectionId);
  const initialPrefs = loadPrefs(sectionId);
  const [zoom, setZoomRaw] = useState(initialViewport.zoom);
  const [panX, setPanXRaw] = useState(initialViewport.panX);
  const [panY, setPanYRaw] = useState(initialViewport.panY);
  const [snapToGrid, setSnapToGrid] = useState(initialPrefs.snapToGrid);
  const [gridSize] = useState(initialPrefs.gridSize);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PersistedViewport>({ zoom, panX, panY });

  useEffect(() => {
    pendingRef.current = { zoom, panX, panY };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveViewport(sectionId, pendingRef.current), 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sectionId, zoom, panX, panY]);

  useEffect(() => {
    savePrefs(sectionId, { snapToGrid, gridSize });
  }, [sectionId, snapToGrid, gridSize]);

  const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

  const setViewport = useCallback((z: number, px: number, py: number) => {
    setZoomRaw(clampZoom(z));
    setPanXRaw(px);
    setPanYRaw(py);
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

  const toggleSnap = useCallback(() => setSnapToGrid(v => !v), []);

  return { zoom, panX, panY, snapToGrid, gridSize, setViewport, setPan, resetView, centerView, toggleSnap };
}

