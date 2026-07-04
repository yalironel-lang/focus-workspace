/**
 * Commit in-flight canvas drag/pan before page hide / flush.
 */

const committers = new Set<() => void>();

export function registerFreeSpaceDragCommit(fn: () => void): () => void {
  committers.add(fn);
  return () => {
    committers.delete(fn);
  };
}

export function commitAllInFlightDragPan(): void {
  for (const fn of committers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
