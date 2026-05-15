import { memo, useCallback, useState } from 'react';
import type {
  EnvironmentReactions,
  LivingWorldDefinition,
  LivingWorldVisualAssets,
} from '../../../lib/livingEnvironment/livingEnvironmentTypes';
import { AtmosphereOverlays } from './AtmosphereOverlays';

interface LayerProps {
  world: LivingWorldDefinition;
  visual: LivingWorldVisualAssets;
  reactions: EnvironmentReactions;
  calmEffects: boolean;
  reduceMotion: boolean;
}

function motionPaused(calm: boolean, reduce: boolean, reactions: EnvironmentReactions) {
  return calm || reduce || reactions.driftPaused;
}

function imageFilter(visual: LivingWorldVisualAssets): string {
  const t = visual.tuning ?? {};
  const b = t.brightness ?? 1;
  const c = t.contrast ?? 1;
  const s = t.saturation ?? 1;
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

function parallaxTransform(
  reactions: EnvironmentReactions,
  depth: 'far' | 'mid' | 'near',
  visual: LivingWorldVisualAssets,
  paused: boolean,
): React.CSSProperties {
  if (paused) return { transform: 'translate3d(0,0,0) scale(1.05)' };
  const mul =
    depth === 'far'
      ? visual.parallaxDepth.base
      : depth === 'mid'
        ? visual.parallaxDepth.mid
        : visual.parallaxDepth.foreground;
  const x =
    depth === 'far'
      ? reactions.parallaxFarX * mul
      : depth === 'mid'
        ? reactions.parallaxMidX * mul
        : reactions.parallaxNearX * mul;
  const y =
    depth === 'far'
      ? reactions.parallaxFarY * mul
      : depth === 'mid'
        ? reactions.parallaxMidY * mul
        : reactions.parallaxNearY * mul;
  const spread =
    depth === 'far'
      ? 1 - reactions.zoomSpread * 0.06
      : depth === 'mid'
        ? 1 + reactions.zoomSpread * 0.03
        : 1 + reactions.zoomSpread * 0.08;
  const z =
    reactions.zoomDepth *
    (depth === 'near' ? 1 : depth === 'mid' ? 0.5 : 0.22) *
    (depth === 'far' ? visual.parallaxDepth.base : 1);
  return {
    transform: `translate3d(${x}px, ${y + z}px, 0) scale(${spread * 1.06})`,
    transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
    willChange: 'transform',
  };
}

function ReadabilityOverlay({
  visual,
  presence,
}: {
  visual: LivingWorldVisualAssets;
  presence: number;
}) {
  const r = visual.readability ?? {};
  const v = (r.vignetteStrength ?? 0.44) * presence;
  const e = (r.edgeDarken ?? 0.28) * presence;
  const lift = (r.centerLift ?? 0.06) * presence;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 82% 72% at 50% 40%, rgba(255,255,255,${lift}) 0%, transparent 52%),
          radial-gradient(ellipse 88% 78% at 50% 42%, transparent 0%, rgba(0,0,0,${v}) 72%, rgba(0,0,0,${e + v * 0.5}) 100%),
          linear-gradient(180deg, rgba(0,0,0,${e * 0.6}) 0%, transparent 16%, transparent 80%, rgba(0,0,0,${e}) 100%)
        `,
      }}
    />
  );
}

interface SceneImageLayerProps {
  src: string;
  fallback?: string;
  alt: string;
  depth: 'far' | 'mid' | 'near';
  visual: LivingWorldVisualAssets;
  reactions: EnvironmentReactions;
  paused: boolean;
  blendMode?: React.CSSProperties['mixBlendMode'];
  opacityMul?: number;
}

const SceneImageLayer = memo(function SceneImageLayer({
  src,
  fallback,
  alt,
  depth,
  visual,
  reactions,
  paused,
  blendMode,
  opacityMul = 1,
}: SceneImageLayerProps) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const p = reactions.presence * opacityMul * (1 + reactions.breathe * 0.25);

  const layerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: '-8%',
    pointerEvents: 'none',
    opacity: p,
    mixBlendMode: blendMode ?? 'normal',
    ...parallaxTransform(reactions, depth, visual, paused),
  };

  if (failed && fallback) {
    return (
      <div
        aria-hidden
        style={{
          ...layerStyle,
          background: fallback,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    );
  }

  return (
    <div aria-hidden style={layerStyle}>
      <img
        src={src}
        alt={alt}
        onError={onError}
        decoding="async"
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          filter: imageFilter(visual),
          userSelect: 'none',
        }}
      />
    </div>
  );
});

function CinematicEnvironmentLayersInner({
  world,
  visual,
  reactions,
  calmEffects,
  reduceMotion,
}: LayerProps) {
  const paused = motionPaused(calmEffects, reduceMotion, reactions);
  const overlays = visual.atmosphereOverlays ?? ['vignette'];

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        contain: 'layout paint',
      }}
    >
      <SceneImageLayer
        src={visual.baseImage}
        fallback={visual.fallbackBase}
        alt=""
        depth="far"
        visual={visual}
        reactions={reactions}
        paused={paused}
      />
      {visual.midLayerImage && (
        <SceneImageLayer
          src={visual.midLayerImage}
          fallback={visual.fallbackMid}
          alt=""
          depth="mid"
          visual={visual}
          reactions={reactions}
          paused={paused}
          blendMode="screen"
          opacityMul={0.85}
        />
      )}
      {visual.foregroundLayerImage && (
        <SceneImageLayer
          src={visual.foregroundLayerImage}
          fallback={visual.fallbackForeground}
          alt=""
          depth="near"
          visual={visual}
          reactions={reactions}
          paused={paused}
          opacityMul={0.9}
        />
      )}
      <AtmosphereOverlays
        kinds={overlays}
        worldId={world.id}
        reactions={reactions}
        paused={paused}
      />
      <ReadabilityOverlay visual={visual} presence={reactions.presence} />
    </div>
  );
}

export const CinematicEnvironmentLayers = memo(CinematicEnvironmentLayersInner);

export function hasCinematicVisual(world: LivingWorldDefinition): boolean {
  return !!world.visual?.baseImage;
}
