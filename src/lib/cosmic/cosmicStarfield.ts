/** Deterministic starfield — no runtime randomness. */

export interface StarPoint {
  x: number;
  y: number;
  r: number;
  opacity: number;
  depth: 0 | 1 | 2;
  twinklePhase: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateStarfield(
  seed: number,
  density: number,
  brightness: number,
  scale: number,
): StarPoint[] {
  const rand = mulberry32(seed);
  const count = Math.round(24 + density * 96);
  const stars: StarPoint[] = [];

  for (let i = 0; i < count; i++) {
    const depth = (Math.floor(rand() * 3) as 0 | 1 | 2);
    const depthMul = depth === 0 ? 0.45 : depth === 1 ? 0.72 : 1;
    const r = (0.08 + rand() * 0.22) * scale * (depth === 2 ? 1.15 : 1);
    stars.push({
      x: rand() * 100,
      y: rand() * 100,
      r,
      opacity: Math.min(0.95, (0.15 + rand() * 0.55) * brightness * depthMul),
      depth,
      twinklePhase: rand() * 6.28,
    });
  }

  return stars;
}
