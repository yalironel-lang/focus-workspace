/**
 * Global registry so SW reload / tab hide can flush debounced Free Space writes.
 *
 * Ordering (V1-H1):
 * 1. Editor flushers (e.g. Notebook TipTap debounce) — must run first so
 *    pending document content lands in the Free Space pendingPersist snapshot.
 * 2. Storage flushers (objects / positions / viewport) — write localStorage.
 * 3. Handwriting (async best-effort) — existing behavior.
 */

import { commitAllInFlightDragPan } from './freeSpaceDragCommit';
import { flushAllRegisteredHandwriting } from './handwritingFlushRegistry';
import { flushAllPendingHandwritingCloudEnqueues } from './notebookHandwritingCloud';

const editorFlushers = new Set<() => void>();
const flushers = new Set<() => void>();
let handwritingFlushInFlight: Promise<boolean> | null = null;

/**
 * Register a synchronous editor → Free Space content flush.
 * Runs before object/position/viewport localStorage flushers.
 */
export function registerEditorPersistFlush(fn: () => void): () => void {
  editorFlushers.add(fn);
  return () => {
    editorFlushers.delete(fn);
  };
}

export function registerFreeSpacePersistFlush(fn: () => void): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

/** Synchronous flush for localStorage debounces (objects, positions, viewport). */
export function flushAllFreeSpacePersistence(): void {
  for (const fn of editorFlushers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  for (const fn of flushers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Best-effort async flush including handwriting IDB writes + cloud enqueue intents. */
export function flushAllPersistenceBeforeUnload(): void {
  commitAllInFlightDragPan();
  flushAllFreeSpacePersistence();
  if (!handwritingFlushInFlight) {
    handwritingFlushInFlight = flushAllRegisteredHandwriting()
      .then(async ok => {
        await flushAllPendingHandwritingCloudEnqueues();
        return ok;
      })
      .finally(() => {
        handwritingFlushInFlight = null;
      });
  }
}

export function awaitAllPersistenceFlush(): Promise<void> {
  commitAllInFlightDragPan();
  flushAllFreeSpacePersistence();
  const hw = handwritingFlushInFlight ?? flushAllRegisteredHandwriting();
  return hw
    .then(() => flushAllPendingHandwritingCloudEnqueues())
    .then(() => undefined);
}

/** Test seam — clear registries between unit tests. */
export function resetFreeSpacePersistFlushForTests(): void {
  editorFlushers.clear();
  flushers.clear();
  handwritingFlushInFlight = null;
}
