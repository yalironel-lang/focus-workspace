/**
 * Bind point so enqueue + the Free Space hook can request auto-flush
 * without importing the coordinator (avoids pulling the drain/cloud graph
 * into PR7 pull tests via useSectionFreeSpaceObjects).
 *
 * Production: freeSpaceObjectAutoFlush binds the API at module load
 * (imported from main.tsx). Unbound calls are no-ops.
 */

import type { CacheNamespace } from '../focusCacheNamespace';

type AutoFlushApi = {
  schedule: (namespace: CacheNamespace) => void;
  requestNow: (namespace: CacheNamespace) => void;
  register: (namespace: CacheNamespace) => void;
  invalidate: (namespace: CacheNamespace) => void;
};

let api: AutoFlushApi | null = null;

export function bindFreeSpaceAutoFlushApi(next: AutoFlushApi | null): void {
  api = next;
}

export function notifyFreeSpacePendingEnqueue(namespace: CacheNamespace): void {
  api?.schedule(namespace);
}

export function requestFreeSpacePendingFlushNow(namespace: CacheNamespace): void {
  api?.requestNow(namespace);
}

export function registerFreeSpaceAutoFlushScope(namespace: CacheNamespace): void {
  api?.register(namespace);
}

export function invalidateFreeSpaceAutoFlushScope(namespace: CacheNamespace): void {
  api?.invalidate(namespace);
}
