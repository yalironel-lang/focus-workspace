import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { BlockPos, PositionMap } from './useBlockPositions';
import { DEFAULT_BLOCK_H, DEFAULT_BLOCK_W } from './useBlockPositions';
import { fwPersistWarn, sanitizeBlockPos, sanitizePositionMap, boardScopedFreeSpaceKeys } from '../lib/freeSpacePersistence';
import { registerFreeSpacePersistFlush } from '../lib/freeSpacePersistFlush';
import { mergePositionMaps, parseFreeSpaceStorageKey, persistWithPendingDeletes } from '../lib/freeSpaceLocalMerge';
import { tryPersistLocalStorage } from '../lib/freeSpacePersistWrite';
import { markSavePending, recordStorageConflict } from '../lib/saveStatus';
import { registerFreeSpaceRemotePositionApply } from '../lib/freeSpaceRemotePositionApply';

function key(sectionId: string, boardId = ''): string {
  return boardScopedFreeSpaceKeys(sectionId, boardId).positions;
}

function load(sectionId: string, boardId = ''): PositionMap {
  if (!sectionId) return {};
  try {
    const raw = localStorage.getItem(key(sectionId, boardId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const { map, repaired } = sanitizePositionMap(parsed, sectionId);
    if (repaired) {
      fwPersistWarn(`Repaired invalid Free Space positions for section "${sectionId}" and rewrote storage.`);
      try {
        localStorage.setItem(key(sectionId, boardId), JSON.stringify(map));
      } catch { /* quota */ }
    }
    return map;
  } catch (e) {
    fwPersistWarn(`Failed to parse Free Space positions for section "${sectionId}": ${String(e)}; clearing positions key.`);
    try {
      localStorage.removeItem(key(sectionId, boardId));
    } catch { /* ignore */ }
    return {};
  }
}

function persistMerged(
  sectionId: string,
  boardId: string,
  pending: PositionMap,
  deletedIds?: ReadonlySet<string>,
): boolean {
  if (!sectionId) return false;
  const disk = load(sectionId, boardId);
  const merged = mergePositionMaps(disk, pending, deletedIds);
  return tryPersistLocalStorage(key(sectionId, boardId), JSON.stringify(merged), 'freeSpacePositions');
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
  applyPositions: (patches: Record<string, BlockPos> | null | undefined) => void;
  /**
   * PR C: cloud/realtime geometry → PositionMap. Persists for reload.
   * Must not go through setPos (that path stamps geometry.updatedAt and enqueues UPDATE).
   */
  applyExternalPositions: (patches: Record<string, BlockPos> | null | undefined) => void;
  initPos: (id: string, hint?: Partial<BlockPos>) => void;
  seedMissingPositions: (ids: string[]) => void;
  removePos: (id: string) => void;
  nextFreePos: (existingMap?: PositionMap) => { x: number; y: number };
}

export function useSectionBlockPositions(sectionId: string, boardId = ''): SectionBlockPositionsState {
  const [positions, setPositions] = useState<PositionMap>(() => load(sectionId, boardId));
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ sectionId: string; boardId: string; positions: PositionMap } | null>(null);
  /** Ids deleted in this tab whose delete has not yet been committed to disk. */
  const pendingDeletedIdsRef = useRef<Set<string>>(new Set());

  const commitPersist = useCallback(
    (sid: string, bid: string, pos: PositionMap): boolean =>
      persistWithPendingDeletes(pendingDeletedIdsRef.current, deletedIds =>
        persistMerged(sid, bid, pos, deletedIds),
      ),
    [],
  );

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pending = pendingPersistRef.current;
    if (!pending) return;
    if (commitPersist(pending.sectionId, pending.boardId, pending.positions)) {
      pendingPersistRef.current = null;
    }
  }, [commitPersist]);

  const writePositions = useCallback((
    next: PositionMap,
    targetSectionId: string,
    targetBoardId: string,
    immediate = false,
  ) => {
    if (!targetSectionId) return;
    pendingPersistRef.current = { sectionId: targetSectionId, boardId: targetBoardId, positions: next };
    markSavePending('freeSpacePositions');
    if (immediate && commitPersist(targetSectionId, targetBoardId, next)) {
      pendingPersistRef.current = null;
      return;
    }
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const p = pendingPersistRef.current;
      if (!p) return;
      if (commitPersist(p.sectionId, p.boardId, p.positions)) {
        pendingPersistRef.current = null;
      }
    }, 120);
  }, [commitPersist]);

  useEffect(() => {
    flushPersist();
    // Deleted ids belong to the previous scope; never let them bleed into the next one.
    pendingDeletedIdsRef.current.clear();
    setPositions(load(sectionId, boardId));
  }, [sectionId, boardId, flushPersist]);

  useEffect(() => {
    if (!sectionId) return;
    const storageKey = key(sectionId, boardId);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue == null) return;
      if (!parseFreeSpaceStorageKey(storageKey)) return;
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        const { map } = sanitizePositionMap(parsed, sectionId);
        setPositions(prev => {
          // PR C: keep local-wins merge. Cloud Realtime/pull is geometry SOT;
          // storage events do not fire in the writer tab. Local keys winning
          // prevents a sibling tab's persist from clobbering a cloud-applied
          // position in this tab. Do not treat positions LS as cross-tab sync.
          const merged = { ...map, ...prev };
          pendingPersistRef.current = { sectionId, boardId, positions: merged };
          return merged;
        });
      } catch {
        recordStorageConflict(`Could not merge positions from storage event for "${storageKey}"`);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [sectionId, boardId]);

  useEffect(() => () => flushPersist(), [flushPersist]);

  useEffect(() => registerFreeSpacePersistFlush(flushPersist), [flushPersist]);

  const setPos = useCallback((id: string, patch: Partial<BlockPos>) => {
    setPositions(prev => {
      const merged = { ...(prev[id] ?? makeDefault()), ...patch };
      const next: PositionMap = {
        ...prev,
        [id]: sanitizeBlockPos(merged),
      };
      writePositions(next, sectionId, boardId);
      return next;
    });
  }, [writePositions, sectionId, boardId]);

  const applyPositions = useCallback((patches: Record<string, BlockPos> | null | undefined) => {
    if (!patches || typeof patches !== 'object') return;
    setPositions((prev) => {
      const next: PositionMap = { ...prev };
      for (const [id, pos] of Object.entries(patches)) {
        if (!pos || typeof pos !== 'object') continue;
        const merged = sanitizeBlockPos({ ...(prev[id] ?? makeDefault()), ...pos });
        next[id] = merged;
      }
      writePositions(next, sectionId, boardId);
      return next;
    });
  }, [writePositions, sectionId, boardId]);

  const applyExternalPositions = useCallback((patches: Record<string, BlockPos> | null | undefined) => {
    if (!patches || typeof patches !== 'object') return;
    setPositions((prev) => {
      let changed = false;
      const next: PositionMap = { ...prev };
      for (const [id, pos] of Object.entries(patches)) {
        if (!id || !pos || typeof pos !== 'object') continue;
        const merged = sanitizeBlockPos({ ...(prev[id] ?? makeDefault()), ...pos });
        const cur = prev[id];
        if (
          cur &&
          cur.x === merged.x &&
          cur.y === merged.y &&
          cur.w === merged.w &&
          cur.h === merged.h
        ) {
          continue;
        }
        next[id] = merged;
        changed = true;
      }
      if (!changed) return prev;
      writePositions(next, sectionId, boardId, true);
      return next;
    });
  }, [writePositions, sectionId, boardId]);

  useEffect(() => {
    registerFreeSpaceRemotePositionApply(applyExternalPositions);
    return () => {
      registerFreeSpaceRemotePositionApply(null);
    };
  }, [applyExternalPositions, sectionId, boardId]);

  const initPos = useCallback((id: string, hint?: Partial<BlockPos>) => {
    setPositions(prev => {
      if (prev[id]) return prev;
      const next: PositionMap = { ...prev, [id]: sanitizeBlockPos(makeDefault(hint)) };
      writePositions(next, sectionId, boardId, true);
      return next;
    });
  }, [writePositions, sectionId, boardId]);

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
      writePositions(next, sectionId, boardId);
      return next;
    });
  }, [writePositions, sectionId, boardId]);

  const removePos = useCallback((id: string) => {
    pendingDeletedIdsRef.current.add(id);
    setPositions(prev => {
      const { [id]: _removed, ...rest } = prev;
      writePositions(rest, sectionId, boardId);
      return rest;
    });
  }, [writePositions, sectionId, boardId]);

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

  return useMemo(() => ({
    positions,
    setPos,
    applyPositions,
    applyExternalPositions,
    initPos,
    seedMissingPositions,
    removePos,
    nextFreePos,
  }),
    [positions, setPos, applyPositions, applyExternalPositions, initPos, seedMissingPositions, removePos, nextFreePos]);
}
