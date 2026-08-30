/**
 * DEV instrumentation + Escape coordination for Focus Sheet engines.
 * Not a document store — tracks live surface/engine ownership only.
 */

const activeEnginesByObject = new Map<string, number>();
const cellEditingByObject = new Map<string, boolean>();

export function noteSheetEngineMounted(objectId: string): void {
  if (!objectId) return;
  activeEnginesByObject.set(objectId, (activeEnginesByObject.get(objectId) ?? 0) + 1);
}

export function noteSheetEngineDisposed(objectId: string): void {
  if (!objectId) return;
  const next = (activeEnginesByObject.get(objectId) ?? 0) - 1;
  if (next <= 0) {
    activeEnginesByObject.delete(objectId);
    cellEditingByObject.delete(objectId);
  } else {
    activeEnginesByObject.set(objectId, next);
  }
}

export function getActiveSheetEngineCount(objectId?: string): number {
  if (objectId) return activeEnginesByObject.get(objectId) ?? 0;
  let total = 0;
  for (const n of activeEnginesByObject.values()) total += n;
  return total;
}

export function setSheetCellEditing(objectId: string, editing: boolean): void {
  if (!objectId) return;
  if (editing) cellEditingByObject.set(objectId, true);
  else cellEditingByObject.delete(objectId);
}

export function isSheetCellEditing(objectId?: string): boolean {
  if (objectId) return cellEditingByObject.get(objectId) === true;
  for (const v of cellEditingByObject.values()) {
    if (v) return true;
  }
  return false;
}

/** Snapshot for evidence harnesses. */
export function inspectSheetEngineLifecycle(): {
  activeByObject: Record<string, number>;
  editingObjectIds: string[];
} {
  const activeByObject: Record<string, number> = {};
  for (const [id, n] of activeEnginesByObject) activeByObject[id] = n;
  return {
    activeByObject,
    editingObjectIds: [...cellEditingByObject.keys()],
  };
}
