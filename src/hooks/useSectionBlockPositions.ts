import { useState, useCallback } from 'react';
import type { BlockPos, PositionMap } from './useBlockPositions';
import { DEFAULT_BLOCK_H, DEFAULT_BLOCK_W } from './useBlockPositions';

function key(sectionId: string): string {
  return `fw_section_${sectionId}_free_space_positions_v1`;
}

function load(sectionId: string): PositionMap {
  try {
    const raw = localStorage.getItem(key(sectionId));
    return raw ? (JSON.parse(raw) as PositionMap) : {};
  } catch {
    return {};
  }
}

function persist(sectionId: string, m: PositionMap): void {
  try { localStorage.setItem(key(sectionId), JSON.stringify(m)); } catch { /* quota */ }
}

const makeDefault = (hint?: Partial<BlockPos>): BlockPos => ({
  x: 40,
  y: 40,
  w: DEFAULT_BLOCK_W,
  h: DEFAULT_BLOCK_H,
  ...hint,
});

export interface SectionBlockPositionsState {
  positions: PositionMap;
  setPos: (id: string, pos: Partial<BlockPos>) => void;
  initPos: (id: string, hint?: Partial<BlockPos>) => void;
  removePos: (id: string) => void;
  nextFreePos: (existingMap?: PositionMap) => { x: number; y: number };
}

export function useSectionBlockPositions(sectionId: string): SectionBlockPositionsState {
  const [positions, setPositions] = useState<PositionMap>(() => load(sectionId));

  const setPos = useCallback((id: string, patch: Partial<BlockPos>) => {
    setPositions(prev => {
      const next: PositionMap = {
        ...prev,
        [id]: { ...(prev[id] ?? makeDefault()), ...patch },
      };
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const initPos = useCallback((id: string, hint?: Partial<BlockPos>) => {
    setPositions(prev => {
      if (prev[id]) return prev;
      const next: PositionMap = { ...prev, [id]: makeDefault(hint) };
      persist(sectionId, next);
      return next;
    });
  }, [sectionId]);

  const removePos = useCallback((id: string) => {
    setPositions(prev => {
      const { [id]: _removed, ...rest } = prev;
      persist(sectionId, rest);
      return rest;
    });
  }, [sectionId]);

  const nextFreePos = useCallback((existingMap?: PositionMap): { x: number; y: number } => {
    const map = existingMap ?? positions;
    const existing = Object.values(map);
    let x = 80, y = 80;
    for (let attempts = 0; attempts < 80; attempts++) {
      const overlaps = existing.some(p => Math.abs(p.x - x) < 56 && Math.abs(p.y - y) < 56);
      if (!overlaps) break;
      x += 56;
      y += 40;
      if (x > 1100) { x = 80; y += 120; }
    }
    return { x, y };
  }, [positions]);

  return { positions, setPos, initPos, removePos, nextFreePos };
}

