import { useCallback, useEffect, useRef, useState } from 'react';
import { ZOOM_MIN, ZOOM_MAX } from './useCanvasMode';
import { loadUniverseViewport, saveUniverseViewport } from '../lib/workspaceUniverse/storage';
import type { UniverseCanvasSnapshot } from '../lib/workspaceUniverse/types';

export interface UniverseCanvasState {
  zoom: number;
  panX: number;
  panY: number;
  setViewport: (zoom: number, panX: number, panY: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  centerView: (contentW: number, contentH: number, vpW: number, vpH: number) => void;
}

const DEFAULTS = loadUniverseViewport();

export function useUniverseCanvas(): UniverseCanvasState {
  const [zoom, setZoom] = useState(DEFAULTS.zoom);
  const [panX, setPanX] = useState(DEFAULTS.panX);
  const [panY, setPanY] = useState(DEFAULTS.panY);
  const persistRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersist = useCallback((v: UniverseCanvasSnapshot) => {
    if (persistRef.current) clearTimeout(persistRef.current);
    persistRef.current = setTimeout(() => saveUniverseViewport(v), 120);
  }, []);

  useEffect(
    () => () => {
      if (persistRef.current) clearTimeout(persistRef.current);
    },
    [],
  );

  const setViewport = useCallback(
    (z: number, px: number, py: number) => {
      const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
      setZoom(nz);
      setPanX(px);
      setPanY(py);
      schedulePersist({ zoom: nz, panX: px, panY: py });
    },
    [schedulePersist],
  );

  const setPan = useCallback(
    (x: number, y: number) => {
      setPanX(x);
      setPanY(y);
      schedulePersist({ zoom, panX: x, panY: y });
    },
    [zoom, schedulePersist],
  );

  const resetView = useCallback(() => {
    setViewport(DEFAULTS.zoom, DEFAULTS.panX, DEFAULTS.panY);
  }, [setViewport]);

  const centerView = useCallback(
    (contentW: number, contentH: number, vpW: number, vpH: number) => {
      const z = Math.min(1.1, Math.max(0.5, Math.min(vpW / contentW, vpH / contentH) * 0.88));
      const px = (vpW - contentW * z) / 2;
      const py = (vpH - contentH * z) / 2;
      setViewport(z, px, py);
    },
    [setViewport],
  );

  return { zoom, panX, panY, setViewport, setPan, resetView, centerView };
}
