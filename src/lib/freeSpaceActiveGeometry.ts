/**
 * PR C: which object ids currently own live local geometry
 * (drag, resize, or block momentum). Not React state — momentum can outlive draggingId.
 */

const activeIds = new Set<string>();

export function setFreeSpaceGeometryActive(id: string, active: boolean): void {
  if (!id) return;
  if (active) activeIds.add(id);
  else activeIds.delete(id);
}

export function isFreeSpaceGeometryActive(id: string): boolean {
  return !!id && activeIds.has(id);
}

export function getActiveFreeSpaceGeometryIds(): ReadonlySet<string> {
  return activeIds;
}

export function resetActiveFreeSpaceGeometryForTests(): void {
  activeIds.clear();
}
