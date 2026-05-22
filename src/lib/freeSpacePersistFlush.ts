/**
 * Global registry so SW reload / tab hide can flush debounced Free Space writes.
 */

const flushers = new Set<() => void>();

export function registerFreeSpacePersistFlush(fn: () => void): () => void {
  flushers.add(fn);
  return () => {
    flushers.delete(fn);
  };
}

export function flushAllFreeSpacePersistence(): void {
  for (const fn of flushers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
