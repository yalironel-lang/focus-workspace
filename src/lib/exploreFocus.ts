import type { WorkspaceNavigationState } from './workspaceUniverse/types';

/** Canonical title for the interactive onboarding workspace. */
export const EXPLORE_FOCUS_SECTION_TITLE = 'Explore Focus';

export const EXPLORE_FOCUS_TAGLINE = 'Spatial study OS';

export const EXPLORE_FOCUS_LIBRARY_SUBTEXT = 'See how spatial studying works · ~60 seconds';

/** World-space focal point for the curated scene. */
export const EXPLORE_FOCUS_SCENE_CENTER = { x: 640, y: 420 };

export function isExploreFocusWorkspace(
  sectionTitle: string | undefined,
  navState?: WorkspaceNavigationState | null,
): boolean {
  if (navState?.exploreFocus === true) return true;
  if (navState?.studyOsDemo === true) return true;
  return sectionTitle?.trim() === EXPLORE_FOCUS_SECTION_TITLE;
}

export function exploreFocusNavState(firstArrival?: boolean): WorkspaceNavigationState {
  return {
    exploreFocus: true,
    studyOsDemo: true,
    ...(firstArrival ? { firstArrival: true } : {}),
  };
}
