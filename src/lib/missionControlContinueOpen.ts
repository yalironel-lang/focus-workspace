/**
 * Mission Control Continue open sequence.
 *
 * Continue must land on the spatial Workspace object — never restore a
 * persisted Universal Object View (fullscreen/split). Callers must invoke
 * presentation → floating before spatial focus.
 */

export type MissionControlContinuePresentationMode = 'floating' | 'split' | 'fullscreen';

export type MissionControlContinueOpenDeps = {
  setPresentationMode: (
    objectId: string,
    mode: MissionControlContinuePresentationMode,
  ) => void;
  spatialFocus: (objectId: string) => void;
};

/**
 * Ordered Continue open: force floating, then spatial focus.
 * Does not request fullscreen or split.
 */
export function runMissionControlContinueOpen(
  objectId: string,
  deps: MissionControlContinueOpenDeps,
): void {
  deps.setPresentationMode(objectId, 'floating');
  deps.spatialFocus(objectId);
}
