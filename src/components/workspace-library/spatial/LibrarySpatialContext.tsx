import { createContext, useContext, type ReactNode } from 'react';
import {
  useLibrarySpatialState,
  type LibraryFocusRegion,
  type LibrarySpatialState,
} from '../../../hooks/useLibrarySpatialPointer';

const LibrarySpatialContext = createContext<LibrarySpatialState | null>(null);

export function LibrarySpatialProvider({ children }: { children: ReactNode }) {
  const state = useLibrarySpatialState(true);
  return (
    <LibrarySpatialContext.Provider value={state}>{children}</LibrarySpatialContext.Provider>
  );
}

export function useLibrarySpatial(): LibrarySpatialState {
  const ctx = useContext(LibrarySpatialContext);
  if (!ctx) {
    return {
      nx: 0,
      ny: 0,
      px: 0.5,
      py: 0.42,
      reducedMotion: false,
      idle: true,
      engagement: 0.22,
      focusRegion: null,
      setFocusRegion: () => {},
    };
  }
  return ctx;
}

export type { LibraryFocusRegion, LibrarySpatialState };

/** Subtle parallax — scales down when idle or calm */
export function spatialParallaxOffset(
  spatial: LibrarySpatialState,
  layerDepth: number,
): { x: number; y: number } {
  if (spatial.reducedMotion) return { x: 0, y: 0 };
  const calm = spatial.idle ? 0.35 : 0.55 + spatial.engagement * 0.45;
  const gain = (3 + layerDepth * 6) * calm;
  return {
    x: spatial.nx * gain,
    y: spatial.ny * gain * 0.65,
  };
}

const FOCUS_ANCHORS: Record<Exclude<LibraryFocusRegion, null>, { px: number; py: number }> = {
  hero: { px: 0.32, py: 0.36 },
  field: { px: 0.58, py: 0.68 },
  chrome: { px: 0.1, py: 0.48 },
};

/** Blended focus point for atmospheric lighting */
export function spatialFocusPoint(spatial: LibrarySpatialState): { left: string; top: string } {
  const anchor = spatial.focusRegion ? FOCUS_ANCHORS[spatial.focusRegion] : null;
  const blend = anchor ? 0.38 + spatial.engagement * 0.22 : 1;
  const px = anchor ? spatial.px * blend + anchor.px * (1 - blend) : spatial.px;
  const py = anchor ? spatial.py * blend + anchor.py * (1 - blend) : spatial.py;
  return { left: `${px * 100}%`, top: `${py * 100}%` };
}
