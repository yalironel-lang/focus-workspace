import type { MissionControlItem } from './types';
import { missionControlActionsEqual } from './missionControlActionsEqual';

/**
 * Presentation rule: offer Show in Workspace only when it differs from Open.
 * Does not mutate Phase 1 capability descriptors.
 */
export function shouldOfferShowInWorkspace(item: MissionControlItem): boolean {
  if (!item.capabilities.showInWorkspace) return false;
  if (item.showInWorkspaceAction.type === 'unavailable') return false;
  return !missionControlActionsEqual(item.openAction, item.showInWorkspaceAction);
}
