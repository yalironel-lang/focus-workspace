import type { ProjectObjectType } from '../../hooks/useSectionFreeSpaceObjects';
import type { WorkspacePresentationProfile } from '../workspacePresentationProfile';
import { supportsMissionControlDirectPresent } from './supportsMissionControlDirectPresent';
import type { MissionControlOpenAction } from './types';

/**
 * Navigation-boundary rewrite: phone Open for supported Free Space objects
 * becomes direct-present. Desktop/tablet keep freespace-focus.
 */
export function resolveMissionControlOpenForProfile(
  action: MissionControlOpenAction,
  profile: WorkspacePresentationProfile,
  objectType: ProjectObjectType | null | undefined,
): MissionControlOpenAction {
  if (profile !== 'phone') return action;
  if (action.type !== 'freespace-focus') return action;
  if (!objectType || !supportsMissionControlDirectPresent(objectType)) return action;
  return {
    type: 'direct-present',
    objectId: action.objectId,
    boardId: action.boardId,
  };
}
