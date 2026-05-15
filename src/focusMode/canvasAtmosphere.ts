import type { FocusStrength } from '../lib/workspaceClarity';
import { scaleVignetteEdgeAlpha } from '../lib/workspaceClarity';
import type { FocusMode } from './focusModeTypes';
import { FOCUS_PRESENTATION_TRANSITION } from './focusModeTypes';

export interface FocusCanvasAtmosphere {
  transition: string;
  /** Radial vignette: inner transparent ellipse radius (larger = wider calm center). */
  vignetteInnerPct: number;
  /** Page bg alpha at vignette edge (hex pair). */
  vignetteEdgeAlpha: string;
  edgeFadeOpacity: number;
  insetShadow: string;
  dotGridAccentAlpha: string;
  minimapOpacityMul: number;
  minimapScale: number;
  spatialAmbientOpacity: number;
  /** Multiplier for connection stroke emphasis (layer applies). */
  connectionLineMul: number;
}

function softenAtmosphere(atm: FocusCanvasAtmosphere, strength: FocusStrength, fogMul: number): FocusCanvasAtmosphere {
  const dim =
    strength === 'guided' ? 1 : strength === 'balanced' ? 0.72 : 0.48;
  const fog = Math.min(1, fogMul);
  return {
    ...atm,
    vignetteInnerPct: Math.min(58, atm.vignetteInnerPct + (1 - dim) * 6),
    vignetteEdgeAlpha: scaleVignetteEdgeAlpha(
      atm.vignetteEdgeAlpha,
      fog * (0.5 + dim * 0.5),
    ),
    edgeFadeOpacity: atm.edgeFadeOpacity * (0.42 + dim * 0.38) * fog,
    insetShadow: atm.insetShadow.replace(
      /rgba\(7,11,20,([\d.]+)\)/,
      (_, n) => `rgba(7,11,20,${(parseFloat(n) * (0.65 + dim * 0.25) * fog).toFixed(2)})`,
    ),
    spatialAmbientOpacity: 1 + (atm.spatialAmbientOpacity - 1) * dim,
    connectionLineMul: 1 + (atm.connectionLineMul - 1) * dim,
    minimapOpacityMul: 1 + (atm.minimapOpacityMul - 1) * dim,
  };
}

export function focusCanvasAtmosphere(
  mode: FocusMode | null,
  strength: FocusStrength = 'soft',
  fogMul = 0.55,
): FocusCanvasAtmosphere {
  const base: FocusCanvasAtmosphere = {
    transition: FOCUS_PRESENTATION_TRANSITION,
    vignetteInnerPct: 52,
    vignetteEdgeAlpha: '58',
    edgeFadeOpacity: 0.58,
    insetShadow: 'inset 0 0 64px rgba(7,11,20,0.16)',
    dotGridAccentAlpha: '16',
    minimapOpacityMul: 1,
    minimapScale: 1,
    spatialAmbientOpacity: 1.06,
    connectionLineMul: 1.06,
  };

  if (!mode) return softenAtmosphere(base, strength, fogMul);

  let tuned: FocusCanvasAtmosphere;
  switch (mode) {
    case 'reading':
      tuned = {
        ...base,
        vignetteInnerPct: 48,
        vignetteEdgeAlpha: '62',
        edgeFadeOpacity: 0.54,
        insetShadow: 'inset 0 0 68px rgba(7,11,20,0.17)',
        dotGridAccentAlpha: '14',
        minimapOpacityMul: 0.92,
        minimapScale: 0.99,
        spatialAmbientOpacity: 1.02,
        connectionLineMul: 1.02,
      };
      break;
    case 'solving':
      tuned = {
        ...base,
        vignetteInnerPct: 54,
        vignetteEdgeAlpha: '56',
        edgeFadeOpacity: 0.56,
        insetShadow: 'inset 0 0 66px rgba(7,11,20,0.16)',
        dotGridAccentAlpha: '16',
        minimapOpacityMul: 0.98,
        minimapScale: 1,
        spatialAmbientOpacity: 1.04,
        connectionLineMul: 1.06,
      };
      break;
    case 'thinking':
      tuned = {
        ...base,
        vignetteInnerPct: 56,
        vignetteEdgeAlpha: '52',
        edgeFadeOpacity: 0.6,
        insetShadow: 'inset 0 0 58px rgba(7,11,20,0.14)',
        dotGridAccentAlpha: '18',
        minimapOpacityMul: 1.04,
        minimapScale: 1.02,
        spatialAmbientOpacity: 1.1,
        connectionLineMul: 1.16,
      };
      break;
    case 'review':
    default:
      tuned = {
        ...base,
        vignetteInnerPct: 50,
        vignetteEdgeAlpha: '60',
        edgeFadeOpacity: 0.56,
        insetShadow: 'inset 0 0 66px rgba(7,11,20,0.17)',
        dotGridAccentAlpha: '14',
        minimapOpacityMul: 1,
        minimapScale: 1,
        spatialAmbientOpacity: 1.04,
        connectionLineMul: 1.1,
      };
  }
  return softenAtmosphere(tuned, strength, fogMul);
}
