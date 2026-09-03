/**
 * Unified Mission Control Everything index derivation (pure).
 */

import type { GroupWithItems, CourseLink } from '../../types';
import type { FreeSpaceIndexEntry } from './loadSectionFreeSpaceIndexSource';
import { projectCourseLinks } from './projectCourseLinks';
import { projectFreeSpaceEntries } from './projectFreeSpace';
import { projectShelfGroups } from './projectShelfItems';
import type {
  MissionControlIndexCompleteness,
  MissionControlItem,
} from './types';

export type DeriveMissionControlIndexInput = {
  sectionId: string;
  freeSpaceEntries: readonly FreeSpaceIndexEntry[];
  groups?: readonly GroupWithItems[];
  courseLinks?: readonly CourseLink[];
  completeness: MissionControlIndexCompleteness;
};

export type DeriveMissionControlIndexResult = {
  items: MissionControlItem[];
  completeness: MissionControlIndexCompleteness;
};

function sortKey(item: MissionControlItem): number {
  return item.updatedAt ?? item.createdAt ?? 0;
}

/** Concatenate projections — no cross-family dedupe. Stable sort by updated/created desc. */
export function deriveMissionControlIndex(
  input: DeriveMissionControlIndexInput,
): DeriveMissionControlIndexResult {
  const items: MissionControlItem[] = [
    ...projectFreeSpaceEntries(input.sectionId, input.freeSpaceEntries),
    ...projectShelfGroups(input.sectionId, input.groups ?? []),
    ...projectCourseLinks(input.sectionId, input.courseLinks ?? []),
  ];

  items.sort((a, b) => {
    const d = sortKey(b) - sortKey(a);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });

  return { items, completeness: input.completeness };
}
