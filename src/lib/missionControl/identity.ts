/**
 * Prefixed Mission Control identities — stable React keys / future Collection targets.
 */

import type { MissionControlSource } from './types';

const PREFIX: Record<MissionControlSource, string> = {
  freespace: 'freespace:',
  'shelf-item': 'shelf-item:',
  'course-link': 'course-link:',
};

export function missionControlItemId(
  source: MissionControlSource,
  sourceId: string,
): string {
  return `${PREFIX[source]}${sourceId}`;
}

export function parseMissionControlItemId(
  id: string,
): { source: MissionControlSource; sourceId: string } | null {
  if (typeof id !== 'string' || !id) return null;
  for (const source of Object.keys(PREFIX) as MissionControlSource[]) {
    const p = PREFIX[source];
    if (id.startsWith(p)) {
      const sourceId = id.slice(p.length);
      if (!sourceId) return null;
      return { source, sourceId };
    }
  }
  return null;
}
