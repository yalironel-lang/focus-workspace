import { memo } from 'react';
import type { CosmicBackdropConfig } from '../../../lib/cosmic/cosmicBackgroundTypes';
import { CosmicCanvasBackdrop } from '../CosmicCanvasBackdrop';
import type {
  EnvironmentReactions,
  LivingWorldDefinition,
} from '../../../lib/livingEnvironment/livingEnvironmentTypes';
import {
  CinematicEnvironmentLayers,
  hasCinematicVisual,
} from './CinematicEnvironmentLayers';
import { ProceduralLayerForRenderer } from './ProceduralWorldLayers';

function isCosmicVisible(config: CosmicBackdropConfig): boolean {
  return (
    config.starDensity > 0.02 ||
    config.constellationVisibility > 0.02 ||
    config.nebulaIntensity > 0.02 ||
    config.milkyWayIntensity > 0.02
  );
}

export interface LivingEnvironmentBackdropProps {
  world: LivingWorldDefinition;
  cosmic: CosmicBackdropConfig;
  reactions: EnvironmentReactions;
  panX?: number;
  panY?: number;
  zoom?: number;
  calmEffects?: boolean;
  reduceMotion?: boolean;
}

function EnvironmentalFocusGlow({ reactions }: { reactions: EnvironmentReactions }) {
  if (reactions.focusGlowStrength < 0.04) return null;
  const s = reactions.focusGlowStrength;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background: `radial-gradient(ellipse 48% 42% at ${reactions.focusGlowX}% ${reactions.focusGlowY}%, rgba(255,255,255,${0.07 * s}) 0%, rgba(200,220,255,${0.04 * s}) 28%, transparent 68%)`,
        transition: 'background 0.55s cubic-bezier(0.4,0,0.2,1), opacity 0.45s ease',
        opacity: 0.85 + s * 0.15,
      }}
    />
  );
}

function LivingEnvironmentBackdropInner({
  world,
  cosmic,
  reactions,
  panX = 0,
  panY = 0,
  zoom = 1,
  calmEffects = false,
  reduceMotion = false,
}: LivingEnvironmentBackdropProps) {
  const cinematicProps = { world, reactions, calmEffects, reduceMotion };
  const proceduralProps = { reactions, calmEffects, reduceMotion };
  const cinematic = hasCinematicVisual(world);
  const showLegacyProcedural = !cinematic && world.renderer !== 'cosmic';
  const showCosmicStars = isCosmicVisible(cosmic) && world.renderer === 'cosmic';

  return (
    <>
      {cinematic && world.visual && (
        <CinematicEnvironmentLayers {...cinematicProps} visual={world.visual} />
      )}
      {!cinematic && world.renderer === 'cosmic' &&
        ProceduralLayerForRenderer('cosmic', world.id, proceduralProps)}
      {showCosmicStars && (
        <CosmicCanvasBackdrop
          config={cosmic}
          panX={panX}
          panY={panY}
          zoom={zoom}
          calmEffects={calmEffects || reactions.driftPaused}
        />
      )}
      {showLegacyProcedural &&
        ProceduralLayerForRenderer(world.renderer, world.id, proceduralProps)}
      <EnvironmentalFocusGlow reactions={reactions} />
    </>
  );
}

export const LivingEnvironmentBackdrop = memo(LivingEnvironmentBackdropInner);
