import type { GlobalTheme } from '../../hooks/useWorkspaceTheme';
import type { BackgroundPresetDefaults } from '../workspaceBackgroundStudio';
import {
  DEFAULT_COSMIC_LAYERS,
  type CosmicBackdropConfig,
  type CosmicLayerSettings,
  type ConstellationId,
} from './cosmicBackgroundTypes';
import { relativeLuminance } from './cosmicColorStudio';

export interface PresetCosmicProfile {
  layers: Partial<CosmicLayerSettings>;
  seed: number;
  starRgb?: [number, number, number];
  lineRgb?: [number, number, number];
  nebula?: { color: string; x: number; y: number };
  milkyWay?: { angle: number; opacity: number };
}

export function mergeCosmicSettings(
  global: GlobalTheme,
  presetCosmic?: Partial<CosmicLayerSettings>,
): CosmicLayerSettings {
  const g = global as GlobalTheme & Partial<CosmicLayerSettings>;
  return {
    starDensity: g.starDensity ?? presetCosmic?.starDensity ?? DEFAULT_COSMIC_LAYERS.starDensity,
    starBrightness: g.starBrightness ?? presetCosmic?.starBrightness ?? DEFAULT_COSMIC_LAYERS.starBrightness,
    starScale: g.starScale ?? presetCosmic?.starScale ?? DEFAULT_COSMIC_LAYERS.starScale,
    starTwinkle: g.starTwinkle ?? presetCosmic?.starTwinkle ?? DEFAULT_COSMIC_LAYERS.starTwinkle,
    constellationId: (g.constellationId ?? presetCosmic?.constellationId ?? 'none') as ConstellationId,
    constellationVisibility:
      g.constellationVisibility ?? presetCosmic?.constellationVisibility ?? DEFAULT_COSMIC_LAYERS.constellationVisibility,
    constellationStyle: g.constellationStyle ?? presetCosmic?.constellationStyle ?? DEFAULT_COSMIC_LAYERS.constellationStyle,
    constellationLineOpacity:
      g.constellationLineOpacity ?? presetCosmic?.constellationLineOpacity ?? DEFAULT_COSMIC_LAYERS.constellationLineOpacity,
    constellationStarScale:
      g.constellationStarScale ?? presetCosmic?.constellationStarScale ?? DEFAULT_COSMIC_LAYERS.constellationStarScale,
    constellationLabels:
      g.constellationLabels ?? presetCosmic?.constellationLabels ?? DEFAULT_COSMIC_LAYERS.constellationLabels,
    nebulaIntensity: g.nebulaIntensity ?? presetCosmic?.nebulaIntensity ?? DEFAULT_COSMIC_LAYERS.nebulaIntensity,
    milkyWayIntensity: g.milkyWayIntensity ?? presetCosmic?.milkyWayIntensity ?? DEFAULT_COSMIC_LAYERS.milkyWayIntensity,
    grainAmount: g.grainAmount ?? presetCosmic?.grainAmount ?? DEFAULT_COSMIC_LAYERS.grainAmount,
    vignetteStrength: g.vignetteStrength ?? presetCosmic?.vignetteStrength ?? DEFAULT_COSMIC_LAYERS.vignetteStrength,
  };
}

export function resolveCosmicBackdrop(
  global: GlobalTheme,
  surface: BackgroundPresetDefaults,
  profile: PresetCosmicProfile | undefined,
  presetSeed: number,
): CosmicBackdropConfig {
  const layers = mergeCosmicSettings(global, profile?.layers);
  const isLight = relativeLuminance(surface.canvasBase) > 0.42;
  const seed = profile?.seed ?? presetSeed;

  const starRgb: [number, number, number] =
    profile?.starRgb ?? (isLight ? [60, 70, 90] : [220, 230, 255]);
  const lineRgb: [number, number, number] =
    profile?.lineRgb ?? (isLight ? [80, 90, 120] : [180, 200, 255]);

  let nebulaCss: string | undefined;
  if (layers.nebulaIntensity > 0.02 && profile?.nebula) {
    const o = layers.nebulaIntensity * 0.55;
    nebulaCss = `radial-gradient(ellipse 70% 55% at ${profile.nebula.x}% ${profile.nebula.y}%, ${profile.nebula.color} 0%, transparent 68%)`;
    nebulaCss = nebulaCss.replace(profile.nebula.color, profile.nebula.color.replace(/[\d.]+\)$/, `${o})`));
  }

  let milkyWayCss: string | undefined;
  if (layers.milkyWayIntensity > 0.02) {
    const o = layers.milkyWayIntensity * (isLight ? 0.12 : 0.22);
    const angle = profile?.milkyWay?.angle ?? 35;
    milkyWayCss = `linear-gradient(${angle}deg, transparent 0%, rgba(255,255,255,${o}) 48%, transparent 72%)`;
  }

  const vignette = layers.vignetteStrength * (isLight ? 0.35 : 0.65);
  const depthGlowCss =
    vignette > 0.02
      ? `radial-gradient(ellipse at 50% 45%, transparent 35%, ${isLight ? `rgba(0,0,0,${vignette * 0.08})` : `rgba(0,0,0,${vignette * 0.55})`} 100%)`
      : undefined;

  return {
    ...layers,
    seed,
    isLight,
    starRgb,
    lineRgb,
    nebulaCss,
    milkyWayCss,
    depthGlowCss,
  };
}
