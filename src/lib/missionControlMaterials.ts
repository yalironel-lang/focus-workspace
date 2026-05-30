/**
 * Shared material tokens for Mission Control / library entry surfaces.
 */

export type WorkspacePresence = 'present' | 'warm' | 'fading';

export function presenceFromOpenedAt(openedAt?: string): WorkspacePresence {
  if (!openedAt) return 'fading';
  const ms = Date.now() - new Date(openedAt).getTime();
  if (ms < 24 * 3_600_000) return 'present';
  if (ms < 7 * 86_400_000) return 'warm';
  return 'fading';
}

export function relativeTimeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export const MC_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export interface McSpatialStyleInput {
  accent: string;
  parallaxFar?: { x: number; y: number };
  parallaxMid?: { x: number; y: number };
  lightX?: string;
  lightY?: string;
  engagement?: number;
}

/** CSS custom properties for spatial environment layers */
export function mcEnvironmentStyle(input: McSpatialStyleInput | string, legacyParallax?: { x: number; y: number }): Record<string, string> {
  const opts: McSpatialStyleInput =
    typeof input === 'string'
      ? { accent: input, parallaxFar: legacyParallax }
      : input;
  const far = opts.parallaxFar ?? { x: 0, y: 0 };
  const mid = opts.parallaxMid ?? far;
  return {
    '--mc-accent': opts.accent,
    '--mc-accent-glow': `${opts.accent}18`,
    '--mc-monument-light': `${opts.accent}14`,
    '--mc-void': '#03060e',
    '--mc-horizon-y': '62%',
    '--mc-parallax-far-x': `${far.x}px`,
    '--mc-parallax-far-y': `${far.y}px`,
    '--mc-parallax-mid-x': `${mid.x}px`,
    '--mc-parallax-mid-y': `${mid.y}px`,
    '--mc-light-x': opts.lightX ?? '48%',
    '--mc-light-y': opts.lightY ?? '38%',
    '--mc-key-x': '34%',
    '--mc-key-y': '30%',
    '--mc-engagement': String(opts.engagement ?? 0.35),
  };
}
