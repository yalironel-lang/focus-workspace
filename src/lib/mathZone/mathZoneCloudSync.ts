/**
 * Math Zone cloud sync — section-scoped via user_workspace_state.
 */

import { MATH_ZONE_STATE_ENTITY_ID } from '../focusCache/userWorkspaceStateTypes';
import { fetchWorkspaceState } from '../focusCache/userWorkspaceStateCloud';
import { scheduleWorkspaceStateCloudSync } from '../focusCache/userWorkspaceStateEnqueue';
import {
  applyMathZoneLocalSnapshot,
  mathLocalUpdatedAt,
  parseMathZoneCloudState,
  readMathZoneLocalSnapshot,
} from './mathZoneStorage';

export function notifyMathZoneMutation(
  userId: string | null | undefined,
  sectionId: string,
): void {
  if (!userId || !sectionId) return;
  const now = Date.now();
  const snapshot = readMathZoneLocalSnapshot(sectionId);
  snapshot.updatedAt = now;
  try {
    localStorage.setItem(`fw_math_state_meta_${sectionId}`, JSON.stringify({ updatedAt: now }));
  } catch {
    /* quota */
  }
  scheduleWorkspaceStateCloudSync({
    userId,
    workspaceId: sectionId,
    entityId: MATH_ZONE_STATE_ENTITY_ID,
    scope: 'math_zone',
    state: snapshot as unknown as Record<string, unknown>,
    updatedAt: now,
  });
}

export async function pullMathZoneFromCloud(
  userId: string,
  sectionId: string,
): Promise<{ applied: boolean; reason?: string }> {
  const localAt = mathLocalUpdatedAt(sectionId);
  const fetch = await fetchWorkspaceState({
    userId,
    scope: 'math_zone',
    workspaceId: sectionId,
  });
  if (!fetch.ok) return { applied: false, reason: fetch.reason };
  if (!fetch.row) return { applied: false, reason: 'no_cloud_row' };

  const cloudState = parseMathZoneCloudState(fetch.row.state);
  if (!cloudState) return { applied: false, reason: 'malformed_cloud' };

  const cloudAt = fetch.row.updated_at_ms;
  if (cloudAt <= localAt) return { applied: false, reason: 'local_newer_or_equal' };

  applyMathZoneLocalSnapshot(sectionId, { ...cloudState, updatedAt: cloudAt });
  return { applied: true };
}
