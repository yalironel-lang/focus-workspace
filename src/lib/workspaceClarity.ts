import type { GlobalTheme } from '../hooks/useWorkspaceTheme';

export type FocusStrength = 'soft' | 'balanced' | 'guided';

/** Runtime multipliers derived from appearance prefs — no heavy filters. */
export interface WorkspaceClarity {
  fogMul: number;
  ambientMul: number;
  focusDimScale: number;
  focusVignetteMul: number;
  cardAlphaHex: string;
  glowCap: number;
  gridMul: number;
  spatialContrast: number;
}

const FOCUS_DIM: Record<FocusStrength, number> = {
  soft: 0.42,
  balanced: 0.72,
  guided: 1,
};

export function resolveWorkspaceClarity(global: GlobalTheme): WorkspaceClarity {
  const fogLevel = global.fogLevel ?? 0.26;
  const ambient = global.ambientIntensity ?? 0.38;
  const solid = global.cardSolidity ?? 0.9;
  const focus = global.focusStrength ?? 'soft';
  const contrast = global.spatialContrast ?? 0.72;

  const fogMul = 0.38 + fogLevel * 0.62;
  const ambientMul = 0.55 + ambient * 0.65;
  const cardAlphaHex =
    solid >= 0.92 ? 'ff' : solid >= 0.78 ? 'fa' : solid >= 0.62 ? 'f5' : 'ee';

  return {
    fogMul,
    ambientMul,
    focusDimScale: FOCUS_DIM[focus],
    focusVignetteMul: 0.5 + fogMul * 0.5,
    cardAlphaHex,
    glowCap: 0.35 + contrast * 0.5,
    gridMul: 0.65 + contrast * 0.45,
    spatialContrast: contrast,
  };
}

/** Blend focus-tier opacity toward 1 when strength is soft. */
export function scaleFocusOpacity(baseMul: number, focusDimScale: number): number {
  if (focusDimScale >= 1) return baseMul;
  return 1 - (1 - baseMul) * focusDimScale;
}

/** Lower hex vignette edge alpha (less edge crush). */
export function scaleVignetteEdgeAlpha(hexAlpha: string, focusVignetteMul: number): string {
  const n = parseInt(hexAlpha, 16);
  if (Number.isNaN(n)) return hexAlpha;
  const scaled = Math.round(n * focusVignetteMul);
  return Math.min(255, Math.max(32, scaled)).toString(16).padStart(2, '0');
}
