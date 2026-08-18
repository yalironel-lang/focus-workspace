/**
 * Section Free Space viewport persist policy.
 * Local interaction persists; remote storage applies at idle and never writes back.
 */

import { mergeViewport, type PersistedViewport } from './freeSpaceLocalMerge';
import { tryPersistLocalStorage } from './freeSpacePersistWrite';
import { markSaveOk } from './saveStatus';

export const VIEWPORT_PERSIST_DEBOUNCE_MS = 300;
export const WHEEL_PAN_SETTLE_MS = 160;

export type ViewportWriteSource = 'local' | 'remote-storage' | 'hydrate';

export function shouldScheduleViewportPersist(source: ViewportWriteSource): boolean {
  return source === 'local';
}

export function decideRemoteViewportApply(input: {
  localNavigationActive: boolean;
  localPersistPending: boolean;
}): 'apply' | 'ignore' {
  if (input.localNavigationActive || input.localPersistPending) return 'ignore';
  return 'apply';
}

export function serializeViewport(v: PersistedViewport): string {
  return JSON.stringify({ zoom: v.zoom, panX: v.panX, panY: v.panY });
}

export function liveWheelPanFromDeltas(
  live: { panX: number; panY: number },
  rawDeltaX: number,
  rawDeltaY: number,
  speed: number,
): { panX: number; panY: number } {
  return {
    panX: live.panX - rawDeltaX * speed,
    panY: live.panY - rawDeltaY * speed,
  };
}

/**
 * Viewport-only equal-write skip. Does not change other localStorage channels.
 */
export function persistViewportJson(
  storageKey: string,
  nextRaw: string,
): 'written' | 'skipped' | 'failed' {
  let oldRaw: string | null = null;
  try {
    oldRaw = localStorage.getItem(storageKey);
  } catch {
    oldRaw = null;
  }
  if (oldRaw === nextRaw) {
    markSaveOk('freeSpaceViewport');
    return 'skipped';
  }
  const ok = tryPersistLocalStorage(storageKey, nextRaw, 'freeSpaceViewport');
  return ok ? 'written' : 'failed';
}

export function persistMergedViewport(
  storageKey: string,
  disk: PersistedViewport,
  pending: PersistedViewport,
): { result: 'written' | 'skipped' | 'failed'; merged: PersistedViewport; valuesEqual: boolean } {
  const merged = mergeViewport(disk, pending);
  const nextRaw = serializeViewport(merged);
  let oldRaw: string | null = null;
  try {
    oldRaw = localStorage.getItem(storageKey);
  } catch {
    oldRaw = null;
  }
  const valuesEqual = oldRaw === nextRaw;
  const result = persistViewportJson(storageKey, nextRaw);
  return { result, merged, valuesEqual };
}
