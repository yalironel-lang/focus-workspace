import type { BackgroundPresetId } from './workspaceBackgroundStudio';
import { backgroundPresetThemePatch } from './workspaceBackgroundStudio';
import type { GlobalTheme } from '../hooks/useWorkspaceTheme';

/**
 * Living-world / studio preset used for atmosphere card previews and default world pairing.
 */
export const ATMOSPHERE_PREVIEW_WORLD: Record<string, BackgroundPresetId> = {
  neural: 'warm-studio',
  'deep-focus': 'deep-graphite',
  'calm-night': 'ocean-depths',
  'exam-pressure': 'warm-studio',
  'minimal-zen': 'deep-graphite',
  creative: 'cosmic-drift',
  sage: 'ancient-forest',
};

export function getAtmospherePreviewPresetId(atmosphereId: string): BackgroundPresetId {
  return ATMOSPHERE_PREVIEW_WORLD[atmosphereId] ?? 'deep-graphite';
}

/** Apply atmosphere + paired living-world background (keeps panel in sync with workspace). */
export function atmosphereSelectionPatch(atmosphereId: string): Partial<GlobalTheme> {
  const presetId = getAtmospherePreviewPresetId(atmosphereId);
  return backgroundPresetThemePatch(presetId);
}
