import type {
  MissionControlOpenAction,
  MissionControlShowInWorkspaceAction,
} from './types';

/** Structural equality for Phase 1 action descriptors (presentation only). */
export function missionControlActionsEqual(
  a: MissionControlOpenAction,
  b: MissionControlShowInWorkspaceAction | MissionControlOpenAction,
): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'freespace-focus' && b.type === 'freespace-focus') {
    return a.objectId === b.objectId && a.boardId === b.boardId;
  }
  if (a.type === 'external-url' && b.type === 'external-url') {
    return a.url === b.url;
  }
  if (a.type === 'shelf-file' && b.type === 'shelf-file') {
    return a.itemId === b.itemId && a.filePath === b.filePath;
  }
  if (a.type === 'unavailable' && b.type === 'unavailable') return true;
  return false;
}
