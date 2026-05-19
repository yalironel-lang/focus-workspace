import type { AtmosphereTokens } from '../hooks/useAtmosphere';
import type { GlobalTheme } from '../hooks/useWorkspaceTheme';
import { resolveBackgroundStudio } from './workspaceBackgroundStudio';

/** Home-screen environmental tint derived from the global living background preset. */
export interface LibraryHomeTone {
  shellBg: string;
  glow1: string;
  glow2: string;
  accent: string;
  /** 0…1 — scales atmospheric layer strength on the library */
  blend: number;
  presetId: string;
}

export function resolveLibraryHomeTone(
  global: GlobalTheme,
  atmTokens: AtmosphereTokens,
): LibraryHomeTone {
  const studio = resolveBackgroundStudio(global, atmTokens);
  const intensity = global.environmentIntensity ?? 0.72;
  const blend = Math.min(1, Math.max(0.32, intensity * 0.92));

  return {
    shellBg: libraryShellBackground(studio.canvasBase),
    glow1: studio.tokens.ambientGlow1,
    glow2: studio.tokens.ambientGlow2,
    accent: studio.tokens.accent,
    blend,
    presetId: studio.presetId,
  };
}

/** Deep library anchor tinted by the active environment canvas base. */
export function libraryShellBackground(canvasBase: string): string {
  if (typeof CSS !== 'undefined' && CSS.supports('color', 'color-mix(in srgb, red, blue)')) {
    return `color-mix(in srgb, ${canvasBase} 32%, #020407 68%)`;
  }
  return '#020407';
}
