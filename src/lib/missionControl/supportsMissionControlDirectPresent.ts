import type { ProjectObjectType } from '../../hooks/useSectionFreeSpaceObjects';

/** Object types eligible for phone Mission Control → fullscreen direct present. */
const DIRECT_PRESENT_TYPES = new Set<ProjectObjectType>([
  'notebook',
  'pdf',
  'sheet',
  'note',
  'checklist',
  'image',
]);

export function supportsMissionControlDirectPresent(
  objectType: ProjectObjectType,
): boolean {
  return DIRECT_PRESENT_TYPES.has(objectType);
}

export function missionControlDirectPresentTypes(): readonly ProjectObjectType[] {
  return [...DIRECT_PRESENT_TYPES];
}
