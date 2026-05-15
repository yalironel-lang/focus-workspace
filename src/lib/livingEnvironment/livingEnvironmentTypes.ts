import type { CosmicBackdropConfig } from '../cosmic/cosmicBackgroundTypes';
import type { FocusMode } from '../../focusMode/focusModeTypes';
import type { BackgroundPresetId } from '../workspaceBackgroundStudio';
import type { ResolvedBackgroundStudio } from '../workspaceBackgroundStudio';
import type { WorkspaceClarity } from '../workspaceClarity';

export type LivingWorldCategory =
  | 'abstract'
  | 'cosmic'
  | 'nature'
  | 'cinematic'
  | 'study';

export type LivingWorldRenderer =
  | 'cosmic'
  | 'abstract'
  | 'ocean'
  | 'forest'
  | 'dinosaur';

export type LivingPerformanceCost = 'low' | 'medium';

/** Lightweight atmosphere passes rendered via CSS/SVG (not scene artwork). */
export type AtmosphereOverlayKind =
  | 'fog'
  | 'vignette'
  | 'light-shafts'
  | 'haze'
  | 'caustics'
  | 'dust'
  | 'grain';

export interface LivingWorldParallaxDepth {
  /** Multiplier on reaction parallax for the base scene layer. */
  base: number;
  mid: number;
  foreground: number;
}

export interface LivingWorldImageTuning {
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export interface LivingWorldReadability {
  vignetteStrength?: number;
  edgeDarken?: number;
  centerLift?: number;
}

/** Hybrid cinematic scene — raster layers + CSS atmosphere overlays. */
export interface LivingWorldVisualAssets {
  baseImage: string;
  midLayerImage?: string;
  foregroundLayerImage?: string;
  atmosphereOverlays?: AtmosphereOverlayKind[];
  parallaxDepth: LivingWorldParallaxDepth;
  tuning?: LivingWorldImageTuning;
  readability?: LivingWorldReadability;
  /** CSS gradient stack used when raster assets fail to load. */
  fallbackBase?: string;
  fallbackMid?: string;
  fallbackForeground?: string;
}

export interface LivingMotionProfile {
  /** Base duration (seconds) for primary ambient drift. */
  driftPeriodSec: number;
  /** Max parallax shift factor applied to procedural layers. */
  panSensitivity: number;
  /** Zoom-linked depth shift. */
  zoomSensitivity: number;
  /** Idle breathing amplitude (opacity). */
  breatheAmplitude: number;
}

export interface LivingReactionCapabilities {
  viewportPan: boolean;
  zoomDepth: boolean;
  focusCalm: boolean;
  selectionGlow: boolean;
  idleBreath: boolean;
}

export interface LivingWorldDefinition {
  id: BackgroundPresetId;
  name: string;
  description: string;
  category: LivingWorldCategory;
  renderer: LivingWorldRenderer;
  emoji: string;
  motion: LivingMotionProfile;
  reactions: LivingReactionCapabilities;
  /** 0–1 base atmosphere strength before user intensity slider. */
  intensityBase: number;
  performanceCost: LivingPerformanceCost;
  /** Hybrid cinematic scene layers (base image + overlays). */
  visual?: LivingWorldVisualAssets;
}

export interface EnvironmentInput {
  panX: number;
  panY: number;
  zoom: number;
  selectedId: string | null;
  focusEditingId: string | null;
  focusMode: FocusMode | null;
  calmEffects: boolean;
  reduceMotion: boolean;
  surfaceActive: boolean;
  environmentIntensity: number;
  motionEnabled: boolean;
  /** Monotonic ms — drives idle breath only. */
  timePhase: number;
  /** Viewport % (0–100) — soft environmental light pull toward selection. */
  focusGlowX?: number;
  focusGlowY?: number;
}

export interface EnvironmentReactions {
  /** Mapped visual presence (after intensity curve). */
  presence: number;
  intensity: number;
  motionMul: number;
  panShiftX: number;
  panShiftY: number;
  /** Layered parallax offsets (px). */
  parallaxFarX: number;
  parallaxFarY: number;
  parallaxMidX: number;
  parallaxMidY: number;
  parallaxNearX: number;
  parallaxNearY: number;
  zoomDepth: number;
  zoomSpread: number;
  breathe: number;
  driftPaused: boolean;
  spatialAmbientScale: number;
  focusGlowStrength: number;
  focusGlowX: number;
  focusGlowY: number;
  cosmicMul: {
    starDensity: number;
    starTwinkle: number;
    nebulaIntensity: number;
    milkyWayIntensity: number;
    grainAmount: number;
  };
}

export interface LivingEnvironmentSnapshot {
  studio: ResolvedBackgroundStudio;
  world: LivingWorldDefinition;
  reactions: EnvironmentReactions;
  cosmic: CosmicBackdropConfig;
  clarity: WorkspaceClarity;
  connectionMul: number;
  minimapContrast: number;
}
