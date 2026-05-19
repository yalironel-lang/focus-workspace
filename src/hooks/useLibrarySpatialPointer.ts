import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export type LibraryFocusRegion = 'hero' | 'field' | 'chrome' | null;

export interface LibrarySpatialState {
  nx: number;
  ny: number;
  px: number;
  py: number;
  reducedMotion: boolean;
  /** True when the pointer has been still for several seconds */
  idle: boolean;
  /** 0 = calm baseline … 1 = actively engaged */
  engagement: number;
  focusRegion: LibraryFocusRegion;
  setFocusRegion: (region: LibraryFocusRegion) => void;
}

const IDLE_MS = 4200;
const ENGAGEMENT_FLOOR = 0.22;

const DEFAULT = {
  nx: 0,
  ny: 0,
  px: 0.5,
  py: 0.42,
  reducedMotion: false,
  idle: true,
  engagement: ENGAGEMENT_FLOOR,
};

/**
 * Cursor field + calm idle/engagement for the library spatial OS.
 */
export function useLibrarySpatialState(enabled = true): LibrarySpatialState {
  const reducedMotion = usePrefersReducedMotion();
  const [focusRegion, setFocusRegion] = useState<LibraryFocusRegion>(null);
  const [pointer, setPointer] = useState(() => ({
    nx: DEFAULT.nx,
    ny: DEFAULT.ny,
    px: DEFAULT.px,
    py: DEFAULT.py,
  }));
  const [idle, setIdle] = useState(true);
  const [engagement, setEngagement] = useState(ENGAGEMENT_FLOOR);

  const rafRef = useRef(0);
  const pendingRef = useRef({ nx: 0, ny: 0, px: 0.5, py: 0.42 });
  const lastMoveRef = useRef(0);

  const flush = useCallback(() => {
    rafRef.current = 0;
    const p = pendingRef.current;
    setPointer(prev => {
      if (prev.nx === p.nx && prev.ny === p.ny && prev.px === p.px && prev.py === p.py) return prev;
      return p;
    });
  }, []);

  useEffect(() => {
    if (!enabled || reducedMotion || typeof window === 'undefined') {
      setIdle(true);
      setEngagement(ENGAGEMENT_FLOOR);
      return;
    }

    const onMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      lastMoveRef.current = Date.now();
      setIdle(false);
      setEngagement(1);
      pendingRef.current = {
        px: e.clientX / w,
        py: e.clientY / h,
        nx: (e.clientX / w) * 2 - 1,
        ny: (e.clientY / h) * 2 - 1,
      };
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flush);
    };

    const onLeave = () => {
      pendingRef.current = { nx: 0, ny: 0, px: 0.5, py: 0.42 };
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flush);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);

    const calmTick = window.setInterval(() => {
      const stillFor = Date.now() - lastMoveRef.current;
      if (stillFor > IDLE_MS) {
        setIdle(true);
        setEngagement(e => Math.max(ENGAGEMENT_FLOOR, e - 0.06));
      }
    }, 500);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      window.clearInterval(calmTick);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, reducedMotion, flush]);

  return {
    ...pointer,
    reducedMotion,
    idle,
    engagement,
    focusRegion,
    setFocusRegion,
  };
}
