import type { BackgroundPresetId } from '../workspaceBackgroundStudio';
import type { LivingWorldVisualAssets } from './livingEnvironmentTypes';

const ENV_ROOT = '/environments';

function scene(
  id: string,
  partial: Omit<LivingWorldVisualAssets, 'baseImage'> & { baseImage?: string },
): LivingWorldVisualAssets {
  return {
    baseImage: partial.baseImage ?? `${ENV_ROOT}/${id}/base.jpg`,
    ...partial,
  };
}

/**
 * Cinematic scene definitions for featured living worlds.
 * Replace JPG placeholders under public/environments/{id}/ with production art.
 */
export const LIVING_WORLD_VISUALS: Partial<Record<BackgroundPresetId, LivingWorldVisualAssets>> = {
  'deep-graphite': scene('deep-graphite', {
    atmosphereOverlays: ['light-shafts', 'haze', 'vignette', 'grain'],
    parallaxDepth: { base: 0.35, mid: 0.65, foreground: 1 },
    tuning: { brightness: 0.92, contrast: 1.08, saturation: 0.85 },
    readability: { vignetteStrength: 0.42, edgeDarken: 0.28, centerLift: 0.06 },
    fallbackBase: `
      radial-gradient(ellipse 90% 70% at 22% 8%, rgba(210,220,235,0.14) 0%, transparent 52%),
      linear-gradient(155deg, #12151c 0%, #0a0c10 45%, #06080c 100%)
    `,
    fallbackMid: `linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.04) 50%, transparent 65%)`,
  }),
  'warm-studio': scene('warm-studio', {
    atmosphereOverlays: ['light-shafts', 'dust', 'haze', 'vignette'],
    parallaxDepth: { base: 0.4, mid: 0.72, foreground: 1.05 },
    tuning: { brightness: 0.94, contrast: 1.05, saturation: 1.1 },
    readability: { vignetteStrength: 0.48, edgeDarken: 0.32, centerLift: 0.08 },
    fallbackBase: `
      radial-gradient(ellipse 70% 55% at 18% 22%, rgba(253,224,140,0.35) 0%, transparent 58%),
      radial-gradient(ellipse 60% 50% at 85% 80%, rgba(120,80,40,0.12) 0%, transparent 55%),
      linear-gradient(180deg, #1a1410 0%, #0e0a08 100%)
    `,
    fallbackMid: `radial-gradient(ellipse 45% 35% at 20% 28%, rgba(251,191,36,0.2) 0%, transparent 70%)`,
    fallbackForeground: `linear-gradient(0deg, rgba(8,6,4,0.75) 0%, transparent 42%)`,
  }),
  'cosmic-drift': scene('cosmic-drift', {
    atmosphereOverlays: ['haze', 'vignette', 'grain'],
    parallaxDepth: { base: 0.3, mid: 0.55, foreground: 0.85 },
    tuning: { brightness: 0.9, contrast: 1.12, saturation: 1.15 },
    readability: { vignetteStrength: 0.38, edgeDarken: 0.22, centerLift: 0.05 },
    fallbackBase: `
      radial-gradient(ellipse 80% 60% at 30% 25%, rgba(129,140,248,0.45) 0%, transparent 58%),
      radial-gradient(ellipse 55% 45% at 78% 68%, rgba(79,70,229,0.28) 0%, transparent 52%),
      radial-gradient(ellipse 35% 30% at 72% 58%, rgba(55,65,95,0.5) 0%, transparent 70%),
      linear-gradient(180deg, #060a14 0%, #0a0e1a 100%)
    `,
    fallbackMid: `linear-gradient(125deg, transparent 25%, rgba(165,180,252,0.08) 50%, transparent 75%)`,
  }),
  'ocean-depths': scene('ocean-depths', {
    atmosphereOverlays: ['caustics', 'fog', 'vignette'],
    parallaxDepth: { base: 0.38, mid: 0.7, foreground: 1.1 },
    tuning: { brightness: 0.88, contrast: 1.1, saturation: 1.12 },
    readability: { vignetteStrength: 0.45, edgeDarken: 0.3, centerLift: 0.06 },
    fallbackBase: `
      radial-gradient(ellipse 90% 45% at 50% 0%, rgba(186,230,253,0.28) 0%, transparent 55%),
      linear-gradient(180deg, rgba(56,189,248,0.12) 0%, #062838 38%, #020a10 100%)
    `,
    fallbackMid: `
      radial-gradient(ellipse 40% 18% at 32% 52%, rgba(125,211,252,0.12) 0%, transparent 70%),
      radial-gradient(ellipse 35% 16% at 72% 46%, rgba(56,189,248,0.1) 0%, transparent 68%)
    `,
    fallbackForeground: `linear-gradient(0deg, rgba(2,8,14,0.72) 0%, transparent 48%)`,
  }),
  'ancient-forest': scene('ancient-forest', {
    atmosphereOverlays: ['fog', 'light-shafts', 'vignette', 'dust'],
    parallaxDepth: { base: 0.42, mid: 0.78, foreground: 1.15 },
    tuning: { brightness: 0.9, contrast: 1.06, saturation: 1.05 },
    readability: { vignetteStrength: 0.5, edgeDarken: 0.34, centerLift: 0.07 },
    fallbackBase: `
      radial-gradient(ellipse 75% 55% at 52% 12%, rgba(220,245,230,0.22) 0%, transparent 58%),
      linear-gradient(180deg, #1a2820 0%, #0a140e 55%, #060e0a 100%)
    `,
    fallbackMid: `linear-gradient(0deg, rgba(34,94,62,0.25) 0%, transparent 45%)`,
    fallbackForeground: `
      linear-gradient(90deg, rgba(4,12,8,0.85) 0%, transparent 12%, transparent 88%, rgba(4,12,8,0.85) 100%),
      linear-gradient(0deg, rgba(20,50,35,0.35) 0%, transparent 50%)
    `,
  }),
  'dinosaur-realm': scene('dinosaur-realm', {
    atmosphereOverlays: ['fog', 'haze', 'vignette'],
    parallaxDepth: { base: 0.45, mid: 0.82, foreground: 1.12 },
    tuning: { brightness: 0.86, contrast: 1.1, saturation: 0.95 },
    readability: { vignetteStrength: 0.48, edgeDarken: 0.32, centerLift: 0.05 },
    fallbackBase: `
      radial-gradient(ellipse 65% 50% at 75% 88%, rgba(180,140,80,0.18) 0%, transparent 62%),
      linear-gradient(180deg, #1a1814 0%, #0c0a08 100%)
    `,
    fallbackMid: `radial-gradient(ellipse 50% 40% at 78% 85%, rgba(120,100,70,0.15) 0%, transparent 70%)`,
    fallbackForeground: `linear-gradient(0deg, rgba(6,4,2,0.78) 0%, transparent 40%)`,
  }),
};

export function getLivingWorldVisual(presetId: BackgroundPresetId): LivingWorldVisualAssets | undefined {
  return LIVING_WORLD_VISUALS[presetId];
}
