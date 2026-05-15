export type ConstellationStyle = 'minimal' | 'scientific' | 'mythological' | 'ambient';

export type ConstellationId =
  | 'none'
  | 'orion'
  | 'ursa-major'
  | 'cassiopeia'
  | 'scorpius'
  | 'cygnus'
  | 'draco'
  | 'lyra'
  | 'pegasus'
  | 'sagittarius'
  | 'pisces'
  | 'aquarius'
  | 'leo'
  | 'gemini'
  | 'virgo'
  | 'libra'
  | 'taurus'
  | 'aries'
  | 'cancer'
  | 'scorpio'
  | 'capricorn';

export interface CosmicLayerSettings {
  starDensity: number;
  starBrightness: number;
  starScale: number;
  starTwinkle: number;
  constellationId: ConstellationId;
  constellationVisibility: number;
  constellationStyle: ConstellationStyle;
  constellationLineOpacity: number;
  constellationStarScale: number;
  constellationLabels: boolean;
  nebulaIntensity: number;
  milkyWayIntensity: number;
  grainAmount: number;
  vignetteStrength: number;
}

export interface CosmicBackdropConfig extends CosmicLayerSettings {
  seed: number;
  isLight: boolean;
  starRgb: [number, number, number];
  lineRgb: [number, number, number];
  nebulaCss?: string;
  milkyWayCss?: string;
  depthGlowCss?: string;
}

export const DEFAULT_COSMIC_LAYERS: CosmicLayerSettings = {
  starDensity: 0.35,
  starBrightness: 0.55,
  starScale: 1,
  starTwinkle: 0.15,
  constellationId: 'none',
  constellationVisibility: 0,
  constellationStyle: 'minimal',
  constellationLineOpacity: 0.35,
  constellationStarScale: 1,
  constellationLabels: false,
  nebulaIntensity: 0,
  milkyWayIntensity: 0,
  grainAmount: 0.04,
  vignetteStrength: 0.35,
};
