import type {
  MissionControlOpenAction,
  MissionControlShowInWorkspaceAction,
} from './types';

export type MissionControlActionDeps = {
  /**
   * Board-aware Free Space focus. Must use pending board switch when needed.
   * Floating presentation should be applied at the correct resolve point by the host.
   */
  focusFreeSpace: (objectId: string, boardId: string) => void;
  openExternalUrl: (url: string) => void;
  openShelfFile: (payload: { itemId: string; filePath: string }) => void | Promise<void>;
};

export type MissionControlExecutableAction =
  | MissionControlOpenAction
  | MissionControlShowInWorkspaceAction;

/**
 * Dispatch Phase 1 action descriptors. Host supplies side-effect deps.
 */
export function executeMissionControlAction(
  action: MissionControlExecutableAction,
  deps: MissionControlActionDeps,
): 'ok' | 'unavailable' {
  switch (action.type) {
    case 'freespace-focus':
      deps.focusFreeSpace(action.objectId, action.boardId);
      return 'ok';
    case 'external-url':
      deps.openExternalUrl(action.url);
      return 'ok';
    case 'shelf-file':
      void deps.openShelfFile({ itemId: action.itemId, filePath: action.filePath });
      return 'ok';
    case 'unavailable':
      return 'unavailable';
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return 'unavailable';
    }
  }
}

export function openMissionControlExternalUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  if (/^mailto:/i.test(trimmed)) {
    window.location.assign(trimmed);
    return;
  }
  window.open(trimmed, '_blank', 'noopener,noreferrer');
}
