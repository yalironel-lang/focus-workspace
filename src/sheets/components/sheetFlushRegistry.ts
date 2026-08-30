/**
 * Narrow pre-transition flush for Focus Sheet surfaces.
 * Presentation remounts a new engine from canonical object content;
 * unmount flush alone is not sufficient because React applies the
 * remount render before cleanup setState from the old surface lands.
 */

type FlushFn = () => void;

const byObject = new Map<string, Set<FlushFn>>();

export function registerSheetFlush(objectId: string, flush: FlushFn): () => void {
  if (!objectId) return () => undefined;
  let set = byObject.get(objectId);
  if (!set) {
    set = new Set();
    byObject.set(objectId, set);
  }
  set.add(flush);
  return () => {
    set!.delete(flush);
    if (set!.size === 0) byObject.delete(objectId);
  };
}

/** Synchronously export+commit the active Sheet document for this object. */
export function flushSheetForObject(objectId: string): void {
  if (!objectId) return;
  const set = byObject.get(objectId);
  if (!set || set.size === 0) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      // ignore individual flush failures; caller still proceeds
    }
  }
}

/** DEV/evidence: how many surfaces currently register a flush for an object. */
export function countRegisteredSheetFlushes(objectId: string): number {
  return byObject.get(objectId)?.size ?? 0;
}
