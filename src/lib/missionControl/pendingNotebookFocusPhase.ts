import type { PendingNotebookFocus } from '../notebookSearchIndex';

export type PendingNotebookFocusPhase =
  | 'idle'
  | 'switch-board'
  | 'wait-object'
  | 'wait-position'
  | 'wait-floating'
  | 'ready-to-focus';

/**
 * Pure phase for cross-board notebook/PDF focus pending resolution.
 * Ready only when the *requested* objectId exists, has a spatial position
 * on the active board, and is floating on the canvas (not UOV fullscreen).
 */
export function pendingNotebookFocusPhase(input: {
  pending: PendingNotebookFocus | null;
  sectionId: string;
  activeBoardId: string;
  hasObject: (objectId: string) => boolean;
  hasPosition?: (objectId: string) => boolean;
  isFloatingOnCanvas?: (objectId: string) => boolean;
}): PendingNotebookFocusPhase {
  const { pending, sectionId, activeBoardId, hasObject } = input;
  if (!pending || pending.sectionId !== sectionId) return 'idle';
  if (pending.boardId !== activeBoardId) return 'switch-board';
  if (!hasObject(pending.objectId)) return 'wait-object';
  if (input.hasPosition && !input.hasPosition(pending.objectId)) return 'wait-position';
  if (input.isFloatingOnCanvas && !input.isFloatingOnCanvas(pending.objectId)) {
    return 'wait-floating';
  }
  return 'ready-to-focus';
}

/**
 * Cross-board pending focus must survive object-store hydration churn:
 * clear the pending ref only *inside* the deferred focus callback, after
 * re-validating the same objectId — never before scheduling the timeout.
 */
export function shouldClearPendingNotebookFocusBeforeTimeout(): boolean {
  return false;
}

export function shouldFocusPendingObjectId(args: {
  pendingObjectId: string;
  availableObjectIds: readonly string[];
}): string | null {
  const { pendingObjectId, availableObjectIds } = args;
  if (!availableObjectIds.includes(pendingObjectId)) return null;
  return pendingObjectId;
}
