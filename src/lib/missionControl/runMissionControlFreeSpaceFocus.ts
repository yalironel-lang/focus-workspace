/**
 * Mission Control Free Space open — board-aware focus + floating after resolve.
 * Does not rewrite focusNotebookOnCanvas; host injects existing board pending path.
 */

export type MissionControlFreeSpaceFocusDeps = {
  activeBoardId: string;
  /** Same contract as registerFreeSpace.focusNotebook */
  focusNotebook: (objectId: string, boardId?: string) => void;
  /**
   * Mark objectId so the host applies floating when focusNotebookOnCanvas
   * (or the pending effect) actually runs after the object exists.
   */
  queueFloatingPresentation: (objectId: string) => void;
  /** Same-board path: force floating immediately before spatial focus. */
  setPresentationModeFloating: (objectId: string) => void;
};

export type MissionControlFreeSpaceFocusResult = 'focused' | 'pending-board-switch';

export function runMissionControlFreeSpaceFocus(
  target: { objectId: string; boardId: string },
  deps: MissionControlFreeSpaceFocusDeps,
): MissionControlFreeSpaceFocusResult {
  const { objectId, boardId } = target;
  deps.queueFloatingPresentation(objectId);

  if (boardId && boardId !== deps.activeBoardId) {
    deps.focusNotebook(objectId, boardId);
    return 'pending-board-switch';
  }

  deps.setPresentationModeFloating(objectId);
  deps.focusNotebook(objectId, boardId);
  return 'focused';
}
