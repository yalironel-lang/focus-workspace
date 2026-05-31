/**
 * Routes re-entry to the correct math/writing surface based on last activity.
 */

import type { SectionViewMode } from './sectionViewMode';
import { loadSectionViewModeRecord, normalizeSectionViewMode } from './sectionViewMode';
import { loadMathZoneLastWriteAt } from './mathZoneActivity';
import { loadFreeSpaceLastWriteAt } from './notebookPose';
import { isMathZoneDestinationEnabled } from './mathZoneDestinationConfig';

export type MathThreadSurface = 'free-space' | 'math-zone';

export interface MathSurfaceRouterResult {
  preferredViewMode: SectionViewMode;
  threadSurface: MathThreadSurface;
  /** Unified label — avoids duplicate "Notebook" naming. */
  threadLabel: string;
  freeSpaceLastWriteAt: number | null;
  mathZoneLastWriteAt: number | null;
}

const MATH_ZONE_LABEL = '∑ Math studio';
const FREE_SPACE_MATH_LABEL = 'Math notebooks';

export function resolveMathSurfaceRouter(sectionId: string): MathSurfaceRouterResult {
  const viewRec = loadSectionViewModeRecord(sectionId);
  const mathZoneAt = loadMathZoneLastWriteAt(sectionId);
  const freeSpaceAt = loadFreeSpaceLastWriteAt(sectionId);

  const destinationEnabled = isMathZoneDestinationEnabled();
  const preferMathZone =
    destinationEnabled &&
    mathZoneAt != null &&
    (freeSpaceAt == null || mathZoneAt >= freeSpaceAt);

  const preferredViewMode: SectionViewMode = normalizeSectionViewMode(
    preferMathZone
      ? 'math-zone'
      : viewRec?.mode === 'work-surface'
        ? 'work-surface'
        : 'free-space',
  );

  const threadSurface: MathThreadSurface = preferMathZone ? 'math-zone' : 'free-space';
  const threadLabel = preferMathZone ? MATH_ZONE_LABEL : FREE_SPACE_MATH_LABEL;

  return {
    preferredViewMode,
    threadSurface,
    threadLabel,
    freeSpaceLastWriteAt: freeSpaceAt,
    mathZoneLastWriteAt: mathZoneAt,
  };
}

/** Pick view mode on section open when not first arrival. */
export function resolveSectionViewModeOnOpen(
  sectionId: string,
  options?: { forceFreeSpace?: boolean },
): SectionViewMode {
  if (options?.forceFreeSpace) return 'free-space';
  const router = resolveMathSurfaceRouter(sectionId);
  const rec = loadSectionViewModeRecord(sectionId);
  if (!rec) return router.preferredViewMode;

  // Honor explicit work-surface unless math zone was written more recently.
  if (rec.mode === 'work-surface' && router.threadSurface !== 'math-zone') {
    return 'work-surface';
  }

  return normalizeSectionViewMode(router.preferredViewMode);
}
