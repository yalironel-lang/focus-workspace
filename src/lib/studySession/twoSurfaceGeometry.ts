/**
 * Pure math and geometry helpers for two-surface split layouts.
 * Decoupled from any academic object types, persistence, or session concepts.
 */

export const DEFAULT_MIN_SURFACE_PX = 320;
export const DEFAULT_MIN_RATIO = 0.12;
export const DEFAULT_MAX_RATIO = 0.88;

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

export function clampRatioForWidth(
  ratio: number,
  containerWidthPx: number,
  minSurfaceAPx: number = DEFAULT_MIN_SURFACE_PX,
  minSurfaceBPx: number = DEFAULT_MIN_SURFACE_PX,
): number {
  if (!Number.isFinite(containerWidthPx) || containerWidthPx <= 0) {
    return clamp01(ratio);
  }
  const min = Math.max(minSurfaceAPx / containerWidthPx, DEFAULT_MIN_RATIO);
  const max = Math.min(1 - minSurfaceBPx / containerWidthPx, DEFAULT_MAX_RATIO);
  if (min > max) return 0.5;
  return Math.max(min, Math.min(max, ratio));
}

export function formatFlexBasis(ratio: number): string {
  const clamped = clamp01(ratio);
  return `${Math.round(clamped * 1000) / 10}%`;
}
