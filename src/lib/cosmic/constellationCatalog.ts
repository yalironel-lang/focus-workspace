import type { ConstellationId, ConstellationStyle } from './cosmicBackgroundTypes';

export interface ConstellationStar {
  x: number;
  y: number;
  name?: string;
  mag?: number;
}

export interface ConstellationDef {
  id: ConstellationId;
  label: string;
  description: string;
  zodiac?: boolean;
  stars: ConstellationStar[];
  edges: [number, number][];
}

/** Normalized 0–100 sky coordinates (simplified, elegant layouts). */
export const CONSTELLATIONS: ConstellationDef[] = [
  {
    id: 'orion',
    label: 'Orion',
    description: 'The hunter — belt and bright shoulders.',
    stars: [
      { x: 28, y: 38, name: 'Betelgeuse', mag: 0.5 },
      { x: 72, y: 40, name: 'Bellatrix', mag: 1.6 },
      { x: 38, y: 52, name: 'Alnitak', mag: 1.7 },
      { x: 50, y: 54, name: 'Alnilam', mag: 1.7 },
      { x: 62, y: 52, name: 'Mintaka', mag: 2.2 },
      { x: 48, y: 68, name: 'Saiph', mag: 2.1 },
      { x: 52, y: 78, name: 'Rigel', mag: 0.1 },
    ],
    edges: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [5, 6]],
  },
  {
    id: 'ursa-major',
    label: 'Ursa Major',
    description: 'The great bear — the Big Dipper.',
    stars: [
      { x: 18, y: 28, mag: 2 },
      { x: 28, y: 24, mag: 2.4 },
      { x: 38, y: 26, mag: 1.8 },
      { x: 48, y: 32, mag: 2.1 },
      { x: 58, y: 30, mag: 1.9 },
      { x: 68, y: 34, mag: 2.2 },
      { x: 78, y: 38, mag: 1.7 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  {
    id: 'cassiopeia',
    label: 'Cassiopeia',
    description: 'W-shaped queen in the northern sky.',
    stars: [
      { x: 22, y: 32, mag: 2.2 },
      { x: 36, y: 26, mag: 2.3 },
      { x: 50, y: 34, mag: 2.5 },
      { x: 64, y: 24, mag: 2.2 },
      { x: 78, y: 30, mag: 2.4 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    id: 'scorpius',
    label: 'Scorpius',
    description: 'Curved tail toward Antares.',
    stars: [
      { x: 72, y: 58, name: 'Antares', mag: 1 },
      { x: 64, y: 52, mag: 2.6 },
      { x: 56, y: 48, mag: 2.3 },
      { x: 48, y: 50, mag: 2.5 },
      { x: 40, y: 56, mag: 2.8 },
      { x: 34, y: 64, mag: 2.9 },
      { x: 28, y: 74, mag: 3 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  {
    id: 'scorpio',
    label: 'Scorpio',
    description: 'Zodiac scorpion — same southern arc.',
    zodiac: true,
    stars: [
      { x: 72, y: 58, name: 'Antares', mag: 1 },
      { x: 64, y: 52, mag: 2.6 },
      { x: 56, y: 48, mag: 2.3 },
      { x: 48, y: 50, mag: 2.5 },
      { x: 40, y: 56, mag: 2.8 },
      { x: 34, y: 64, mag: 2.9 },
      { x: 28, y: 74, mag: 3 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  {
    id: 'cygnus',
    label: 'Cygnus',
    description: 'Northern cross — Deneb at the tail.',
    stars: [
      { x: 50, y: 22, name: 'Deneb', mag: 1.2 },
      { x: 50, y: 38, mag: 2.2 },
      { x: 50, y: 54, mag: 2.5 },
      { x: 34, y: 46, mag: 2.9 },
      { x: 66, y: 46, mag: 2.9 },
    ],
    edges: [[0, 1], [1, 2], [1, 3], [1, 4]],
  },
  {
    id: 'draco',
    label: 'Draco',
    description: 'Serpentine dragon winding between the bears.',
    stars: [
      { x: 42, y: 18, mag: 2.7 },
      { x: 52, y: 22, mag: 2.9 },
      { x: 62, y: 20, mag: 3 },
      { x: 68, y: 28, mag: 2.8 },
      { x: 64, y: 38, mag: 3.1 },
      { x: 54, y: 42, mag: 2.6 },
      { x: 44, y: 36, mag: 3 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]],
  },
  {
    id: 'lyra',
    label: 'Lyra',
    description: 'Small harp — Vega dominates.',
    stars: [
      { x: 48, y: 30, name: 'Vega', mag: 0 },
      { x: 40, y: 40, mag: 2.5 },
      { x: 56, y: 40, mag: 2.6 },
      { x: 44, y: 50, mag: 3.2 },
      { x: 52, y: 50, mag: 3.3 },
    ],
    edges: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4]],
  },
  {
    id: 'pegasus',
    label: 'Pegasus',
    description: 'Great square of autumn skies.',
    stars: [
      { x: 32, y: 32, mag: 2.4 },
      { x: 52, y: 28, mag: 2.5 },
      { x: 56, y: 48, mag: 2.3 },
      { x: 36, y: 52, mag: 2.6 },
      { x: 44, y: 40, mag: 2.8 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [2, 4]],
  },
  {
    id: 'leo',
    label: 'Leo',
    description: 'Zodiac lion — sickle and body.',
    zodiac: true,
    stars: [
      { x: 30, y: 42, name: 'Regulus', mag: 1.4 },
      { x: 40, y: 36, mag: 2.1 },
      { x: 52, y: 34, mag: 2.3 },
      { x: 62, y: 40, mag: 2 },
      { x: 72, y: 48, mag: 2.5 },
      { x: 58, y: 52, mag: 2.6 },
      { x: 44, y: 50, mag: 2.8 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [0, 6]],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Zodiac twins — Castor and Pollux.',
    zodiac: true,
    stars: [
      { x: 38, y: 28, name: 'Pollux', mag: 1.2 },
      { x: 48, y: 24, name: 'Castor', mag: 1.6 },
      { x: 36, y: 42, mag: 2.5 },
      { x: 46, y: 44, mag: 2.8 },
      { x: 34, y: 58, mag: 3 },
      { x: 50, y: 60, mag: 3.1 },
    ],
    edges: [[0, 2], [2, 4], [1, 3], [3, 5], [0, 1]],
  },
  {
    id: 'taurus',
    label: 'Taurus',
    description: 'Zodiac bull — V-shaped Hyades.',
    zodiac: true,
    stars: [
      { x: 42, y: 38, name: 'Aldebaran', mag: 0.9 },
      { x: 52, y: 32, mag: 2.2 },
      { x: 62, y: 36, mag: 2.5 },
      { x: 56, y: 48, mag: 2.8 },
      { x: 46, y: 52, mag: 3 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
  },
  {
    id: 'aries',
    label: 'Aries',
    description: 'Zodiac ram — faint horn pair.',
    zodiac: true,
    stars: [
      { x: 40, y: 44, name: 'Hamal', mag: 2 },
      { x: 52, y: 40, mag: 2.6 },
      { x: 60, y: 48, mag: 3.2 },
      { x: 48, y: 54, mag: 3.4 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [0, 3]],
  },
  {
    id: 'cancer',
    label: 'Cancer',
    description: 'Zodiac crab — soft Y shape.',
    zodiac: true,
    stars: [
      { x: 44, y: 48, mag: 3.5 },
      { x: 52, y: 42, mag: 3.8 },
      { x: 58, y: 50, mag: 3.6 },
      { x: 50, y: 58, mag: 3.9 },
      { x: 42, y: 56, mag: 4 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
  },
  {
    id: 'virgo',
    label: 'Virgo',
    description: 'Zodiac maiden — Spica at the wheat.',
    zodiac: true,
    stars: [
      { x: 58, y: 62, name: 'Spica', mag: 1 },
      { x: 48, y: 52, mag: 2.2 },
      { x: 42, y: 44, mag: 2.6 },
      { x: 54, y: 40, mag: 2.8 },
      { x: 64, y: 48, mag: 2.5 },
    ],
    edges: [[1, 2], [2, 3], [3, 4], [4, 0], [1, 0]],
  },
  {
    id: 'libra',
    label: 'Libra',
    description: 'Zodiac scales — balanced diamond.',
    zodiac: true,
    stars: [
      { x: 46, y: 50, mag: 2.6 },
      { x: 54, y: 44, mag: 2.7 },
      { x: 62, y: 50, mag: 2.8 },
      { x: 54, y: 58, mag: 2.9 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]],
  },
  {
    id: 'sagittarius',
    label: 'Sagittarius',
    description: 'Zodiac archer — teapot asterism.',
    zodiac: true,
    stars: [
      { x: 48, y: 62, mag: 2 },
      { x: 56, y: 54, mag: 2.1 },
      { x: 64, y: 48, mag: 2.5 },
      { x: 58, y: 40, mag: 2.8 },
      { x: 50, y: 44, mag: 2.6 },
      { x: 42, y: 52, mag: 2.9 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
  },
  {
    id: 'capricorn',
    label: 'Capricorn',
    description: 'Zodiac sea-goat — narrow triangle.',
    zodiac: true,
    stars: [
      { x: 52, y: 58, mag: 2.8 },
      { x: 44, y: 52, mag: 3 },
      { x: 56, y: 48, mag: 3.1 },
      { x: 62, y: 54, mag: 3.2 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
  },
  {
    id: 'pisces',
    label: 'Pisces',
    description: 'Zodiac fish — twin arcs.',
    zodiac: true,
    stars: [
      { x: 28, y: 48, mag: 3.2 },
      { x: 36, y: 52, mag: 3.4 },
      { x: 44, y: 56, mag: 3.5 },
      { x: 56, y: 54, mag: 3.3 },
      { x: 64, y: 50, mag: 3.4 },
      { x: 72, y: 46, mag: 3.6 },
    ],
    edges: [[0, 1], [1, 2], [3, 4], [4, 5]],
  },
  {
    id: 'aquarius',
    label: 'Aquarius',
    description: 'Zodiac water-bearer — rippling stream.',
    zodiac: true,
    stars: [
      { x: 32, y: 36, mag: 2.9 },
      { x: 42, y: 32, mag: 3 },
      { x: 52, y: 34, mag: 2.8 },
      { x: 62, y: 38, mag: 3.1 },
      { x: 54, y: 48, mag: 3.2 },
      { x: 44, y: 50, mag: 3.3 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
  },
];

const BY_ID = Object.fromEntries(CONSTELLATIONS.map(c => [c.id, c])) as Record<
  Exclude<ConstellationId, 'none'>,
  ConstellationDef
>;

export function getConstellation(id: ConstellationId): ConstellationDef | null {
  if (id === 'none') return null;
  return BY_ID[id] ?? null;
}

export function constellationOpacityForStyle(
  style: ConstellationStyle,
  visibility: number,
): number {
  const styleMul =
    style === 'minimal' ? 0.82 :
    style === 'scientific' ? 1 :
    style === 'mythological' ? 0.68 :
    0.38;
  return Math.min(1, visibility * styleMul);
}

export function lineOpacityForLuminance(
  baseLineOpacity: number,
  styleOpacity: number,
  isLight: boolean,
): number {
  const lumMul = isLight ? 0.55 : 1;
  return Math.min(0.42, baseLineOpacity * styleOpacity * lumMul);
}

export function starRadiusForMag(mag: number | undefined, scale: number): number {
  const m = mag ?? 2.5;
  const base = m < 1 ? 0.55 : m < 2 ? 0.42 : m < 3 ? 0.32 : 0.24;
  return base * scale;
}

export const CONSTELLATION_OPTIONS: { id: ConstellationId; label: string; description: string }[] = [
  { id: 'none', label: 'Off', description: 'No constellation overlay.' },
  ...CONSTELLATIONS.map(c => ({ id: c.id, label: c.label, description: c.description })),
];

export const ZODIAC_CONSTELLATIONS = CONSTELLATIONS.filter(c => c.zodiac);
