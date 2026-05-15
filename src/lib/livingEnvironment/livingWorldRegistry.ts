import type { BackgroundPresetId } from '../workspaceBackgroundStudio';
import type {
  LivingMotionProfile,
  LivingReactionCapabilities,
  LivingWorldDefinition,
} from './livingEnvironmentTypes';
import { LIVING_WORLD_VISUALS } from './livingWorldVisuals';

const DEFAULT_MOTION = {
  driftPeriodSec: 220,
  panSensitivity: 0.62,
  zoomSensitivity: 0.42,
  breatheAmplitude: 0.042,
} as const;

function world(
  partial: Omit<LivingWorldDefinition, 'motion' | 'reactions'> & {
    motion?: Partial<LivingMotionProfile>;
    reactions?: Partial<LivingReactionCapabilities>;
  },
): LivingWorldDefinition {
  const { motion: motionPartial, reactions: reactionsPartial, ...rest } = partial;
  return {
    ...rest,
    visual: LIVING_WORLD_VISUALS[rest.id],
    motion: { ...DEFAULT_MOTION, ...motionPartial },
    reactions: {
      viewportPan: true,
      zoomDepth: true,
      focusCalm: true,
      selectionGlow: true,
      idleBreath: true,
      ...reactionsPartial,
    },
  };
}

export const LIVING_WORLDS: Record<string, LivingWorldDefinition> = {
  'deep-graphite': world({
    id: 'deep-graphite',
    name: 'Deep Graphite',
    description: 'Calm premium abstract. Minimal distraction.',
    category: 'abstract',
    renderer: 'abstract',
    emoji: '◼',
    intensityBase: 0.72,
    performanceCost: 'low',
    motion: { breatheAmplitude: 0.028, panSensitivity: 0.38 },
  }),
  'warm-studio': world({
    id: 'warm-studio',
    name: 'Warm Studio',
    description: 'Warm haze and soft amber atmosphere.',
    category: 'study',
    renderer: 'abstract',
    emoji: '◐',
    intensityBase: 0.78,
    performanceCost: 'low',
    motion: { breatheAmplitude: 0.036, panSensitivity: 0.44 },
  }),
  'cosmic-drift': world({
    id: 'cosmic-drift',
    name: 'Cosmic Drift',
    description: 'Stars, depth, slow celestial motion.',
    category: 'cosmic',
    renderer: 'cosmic',
    emoji: '✦',
    intensityBase: 0.88,
    performanceCost: 'medium',
    motion: { driftPeriodSec: 280, panSensitivity: 0.78, zoomSensitivity: 0.52, breatheAmplitude: 0.038 },
  }),
  'ocean-depths': world({
    id: 'ocean-depths',
    name: 'Ocean Depths',
    description: 'Deep blue ambient movement.',
    category: 'nature',
    renderer: 'ocean',
    emoji: '◎',
    intensityBase: 0.82,
    performanceCost: 'low',
    motion: { driftPeriodSec: 260, panSensitivity: 0.5, zoomSensitivity: 0.55, breatheAmplitude: 0.04 },
  }),
  'ancient-forest': world({
    id: 'ancient-forest',
    name: 'Ancient Forest',
    description: 'Fog, soft particles, layered depth.',
    category: 'nature',
    renderer: 'forest',
    emoji: '❧',
    intensityBase: 0.8,
    performanceCost: 'low',
    motion: { driftPeriodSec: 300, panSensitivity: 0.58, breatheAmplitude: 0.046 },
  }),
  'dinosaur-realm': world({
    id: 'dinosaur-realm',
    name: 'Dinosaur Realm',
    description: 'Distant creature silhouette. Cinematic calm.',
    category: 'cinematic',
    renderer: 'dinosaur',
    emoji: '◇',
    intensityBase: 0.76,
    performanceCost: 'medium',
    motion: { driftPeriodSec: 320, panSensitivity: 0.82, zoomSensitivity: 0.48, breatheAmplitude: 0.038 },
    reactions: { selectionGlow: true, idleBreath: true },
  }),
  observatory: world({
    id: 'observatory',
    name: 'Observatory',
    description: 'Luxury stargazing environment.',
    category: 'cosmic',
    renderer: 'cosmic',
    emoji: '🔭',
    intensityBase: 0.9,
    performanceCost: 'medium',
  }),
  'milky-way': world({
    id: 'milky-way',
    name: 'Milky Way',
    description: 'Galaxy band with deep parallax.',
    category: 'cosmic',
    renderer: 'cosmic',
    emoji: '○',
    intensityBase: 0.92,
    performanceCost: 'medium',
  }),
};

/** Featured starter set shown prominently in Living Background Studio. */
export const LIVING_FEATURED_WORLD_IDS: BackgroundPresetId[] = [
  'deep-graphite',
  'cosmic-drift',
  'warm-studio',
  'ocean-depths',
  'ancient-forest',
  'dinosaur-realm',
];

export const LIVING_WORLD_CATEGORIES: { id: LivingWorldDefinition['category']; label: string }[] = [
  { id: 'abstract', label: 'Abstract' },
  { id: 'cosmic', label: 'Cosmic' },
  { id: 'nature', label: 'Nature' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'study', label: 'Study' },
];

export function getLivingWorld(presetId: BackgroundPresetId): LivingWorldDefinition {
  return (
    LIVING_WORLDS[presetId] ??
    world({
      id: presetId,
      name: presetId,
      description: 'Living workspace environment',
      category: 'abstract',
      renderer: 'cosmic',
      emoji: '·',
      intensityBase: 0.75,
      performanceCost: 'low',
    })
  );
}

export function isCosmicRenderer(presetId: BackgroundPresetId): boolean {
  return getLivingWorld(presetId).renderer === 'cosmic';
}
