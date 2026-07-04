type FlushFn = () => Promise<boolean>;

const byObject = new Map<string, Set<FlushFn>>();

export function registerHandwritingFlush(
  objectId: string,
  _blockKey: string,
  flush: FlushFn,
): () => void {
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

export async function flushAllHandwritingForObject(objectId: string): Promise<boolean> {
  if (!objectId) return true;
  const set = byObject.get(objectId);
  if (!set || set.size === 0) return true;
  let allOk = true;
  for (const fn of set) {
    const ok = await fn().catch(() => false);
    if (!ok) allOk = false;
  }
  return allOk;
}

/** Flush every registered handwriting surface (SW reload / tab hide). */
export async function flushAllRegisteredHandwriting(): Promise<boolean> {
  if (byObject.size === 0) return true;
  let allOk = true;
  for (const set of byObject.values()) {
    for (const fn of set) {
      const ok = await fn().catch(() => false);
      if (!ok) allOk = false;
    }
  }
  return allOk;
}
