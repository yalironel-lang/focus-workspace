/**
 * PR8: automatic drain of pending Free Space CREATE/UPDATE ops.
 *
 * Not a second sync engine. The only cloud writer remains
 * flushPendingFreeSpaceCreates. This module only schedules it:
 *   successful enqueue → 300ms trailing debounce → serialized drain
 *   window `online` / remount → requestNow
 *   cloud_write_failed → exactly one delayed retry (never recursive)
 *
 * Does not touch the IDB queue on scope invalidate.
 * Does not flush on beforeunload / pagehide / visibilitychange.
 */

import type { CacheNamespace } from '../focusCacheNamespace';
import { assertCacheNamespace } from '../focusCacheNamespace';
import type { FlushPendingFreeSpaceCreatesResult } from './flushPendingFreeSpaceCreates';
import { bindFreeSpaceAutoFlushApi } from './freeSpacePendingFlushTrigger';

export const FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS = 300;
export const FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS = 2000;
export const FREE_SPACE_AUTO_FLUSH_MAX_BURST_PASSES = 3;

export type FreeSpaceAutoFlushFn = (
  namespace: CacheNamespace,
) => Promise<FlushPendingFreeSpaceCreatesResult>;

type ScopeState = {
  generation: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  failureRetryTimer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  rerun: boolean;
};

const scopes = new Map<string, ScopeState>();

const defaultFlush: FreeSpaceAutoFlushFn = async namespace => {
  const { flushPendingFreeSpaceCreates } = await import('./flushPendingFreeSpaceCreates');
  return flushPendingFreeSpaceCreates(namespace);
};

let flushImpl: FreeSpaceAutoFlushFn = defaultFlush;
let onlineOverride: boolean | null = null;

function scopeKey(namespace: CacheNamespace): string {
  return `${namespace.userId}::${namespace.workspaceId}`;
}

function readOnline(): boolean {
  if (onlineOverride !== null) return onlineOverride;
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function getOrCreateState(namespace: CacheNamespace): ScopeState {
  const key = scopeKey(namespace);
  let state = scopes.get(key);
  if (!state) {
    state = {
      generation: 0,
      debounceTimer: null,
      failureRetryTimer: null,
      inFlight: false,
      rerun: false,
    };
    scopes.set(key, state);
  }
  return state;
}

function clearDebounce(state: ScopeState): void {
  if (state.debounceTimer != null) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
}

function clearFailureRetry(state: ScopeState): void {
  if (state.failureRetryTimer != null) {
    clearTimeout(state.failureRetryTimer);
    state.failureRetryTimer = null;
  }
}

function resolvedNamespace(namespace: CacheNamespace): CacheNamespace | null {
  const ns = assertCacheNamespace(namespace);
  return ns.ok ? ns.namespace : null;
}

function scheduleFailureRetry(
  namespace: CacheNamespace,
  state: ScopeState,
  generation: number,
): void {
  clearFailureRetry(state);
  state.failureRetryTimer = setTimeout(() => {
    state.failureRetryTimer = null;
    if (state.generation !== generation) return;
    void requestDrain(namespace, { fromFailureRetry: true });
  }, FREE_SPACE_AUTO_FLUSH_FAILURE_RETRY_MS);
}

async function runDrainLoop(
  namespace: CacheNamespace,
  state: ScopeState,
  fromFailureRetry: boolean,
): Promise<void> {
  const generation = state.generation;
  let failedCloud = false;
  let passes = 0;

  try {
    while (passes < FREE_SPACE_AUTO_FLUSH_MAX_BURST_PASSES) {
      passes += 1;
      state.rerun = false;
      if (state.generation !== generation) return;
      if (!readOnline()) return;

      const result = await flushImpl(namespace);
      if (state.generation !== generation) return;

      if (result.stoppedReason === 'cloud_write_failed') {
        failedCloud = true;
        // Only a normal drain may schedule the one delayed retry.
        // A failed delayed retry must not recurse.
        if (!fromFailureRetry) {
          scheduleFailureRetry(namespace, state, generation);
        }
        return;
      }

      if (!state.rerun) return;
    }
  } finally {
    state.inFlight = false;
    if (
      !failedCloud &&
      state.rerun &&
      state.generation === generation &&
      readOnline()
    ) {
      state.rerun = false;
      void requestDrain(namespace, { fromFailureRetry: false });
    }
  }
}

async function requestDrain(
  namespace: CacheNamespace,
  options: { fromFailureRetry: boolean },
): Promise<void> {
  if (!readOnline()) return;
  const state = getOrCreateState(namespace);
  if (!options.fromFailureRetry) {
    clearFailureRetry(state);
  }
  if (state.inFlight) {
    state.rerun = true;
    return;
  }
  state.inFlight = true;
  await runDrainLoop(namespace, state, options.fromFailureRetry);
}

/** Trailing debounce after a successful CREATE/UPDATE enqueue. */
export function scheduleFreeSpacePendingFlush(namespace: CacheNamespace): void {
  const ns = resolvedNamespace(namespace);
  if (!ns) return;
  const state = getOrCreateState(ns);
  clearDebounce(state);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    void requestDrain(ns, { fromFailureRetry: false });
  }, FREE_SPACE_AUTO_FLUSH_DEBOUNCE_MS);
}

/** Immediate drain (mount / online). Does not delete queued ops. */
export function requestFreeSpacePendingFlushNow(namespace: CacheNamespace): void {
  const ns = resolvedNamespace(namespace);
  if (!ns) return;
  const state = getOrCreateState(ns);
  clearDebounce(state);
  void requestDrain(ns, { fromFailureRetry: false });
}

/** Marks a live section scope. Queue is not modified. */
export function registerFreeSpaceAutoFlushScope(namespace: CacheNamespace): void {
  const ns = resolvedNamespace(namespace);
  if (!ns) return;
  getOrCreateState(ns);
}

/**
 * Cancels debounce/retry and stale in-flight follow-up for this scope.
 * Never deletes IndexedDB pending_operations.
 */
export function invalidateFreeSpaceAutoFlushScope(namespace: CacheNamespace): void {
  const ns = resolvedNamespace(namespace);
  if (!ns) return;
  const state = getOrCreateState(ns);
  state.generation += 1;
  state.rerun = false;
  clearDebounce(state);
  clearFailureRetry(state);
}

export function setFreeSpaceAutoFlushImplForTests(fn: FreeSpaceAutoFlushFn | null): void {
  flushImpl = fn ?? defaultFlush;
}

export function setFreeSpaceAutoFlushOnlineForTests(online: boolean | null): void {
  onlineOverride = online;
}

export function resetFreeSpaceAutoFlushForTests(): void {
  for (const state of scopes.values()) {
    state.generation += 1;
    state.rerun = false;
    state.inFlight = false;
    clearDebounce(state);
    clearFailureRetry(state);
  }
  scopes.clear();
  flushImpl = defaultFlush;
  onlineOverride = null;
}

bindFreeSpaceAutoFlushApi({
  schedule: scheduleFreeSpacePendingFlush,
  requestNow: requestFreeSpacePendingFlushNow,
  register: registerFreeSpaceAutoFlushScope,
  invalidate: invalidateFreeSpaceAutoFlushScope,
});
