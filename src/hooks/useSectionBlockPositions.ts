import { useState, useCallback, useEffect, useRef } from 'react';
import type { BlockPos, PositionMap } from './useBlockPositions';
import { DEFAULT_BLOCK_H, DEFAULT_BLOCK_W } from './useBlockPositions';
import { fwPersistWarn, sanitizeBlockPos, sanitizePositionMap } from '../lib/freeSpacePersistence';

function key(sectionId: string): string {
  return `fw_section_${sectionId}_free_space_positions_v1`;
}

function load(sectionId: string): PositionMap {
  if (!sectionId) return {};
  try {
    const raw = localStorage.getItem(key(sectionId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const { map, repaired } = sanitizePositionMap(parsed, sectionId);
    if (repaired) {
      fwPersistWarn(`Repaired invalid Free Space positions for section "${sectionId}" and rewrote storage.`);
      try {
        localStorage.setItem(key(sectionId), JSON.stringify(map));
      } catch { /* quota */ }
    }
    return map;
  } catch (e) {
    fwPersistWarn(`Failed to parse Free Space positions for section "${sectionId}": ${String(e)}; clearing positions key.`);
    try {
      localStorage.removeItem(key(sectionId));
    } catch { /* ignore */ }
    return {};
  }
}

function persist(sectionId: string, m: PositionMap): void {
  if (!sectionId) return;
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
  /** Apply many positions at once (e.g. spatial templates). Merges with existing map. */
  applyPositions: (patches: Record<string, BlockPos> | null | undefined) => void;
  initPos: (id: string, hint?: Partial<BlockPos>) => void;
  /** Ensures every listed id has a position (single batched write). Recovers from missing/cleared position maps. */
  seedMissingPositions: (ids: string[]) => void;
  removePos: (id: string) => void;
  nextFreePos: (existingMap?: PositionMap) => { x: number; y: number };
}

export function useSectionBlockPositions(sectionId: string): SectionBlockPositionsState {
  const [positions, setPositions] = useState<PositionMap>(() => load(sectionId));
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ sectionId: string; positions: PositionMap } | null>(null);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pending = pendingPersistRef.current;
    if (!pending) return;
    pendingPersistRef.current = null;
    persist(pending.sectionId, pending.positions);
  }, []);

  const schedulePersist = useCallback((next: PositionMap, targetSectionId: string) => {
    if (!targetSectionId) return;
    pendingPersistRef.current = { sectionId: targetSectionId, positions: next };
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const pending = pendingPersistRef.current;
      persistTimerRef.current = null;
      if (!pending) return;
      pendingPersistRef.current = null;
      persist(pending.sectionId, pending.positions);
    }, 120);
  }, []);

  useEffect(() => {
    flushPersist();
    setPositions(load(sectionId));
  }, [sectionId, flushPersist]);

  useEffect(() => () => flushPersist(), [flushPersist]);

  const setPos = useCallback((id: string, patch: Partial<BlockPos>) => {
    setPositions(prev => {
      const merged = { ...(prev[id] ?? makeDefault()), ...patch };
      const next: PositionMap = {
        ...prev,
        [id]: sanitizeBlockPos(merged),
      };
      schedulePersist(next, sectionId);
      return next;
    });
  }, [schedulePersist, sectionId]);

  const applyPositions = useCallback((patches: Record<string, BlockPos> | null | undefined) => {
    if (!patches || typeof patches !== 'object') return;
    setPositions((prev) => {
      const next: PositionMap = { ...prev };
      for (const [id, pos] of Object.entries(patches)) {
        if (!pos || typeof pos !== 'object') continue;
        const merged = sanitizeBlockPos({ ...(prev[id] ?? makeDefault()), ...pos });
        next[id] = merged;
      }
      schedulePersist(next, sectionId);
      return next;
    });
  }, [schedulePersist, sectionId]);

  const initPos = useCallback((id: string, hint?: Partial<BlockPos>) => {
    setPositions(prev => {
      if (prev[id]) return prev;
      const next: PositionMap = { ...prev, [id]: sanitizeBlockPos(makeDefault(hint)) };
      schedulePersist(next, sectionId);
      return next;
    });
  }, [schedulePersist, sectionId]);

  const seedMissingPositions = useCallback((ids: string[]) => {
    if (!sectionId || !ids.length) return;
    setPositions(prev => {
      const next: PositionMap = { ...prev };
      let changed = false;
      for (const id of ids) {
        if (!id || next[id]) continue;
        let x = 80;
        let y = 80;
        for (let attempts = 0; attempts < 80; attempts++) {
          const overlaps = Object.values(next).some(
            p => Math.abs(p.x - x) < 56 && Math.abs(p.y - y) < 56,
          );
          if (!overlaps) break;
          x += 56;
          y += 40;
          if (x > 1100) {
            x = 80;
            y += 120;
          }
        }
        next[id] = sanitizeBlockPos(makeDefault({ x, y }));
        changed = true;
      }
      if (!changed) return prev;
      schedulePersist(next, sectionId);
      return next;
    });
  }, [schedulePersist, sectionId]);

  const removePos = useCallback((id: string) => {
    setPositions(prev => {
      const { [id]: _removed, ...rest } = prev;
      schedulePersist(rest, sectionId);
      return rest;
    });
  }, [schedulePersist, sectionId]);

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

  return { positions, setPos, applyPositions, initPos, seedMissingPositions, removePos, nextFreePos };
}

