/**
 * Thin Mission Control index composer.
 * Library-first — not wired into Mission Control UI in Phase 1.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CourseLink, GroupWithItems } from '../types';
import { deriveMissionControlIndex } from '../lib/missionControl/deriveMissionControlIndex';
import {
  buildLocalSectionFreeSpaceIndexSource,
  loadSectionFreeSpaceIndexSource,
  type FreeSpaceIndexEntry,
} from '../lib/missionControl/loadSectionFreeSpaceIndexSource';
import type {
  MissionControlIndexCompleteness,
  MissionControlIndexResult,
  MissionControlItem,
} from '../lib/missionControl/types';

export type UseMissionControlIndexInput = {
  sectionId: string;
  userId?: string | null;
  /** Board ids already known (e.g. after board catch-up). */
  boardIds?: string[];
  groups?: readonly GroupWithItems[];
  courseLinks?: readonly CourseLink[];
  /** Skip cloud (tests / forced offline). */
  offline?: boolean;
  enabled?: boolean;
};

/** Pure guard used by the hook — exported for regression tests. */
export function shouldApplyMissionControlLoadResult(
  requestGeneration: number,
  latestGeneration: number,
): boolean {
  return requestGeneration === latestGeneration;
}

function localSnapshot(
  sectionId: string,
  boardIds: string[] | undefined,
  offline: boolean,
): {
  entries: FreeSpaceIndexEntry[];
  completeness: MissionControlIndexCompleteness;
  status: 'loading' | 'ready';
} {
  if (!sectionId) {
    return { entries: [], completeness: 'local-only', status: 'ready' };
  }
  const local = buildLocalSectionFreeSpaceIndexSource({ sectionId, boardIds });
  return {
    entries: local.entries,
    completeness: offline ? 'local-only' : 'loading',
    status: offline ? 'ready' : 'loading',
  };
}

export function useMissionControlIndex(
  input: UseMissionControlIndexInput,
): MissionControlIndexResult & { refresh: () => void } {
  const {
    sectionId,
    userId = null,
    boardIds,
    groups = [],
    courseLinks = [],
    offline = false,
    enabled = true,
  } = input;

  const boardIdsKey = boardIds?.join('\0') ?? '';

  const [fsEntries, setFsEntries] = useState<FreeSpaceIndexEntry[]>(() =>
    localSnapshot(sectionId, boardIds, offline).entries,
  );
  const [completeness, setCompleteness] = useState<MissionControlIndexCompleteness>(
    () => localSnapshot(sectionId, boardIds, offline).completeness,
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    () => localSnapshot(sectionId, boardIds, offline).status,
  );
  const [activeSectionId, setActiveSectionId] = useState(sectionId);
  const genRef = useRef(0);

  // Drop stale Free Space rows on section change before paint commit (no A→B leak frame).
  if (activeSectionId !== sectionId) {
    setActiveSectionId(sectionId);
    const resolved = boardIdsKey ? boardIdsKey.split('\0') : undefined;
    const snap = localSnapshot(sectionId, resolved, offline);
    setFsEntries(snap.entries);
    setCompleteness(snap.completeness);
    setStatus(snap.status);
    genRef.current += 1;
  }

  const refresh = useCallback(() => {
    if (!enabled || !sectionId) {
      setFsEntries([]);
      setCompleteness('local-only');
      setStatus('ready');
      return;
    }

    const gen = ++genRef.current;
    const resolvedBoardIds = boardIdsKey ? boardIdsKey.split('\0') : undefined;
    const snap = localSnapshot(sectionId, resolvedBoardIds, offline);
    setFsEntries(snap.entries);
    setCompleteness(snap.completeness);
    setStatus(offline ? 'ready' : 'loading');

    if (offline) return;

    void loadSectionFreeSpaceIndexSource({
      sectionId,
      userId,
      boardIds: resolvedBoardIds,
      offline: false,
    })
      .then(source => {
        if (!shouldApplyMissionControlLoadResult(gen, genRef.current)) return;
        setFsEntries(source.entries);
        setCompleteness(source.completeness);
        setStatus('ready');
      })
      .catch(() => {
        if (!shouldApplyMissionControlLoadResult(gen, genRef.current)) return;
        // Keep last local entries; never mark complete on failure.
        setCompleteness('local-only');
        setStatus('error');
      });
  }, [enabled, sectionId, userId, boardIdsKey, offline]);

  useEffect(() => {
    refresh();
    return () => {
      // Invalidate in-flight work when deps change or unmount.
      genRef.current += 1;
    };
  }, [refresh]);

  const items: MissionControlItem[] = useMemo(() => {
    if (!sectionId) return [];
    return deriveMissionControlIndex({
      sectionId,
      freeSpaceEntries: fsEntries,
      groups,
      courseLinks,
      completeness,
    }).items;
  }, [sectionId, fsEntries, groups, courseLinks, completeness]);

  return { items, completeness, status, refresh };
}
