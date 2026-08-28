/**
 * useBlockPositions — stores x/y/w/h for each item in freeform canvas mode.
 *
 * Each item (system module OR custom block OR custom tool) has its own
 * position entry keyed by ID. Positions survive across sessions in localStorage.
 *
 * Grid mode never reads from this; it uses the normal CSS grid flow.
 * Freeform mode reads/writes positions here exclusively.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { notifyDeskMutation } from '../lib/desk/deskPersistence';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fw_block_positions_v1';

// Default block dimensions in freeform mode (pixels)
export const DEFAULT_BLOCK_W = 340;
export const DEFAULT_BLOCK_H = 0;   // 0 = let content define height

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlockPos {
  x: number;
  y: number;
  w: number;  // 0 = natural/auto
  h: number;  // 0 = natural/auto
}

export type PositionMap = Record<string, BlockPos>;

// ── Storage helpers ───────────────────────────────────────────────────────────

function load(): PositionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PositionMap) : {};
  } catch {
    return {};
  }
}

function persist(m: PositionMap, syncUserId?: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    notifyDeskMutation(syncUserId);
  } catch { /* quota */ }
}

const makeDefault = (hint?: Partial<BlockPos>): BlockPos => ({
  x: 40,
  y: 40,
  w: DEFAULT_BLOCK_W,
  h: DEFAULT_BLOCK_H,
  ...hint,
});

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface BlockPositionsState {
  positions: PositionMap;
  getPos:    (id: string) => BlockPos;
  setPos:    (id: string, pos: Partial<BlockPos>) => void;
  /**
   * Ensure a position exists for `id`. No-op if already set.
   * `hint` provides initial coordinates; if absent, a cascade offset is computed
   * so new blocks don't pile on top of existing ones.
   */
  initPos:   (id: string, hint?: Partial<BlockPos>) => void;
  removePos: (id: string) => void;
  /**
   * Returns {x, y} offset so the next placed block doesn't fully overlap
   * any existing block in the map.
   */
  nextFreePos: (existingMap?: PositionMap) => { x: number; y: number };
}

export function useBlockPositions(syncUserId?: string | null): BlockPositionsState {
  const syncRef = useRef(syncUserId);
  syncRef.current = syncUserId;
  const [positions, setPositions] = useState<PositionMap>(load);

  useEffect(() => {
    const onCloud = () => setPositions(load());
    window.addEventListener('fw-desk-cloud-applied', onCloud);
    return () => window.removeEventListener('fw-desk-cloud-applied', onCloud);
  }, []);

  const getPos = useCallback((id: string): BlockPos => {
    return positions[id] ?? makeDefault();
  }, [positions]);

  const setPos = useCallback((id: string, patch: Partial<BlockPos>) => {
    setPositions(prev => {
      const next: PositionMap = {
        ...prev,
        [id]: { ...(prev[id] ?? makeDefault()), ...patch },
      };
      persist(next, syncRef.current);
      return next;
    });
  }, []);

  const initPos = useCallback((id: string, hint?: Partial<BlockPos>) => {
    setPositions(prev => {
      if (prev[id]) return prev;          // already positioned — leave it
      const next: PositionMap = {
        ...prev,
        [id]: makeDefault(hint),
      };
      persist(next, syncRef.current);
      return next;
    });
  }, []);

  const removePos = useCallback((id: string) => {
    setPositions(prev => {
      const { [id]: _removed, ...rest } = prev;
      persist(rest, syncRef.current);
      return rest;
    });
  }, []);

  const nextFreePos = useCallback((existingMap?: PositionMap): { x: number; y: number } => {
    const map = existingMap ?? positions;
    const existing = Object.values(map);
    let x = 60, y = 60;
    for (let attempts = 0; attempts < 60; attempts++) {
      const overlaps = existing.some(
        p => Math.abs(p.x - x) < 50 && Math.abs(p.y - y) < 50,
      );
      if (!overlaps) break;
      x += 48;
      y += 48;
      if (x > 960) { x = 60; y += 120; }
    }
    return { x, y };
  }, [positions]);

  return { positions, getPos, setPos, initPos, removePos, nextFreePos };
}
