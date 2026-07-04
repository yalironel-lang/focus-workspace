/**
 * Global registry so SW reload / tab hide can flush debounced Free Space writes.
 */

import { commitAllInFlightDragPan } from './freeSpaceDragCommit';
import { flushAllRegisteredHandwriting } from './handwritingFlushRegistry';

const flushers = new Set<() => void>();
let handwritingFlushInFlight: Promise<boolean> | null = null;

export function registerFreeSpacePersistFlush(fn: () => void): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

/** Synchronous flush for localStorage debounces (objects, positions, viewport). */
export function flushAllFreeSpacePersistence(): void {
  for (const fn of flushers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** Best-effort async flush including handwriting IDB writes. */
export function flushAllPersistenceBeforeUnload(): void {
  commitAllInFlightDragPan();
  flushAllFreeSpacePersistence();
  if (!handwritingFlushInFlight) {
    handwritingFlushInFlight = flushAllRegisteredHandwriting().finally(() => {
      handwritingFlushInFlight = null;
    });
  }
}

export function awaitAllPersistenceFlush(): Promise<void> {
  commitAllInFlightDragPan();
  flushAllFreeSpacePersistence();
  const hw = handwritingFlushInFlight ?? flushAllRegisteredHandwriting();
  return hw.then(() => undefined);
}
