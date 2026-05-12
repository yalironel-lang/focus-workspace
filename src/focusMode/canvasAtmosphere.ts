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
    vignetteInnerPct: 38,
    vignetteEdgeAlpha: '90',
    edgeFadeOpacity: 1,
    insetShadow: 'inset 0 0 80px rgba(7,11,20,0.5)',
    dotGridAccentAlpha: '0c',
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
        vignetteInnerPct: 32,
        vignetteEdgeAlpha: 'a4',
        edgeFadeOpacity: 0.92,
        insetShadow: 'inset 0 0 96px rgba(7,11,20,0.58)',
        dotGridAccentAlpha: '08',
        minimapOpacityMul: 0.55,
        minimapScale: 0.96,
        spatialAmbientOpacity: 0.88,
        connectionLineMul: 0.85,
      };
    case 'solving':
      return {
        ...base,
        vignetteInnerPct: 40,
        vignetteEdgeAlpha: '8a',
        edgeFadeOpacity: 0.96,
        insetShadow: 'inset 0 0 88px rgba(7,11,20,0.52)',
        dotGridAccentAlpha: '0e',
        minimapOpacityMul: 0.88,
        minimapScale: 1,
        spatialAmbientOpacity: 0.94,
        connectionLineMul: 0.95,
      };
    case 'thinking':
      return {
        ...base,
        vignetteInnerPct: 44,
        vignetteEdgeAlpha: '72',
        edgeFadeOpacity: 1,
        insetShadow: 'inset 0 0 72px rgba(7,11,20,0.42)',
        dotGridAccentAlpha: '10',
        minimapOpacityMul: 1,
        minimapScale: 1.04,
        spatialAmbientOpacity: 1.08,
        connectionLineMul: 1.12,
      };
    case 'review':
    default:
      return {
        ...base,
        vignetteInnerPct: 36,
        vignetteEdgeAlpha: '96',
        edgeFadeOpacity: 0.98,
        insetShadow: 'inset 0 0 84px rgba(7,11,20,0.54)',
        dotGridAccentAlpha: '0a',
        minimapOpacityMul: 0.92,
        minimapScale: 1,
        spatialAmbientOpacity: 0.96,
        connectionLineMul: 1.06,
      };
  }
}
