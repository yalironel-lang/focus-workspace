/** Transform-based parallax offsets for cosmic backdrop layers. */

export type ParallaxLayer = 'nebula' | 'far' | 'mid' | 'near' | 'constellation' | 'grain';

const FACTORS: Record<ParallaxLayer, number> = {
  nebula: 0.005,
  far: 0.012,
  mid: 0.022,
  near: 0.034,
  constellation: 0.028,
  grain: 0.018,
};

export function cosmicParallaxTransform(
  panX: number,
  panY: number,
  zoom: number,
  layer: ParallaxLayer,
  reducedMotion: boolean,
): string {
  if (reducedMotion) return 'translate3d(0,0,0)';
  const z = Math.max(0.3, Math.min(2.5, zoom));
  const f = FACTORS[layer] / z;
  const x = panX * f;
  const y = panY * f;
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
}

export function usePrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
