/**
 * Mission Control phone Open — board-aware fullscreen direct present.
 * Does not frame, pan, zoom, or force floating Free Space.
 */

export type MissionControlDirectPresentDeps = {
  activeBoardId: string;
  /** Switch board when needed; host resolves object then applies fullscreen. */
  requestBoardSwitch: (objectId: string, boardId: string) => void;
  /** Same-board: stay on Mission Control and open fullscreen. */
  presentFullscreenOnMissionControl: (objectId: string) => void;
};

export type MissionControlDirectPresentResult = 'presented' | 'pending-board-switch';

export function runMissionControlDirectPresent(
  target: { objectId: string; boardId: string },
  deps: MissionControlDirectPresentDeps,
): MissionControlDirectPresentResult {
  const { objectId, boardId } = target;

  if (boardId && boardId !== deps.activeBoardId) {
    deps.requestBoardSwitch(objectId, boardId);
    return 'pending-board-switch';
  }

  deps.presentFullscreenOnMissionControl(objectId);
  return 'presented';
}
