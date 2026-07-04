import { useState, useCallback, useRef, useEffect } from 'react';
import { ZOOM_MIN, ZOOM_MAX } from './useCanvasMode';
import { fwPersistWarn, sanitizePrefs, sanitizeViewport, boardScopedFreeSpaceKeys } from '../lib/freeSpacePersistence';
import { registerFreeSpacePersistFlush } from '../lib/freeSpacePersistFlush';
import { mergeViewport, parseFreeSpaceStorageKey, type PersistedViewport } from '../lib/freeSpaceLocalMerge';
import { tryPersistLocalStorage } from '../lib/freeSpacePersistWrite';
import { markSavePending, recordStorageConflict } from '../lib/saveStatus';

export const SECTION_ZOOM_STEP = 0.1;
export const SECTION_DEFAULT_GRID_SIZE = 24;

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

function viewportKey(sectionId: string, boardId = ''): string {
  return boardScopedFreeSpaceKeys(sectionId, boardId).viewport;
}

function prefsKey(sectionId: string, boardId = ''): string {
  return boardScopedFreeSpaceKeys(sectionId, boardId).prefs;
}

const VIEW_DEFAULTS: PersistedViewport = { zoom: 1, panX: 40, panY: 40 };
const PREF_DEFAULTS: PersistedPrefs = { snapToGrid: true, gridSize: SECTION_DEFAULT_GRID_SIZE };

function loadViewport(sectionId: string, boardId = ''): PersistedViewport {
  if (!sectionId) return VIEW_DEFAULTS;
  try {
    const raw = localStorage.getItem(viewportKey(sectionId, boardId));
    if (!raw) return VIEW_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    const s = sanitizeViewport(parsed, sectionId, VIEW_DEFAULTS);
    if (s.repaired) {
      try {
        localStorage.setItem(viewportKey(sectionId, boardId), JSON.stringify({ zoom: s.zoom, panX: s.panX, panY: s.panY }));
      } catch { /* quota */ }
    }
    return { zoom: s.zoom, panX: s.panX, panY: s.panY };
  } catch (e) {
    fwPersistWarn(`Free Space viewport JSON unreadable for section "${sectionId}": ${String(e)}`);
    return VIEW_DEFAULTS;
  }
}

function loadPrefs(sectionId: string, boardId = ''): PersistedPrefs {
  if (!sectionId) return PREF_DEFAULTS;
  try {
    const raw = localStorage.getItem(prefsKey(sectionId, boardId));
    if (!raw) return PREF_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    const s = sanitizePrefs(parsed, sectionId, PREF_DEFAULTS);
    if (s.repaired) {
      try {
        localStorage.setItem(prefsKey(sectionId, boardId), JSON.stringify({ snapToGrid: s.snapToGrid, gridSize: s.gridSize }));
      } catch { /* quota */ }
    }
    return { snapToGrid: s.snapToGrid, gridSize: s.gridSize };
  } catch (e) {
    fwPersistWarn(`Free Space prefs JSON unreadable for section "${sectionId}": ${String(e)}`);
    return PREF_DEFAULTS;
  }
}

function persistViewportMerged(sectionId: string, boardId: string, pending: PersistedViewport): boolean {
  if (!sectionId) return false;
  const disk = loadViewport(sectionId, boardId);
  const merged = mergeViewport(disk, pending);
  return tryPersistLocalStorage(viewportKey(sectionId, boardId), JSON.stringify(merged), 'freeSpaceViewport');
}

function savePrefs(sectionId: string, boardId: string, p: PersistedPrefs): void {
  if (!sectionId) return;
  tryPersistLocalStorage(prefsKey(sectionId, boardId), JSON.stringify(p), 'freeSpacePrefs');
}

export function useSectionCanvasMode(sectionId: string, boardId = ''): SectionCanvasState {
  const initialViewport = loadViewport(sectionId, boardId);
  const initialPrefs = loadPrefs(sectionId, boardId);
  const [zoom, setZoomRaw] = useState(initialViewport.zoom);
  const [panX, setPanXRaw] = useState(initialViewport.panX);
  const [panY, setPanYRaw] = useState(initialViewport.panY);
  const [snapToGrid, setSnapToGrid] = useState(initialPrefs.snapToGrid);
  const [gridSize, setGridSize] = useState(initialPrefs.gridSize);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{
    sectionId: string;
    boardId: string;
    viewport: PersistedViewport;
  } | null>(null);

  const flushViewport = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingPersistRef.current;
    if (!pending) return;
    if (persistViewportMerged(pending.sectionId, pending.boardId, pending.viewport)) {
      pendingPersistRef.current = null;
    }
  }, []);

  const scheduleViewportPersist = useCallback((v: PersistedViewport, sid: string, bid: string) => {
    if (!sid) return;
    pendingPersistRef.current = { sectionId: sid, boardId: bid, viewport: v };
    markSavePending('freeSpaceViewport');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const pending = pendingPersistRef.current;
      if (!pending) return;
      if (persistViewportMerged(pending.sectionId, pending.boardId, pending.viewport)) {
        pendingPersistRef.current = null;
      }
    }, 300);
  }, []);

  useEffect(() => {
    flushViewport();
    const v = loadViewport(sectionId, boardId);
    const p = loadPrefs(sectionId, boardId);
    setZoomRaw(v.zoom);
    setPanXRaw(v.panX);
    setPanYRaw(v.panY);
    setSnapToGrid(p.snapToGrid);
    setGridSize(p.gridSize);
  }, [sectionId, boardId, flushViewport]);

  useEffect(() => {
    if (!sectionId) return;
    const storageKey = viewportKey(sectionId, boardId);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue == null) return;
      if (!parseFreeSpaceStorageKey(storageKey)) return;
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        const s = sanitizeViewport(parsed, sectionId, VIEW_DEFAULTS);
        const remote = { zoom: s.zoom, panX: s.panX, panY: s.panY };
        setZoomRaw(prev => remote.zoom ?? prev);
        setPanXRaw(prev => remote.panX ?? prev);
        setPanYRaw(prev => remote.panY ?? prev);
        pendingPersistRef.current = { sectionId, boardId, viewport: remote };
      } catch {
        recordStorageConflict(`Could not merge viewport from storage event for "${storageKey}"`);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [sectionId, boardId]);

  useEffect(() => {
    scheduleViewportPersist({ zoom, panX, panY }, sectionId, boardId);
    return () => flushViewport();
  }, [sectionId, boardId, zoom, panX, panY, scheduleViewportPersist, flushViewport]);

  useEffect(() => registerFreeSpacePersistFlush(flushViewport), [flushViewport]);

  useEffect(() => {
    savePrefs(sectionId, boardId, { snapToGrid, gridSize });
  }, [sectionId, boardId, snapToGrid, gridSize]);

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
