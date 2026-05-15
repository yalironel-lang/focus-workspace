import type { CosmicBackdropConfig } from '../cosmic/cosmicBackgroundTypes';
import type { WorkspaceClarity } from '../workspaceClarity';
import { mapEnvironmentIntensity } from './livingEnvironmentIntensity';
import type {
  EnvironmentInput,
  EnvironmentReactions,
  LivingWorldDefinition,
} from './livingEnvironmentTypes';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

export const NEUTRAL_ENVIRONMENT_REACTIONS: EnvironmentReactions = {
  presence: 1,
  intensity: 1,
  motionMul: 1,
  panShiftX: 0,
  panShiftY: 0,
  parallaxFarX: 0,
  parallaxFarY: 0,
  parallaxMidX: 0,
  parallaxMidY: 0,
  parallaxNearX: 0,
  parallaxNearY: 0,
  zoomDepth: 0,
  zoomSpread: 0,
  breathe: 0,
  driftPaused: false,
  spatialAmbientScale: 1,
  focusGlowStrength: 0,
  focusGlowX: 50,
  focusGlowY: 48,
  cosmicMul: {
    starDensity: 1,
    starTwinkle: 1,
    nebulaIntensity: 1,
    milkyWayIntensity: 1,
    grainAmount: 1,
  },
};

export function computeEnvironmentReactions(
  world: LivingWorldDefinition,
  input: EnvironmentInput,
): EnvironmentReactions {
  const presence = mapEnvironmentIntensity(input.environmentIntensity ?? 0.72) * world.intensityBase;
  const intensity = clamp01(presence);
  const focusCalm = !!(input.focusMode || input.focusEditingId);
  const hasSelection = !!input.selectedId && !input.focusEditingId;
  const motionAllowed =
    input.motionEnabled &&
    !input.reduceMotion &&
    !input.calmEffects &&
    input.surfaceActive;
  const motionMul = motionAllowed ? (focusCalm ? 0.22 : 1) : 0;

  const panNormX = clamp(input.panX / 1800, -1, 1);
  const panNormY = clamp(input.panY / 1800, -1, 1);
  const zoomNorm = clamp((input.zoom - 1) / 1.5, -0.5, 0.5);

  const panSens = world.motion.panSensitivity * (world.reactions.viewportPan ? 1 : 0);
  const zoomSens = world.motion.zoomSensitivity * (world.reactions.zoomDepth ? 1 : 0);

  const panAmp = (48 + intensity * 28) * panSens;
  const panShiftX = panNormX * panAmp;
  const panShiftY = panNormY * panAmp * 0.72;
  const zoomDepth = zoomNorm * zoomSens * (36 + intensity * 20);
  const zoomSpread = zoomNorm * zoomSens * 0.12;

  const breathe =
    motionAllowed && world.reactions.idleBreath
      ? Math.sin(input.timePhase * 0.0002) * world.motion.breatheAmplitude * (0.9 + intensity * 0.5)
      : 0;

  const calmMul = focusCalm ? 0.78 : 1;
  const focusGlowStrength =
    hasSelection && world.reactions.selectionGlow
      ? (0.35 + intensity * 0.45) * calmMul
      : focusCalm
        ? 0.42 * intensity
        : 0;

  return {
    presence,
    intensity,
    motionMul,
    panShiftX,
    panShiftY,
    parallaxFarX: panShiftX * 0.32,
    parallaxFarY: panShiftY * 0.32,
    parallaxMidX: panShiftX * 0.58,
    parallaxMidY: panShiftY * 0.58,
    parallaxNearX: panShiftX * 0.92,
    parallaxNearY: panShiftY * 0.92,
    zoomDepth,
    zoomSpread,
    breathe,
    driftPaused: !motionAllowed,
    spatialAmbientScale: (0.88 + intensity * 0.28) * calmMul * (0.9 + motionMul * 0.1),
    focusGlowStrength,
    focusGlowX: input.focusGlowX ?? 50,
    focusGlowY: input.focusGlowY ?? 48,
    cosmicMul: {
      starDensity: 0.55 + intensity * 0.65,
      starTwinkle: motionMul * (focusCalm ? 0.12 : 1),
      nebulaIntensity: (0.5 + intensity * 0.7) * calmMul,
      milkyWayIntensity: (0.5 + intensity * 0.75) * calmMul,
      grainAmount: intensity * (focusCalm ? 0.45 : 0.9),
    },
  };
}

export function applyCosmicReactions(
  base: CosmicBackdropConfig,
  reactions: EnvironmentReactions,
): CosmicBackdropConfig {
  const m = reactions.cosmicMul;
  const p = reactions.presence;
  return {
    ...base,
    starDensity: base.starDensity * m.starDensity * (0.85 + p * 0.35),
    starBrightness: Math.min(1, base.starBrightness * (0.9 + p * 0.25)),
    starTwinkle: base.starTwinkle * m.starTwinkle,
    nebulaIntensity: base.nebulaIntensity * m.nebulaIntensity * (0.8 + p * 0.4),
    milkyWayIntensity: base.milkyWayIntensity * m.milkyWayIntensity * (0.75 + p * 0.45),
    grainAmount: base.grainAmount * m.grainAmount,
  };
}

export function applyClarityReactions(
  base: WorkspaceClarity,
  reactions: EnvironmentReactions,
): WorkspaceClarity {
  return {
    ...base,
    ambientMul: base.ambientMul * (0.9 + reactions.presence * 0.14),
    fogMul: base.fogMul * (0.94 + reactions.breathe * 0.5),
  };
}
