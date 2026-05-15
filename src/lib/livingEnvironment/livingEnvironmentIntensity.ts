/** Maps UI slider (0.35–1) to visual presence (study-safe curve). */

export type EnvironmentStrengthTier = 'low' | 'medium' | 'high';

export const ENV_INTENSITY_LOW = 0.38;
export const ENV_INTENSITY_MEDIUM = 0.72;
export const ENV_INTENSITY_HIGH = 0.96;

export function mapEnvironmentIntensity(slider: number): number {
  const s = Math.max(0.35, Math.min(1, slider));
  const t = (s - 0.35) / 0.65;
  // Ease: low stays subtle; high opens up without blowing past readability
  return 0.26 + Math.pow(t, 0.82) * 0.68;
}

export function environmentStrengthTier(slider: number): EnvironmentStrengthTier {
  if (slider < 0.52) return 'low';
  if (slider < 0.84) return 'medium';
  return 'high';
}

export function environmentStrengthLabel(slider: number): string {
  const tier = environmentStrengthTier(slider);
  if (tier === 'low') return 'Subtle · study-safe';
  if (tier === 'medium') return 'Cinematic · calm';
  return 'Immersive';
}
