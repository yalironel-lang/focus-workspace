import type { ProjectSpaceObject } from '../hooks/useSectionFreeSpaceObjects';

/** Missing lifecycle metadata is the legacy active state. */
export function isObjectActive(object: ProjectSpaceObject): boolean {
  return object.lifecycleState !== 'closed';
}

/** Close retains the canonical object, assets, geometry and connections. */
export async function closeNotebook(
  objectId: string,
  deps: {
    flush: (id: string) => Promise<boolean>;
    update: (id: string, fields: { lifecycleState: 'closed' }) => void;
  },
): Promise<void> {
  if (!await deps.flush(objectId)) throw new Error('Notebook save failed');
  deps.update(objectId, { lifecycleState: 'closed' });
}

export function notebookTitle(title: string): string {
  return title.trim() || 'Notebook';
}

export function reopenNotebook(
  object: ProjectSpaceObject,
  update: (id: string, fields: { lifecycleState: 'active' }) => void,
): boolean {
  if (object.type !== 'notebook' || isObjectActive(object)) return false;
  update(object.id, { lifecycleState: 'active' });
  return true;
}
