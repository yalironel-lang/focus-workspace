import { relativeTime } from '../deriveMissionControlSections';

/**
 * Truthful Mission Control time label.
 * Prefer real lastOpenedAt; never label updatedAt as Opened.
 */
export function formatMissionControlTime(
  item: {
    lastOpenedAt: number | null;
    updatedAt: number | null;
    createdAt: number | null;
  },
  now = Date.now(),
): string | null {
  if (item.lastOpenedAt != null && item.lastOpenedAt > 0) {
    const age = relativeTime(now, item.lastOpenedAt);
    return age ? `Opened ${age}` : null;
  }
  if (item.updatedAt != null && item.updatedAt > 0) {
    const age = relativeTime(now, item.updatedAt);
    return age ? `Updated ${age}` : null;
  }
  if (item.createdAt != null && item.createdAt > 0) {
    const age = relativeTime(now, item.createdAt);
    return age ? `Created ${age}` : null;
  }
  return null;
}
