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

export function focusCanvasAtmosphere(mode: FocusMode | null): FocusCanvasAtmosphere {
  const base: FocusCanvasAtmosphere = {
    transition: FOCUS_PRESENTATION_TRANSITION,
    vignetteInnerPct: 44,
    vignetteEdgeAlpha: '72',
    edgeFadeOpacity: 0.78,
    insetShadow: 'inset 0 0 68px rgba(7,11,20,0.24)',
    dotGridAccentAlpha: '12',
    minimapOpacityMul: 1,
    minimapScale: 1,
    spatialAmbientOpacity: 1,
    connectionLineMul: 1,
  };

  if (!mode) return base;

  switch (mode) {
    case 'reading':
      return {
        ...base,
        vignetteInnerPct: 40,
        vignetteEdgeAlpha: '76',
        edgeFadeOpacity: 0.72,
        insetShadow: 'inset 0 0 74px rgba(7,11,20,0.26)',
        dotGridAccentAlpha: '0f',
        minimapOpacityMul: 0.82,
        minimapScale: 0.98,
        spatialAmbientOpacity: 0.95,
        connectionLineMul: 0.94,
      };
    case 'solving':
      return {
        ...base,
        vignetteInnerPct: 46,
        vignetteEdgeAlpha: '70',
        edgeFadeOpacity: 0.74,
        insetShadow: 'inset 0 0 70px rgba(7,11,20,0.24)',
        dotGridAccentAlpha: '12',
        minimapOpacityMul: 0.94,
        minimapScale: 1,
        spatialAmbientOpacity: 0.98,
        connectionLineMul: 1,
      };
    case 'thinking':
      return {
        ...base,
        vignetteInnerPct: 50,
        vignetteEdgeAlpha: '64',
        edgeFadeOpacity: 0.8,
        insetShadow: 'inset 0 0 62px rgba(7,11,20,0.2)',
        dotGridAccentAlpha: '14',
        minimapOpacityMul: 1.02,
        minimapScale: 1.04,
        spatialAmbientOpacity: 1.04,
        connectionLineMul: 1.14,
      };
    case 'review':
    default:
      return {
        ...base,
        vignetteInnerPct: 42,
        vignetteEdgeAlpha: '74',
        edgeFadeOpacity: 0.76,
        insetShadow: 'inset 0 0 72px rgba(7,11,20,0.25)',
        dotGridAccentAlpha: '10',
        minimapOpacityMul: 0.96,
        minimapScale: 1,
        spatialAmbientOpacity: 0.98,
        connectionLineMul: 1.08,
      };
  }
}
