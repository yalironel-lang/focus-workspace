import { useState, useCallback, useRef, useEffect } from 'react';
import { ZOOM_MIN, ZOOM_MAX } from './useCanvasMode';
import { fwPersistWarn, sanitizePrefs, sanitizeViewport } from '../lib/freeSpacePersistence';

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
  if (!sectionId) return VIEW_DEFAULTS;
  try {
    const raw = localStorage.getItem(viewportKey(sectionId));
    if (!raw) return VIEW_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    const s = sanitizeViewport(parsed, sectionId, VIEW_DEFAULTS);
    if (s.repaired) {
      try {
        localStorage.setItem(viewportKey(sectionId), JSON.stringify({ zoom: s.zoom, panX: s.panX, panY: s.panY }));
      } catch { /* quota */ }
    }
    return { zoom: s.zoom, panX: s.panX, panY: s.panY };
  } catch (e) {
    fwPersistWarn(`Free Space viewport JSON unreadable for section "${sectionId}": ${String(e)}`);
    return VIEW_DEFAULTS;
  }
}

function loadPrefs(sectionId: string): PersistedPrefs {
  if (!sectionId) return PREF_DEFAULTS;
  try {
    const raw = localStorage.getItem(prefsKey(sectionId));
    if (!raw) return PREF_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    const s = sanitizePrefs(parsed, sectionId, PREF_DEFAULTS);
    if (s.repaired) {
      try {
        localStorage.setItem(prefsKey(sectionId), JSON.stringify({ snapToGrid: s.snapToGrid, gridSize: s.gridSize }));
      } catch { /* quota */ }
    }
    return { snapToGrid: s.snapToGrid, gridSize: s.gridSize };
  } catch (e) {
    fwPersistWarn(`Free Space prefs JSON unreadable for section "${sectionId}": ${String(e)}`);
    return PREF_DEFAULTS;
  }
}

function saveViewport(sectionId: string, v: PersistedViewport): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(viewportKey(sectionId), JSON.stringify(v));
  } catch { /* quota */ }
}

function savePrefs(sectionId: string, p: PersistedPrefs): void {
  if (!sectionId) return;
  try {
    localStorage.setItem(prefsKey(sectionId), JSON.stringify(p));
  } catch { /* quota */ }
}

export function useSectionCanvasMode(sectionId: string): SectionCanvasState {
  const initialViewport = loadViewport(sectionId);
  const initialPrefs = loadPrefs(sectionId);
  const [zoom, setZoomRaw] = useState(initialViewport.zoom);
  const [panX, setPanXRaw] = useState(initialViewport.panX);
  const [panY, setPanYRaw] = useState(initialViewport.panY);
  const [snapToGrid, setSnapToGrid] = useState(initialPrefs.snapToGrid);
  const [gridSize, setGridSize] = useState(initialPrefs.gridSize);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PersistedViewport>({ zoom, panX, panY });

  useEffect(() => {
    const v = loadViewport(sectionId);
    const p = loadPrefs(sectionId);
    setZoomRaw(v.zoom);
    setPanXRaw(v.panX);
    setPanYRaw(v.panY);
    setSnapToGrid(p.snapToGrid);
    setGridSize(p.gridSize);
  }, [sectionId]);

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
