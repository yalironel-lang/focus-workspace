import { memo } from 'react';
import type {
  AtmosphereOverlayKind,
  EnvironmentReactions,
} from '../../../lib/livingEnvironment/livingEnvironmentTypes';
import type { BackgroundPresetId } from '../../../lib/workspaceBackgroundStudio';

interface Props {
  kinds: AtmosphereOverlayKind[];
  worldId: BackgroundPresetId;
  reactions: EnvironmentReactions;
  paused: boolean;
}

function overlayOpacity(reactions: EnvironmentReactions, base: number) {
  return base * reactions.presence * (1 + reactions.breathe * 0.35);
}

export const AtmosphereOverlays = memo(function AtmosphereOverlays({
  kinds,
  worldId,
  reactions,
  paused,
}: Props) {
  const p = reactions.presence;
  const set = new Set(kinds);

  return (
    <>
      {set.has('light-shafts') && (
        <div
          className={paused ? undefined : 'fw-env-light-shafts'}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: overlayOpacity(reactions, worldId === 'warm-studio' ? 0.55 : 0.42),
            background:
              worldId === 'warm-studio'
                ? `linear-gradient(118deg, rgba(253,224,140,${0.2 * p}) 0%, rgba(251,191,36,${0.06 * p}) 18%, transparent 42%)`
                : `linear-gradient(180deg, rgba(230,250,235,${0.12 * p}) 0%, rgba(180,220,190,${0.04 * p}) 35%, transparent 72%)`,
            mixBlendMode: 'screen',
            transform: `translateX(${reactions.parallaxMidX * 0.08}px)`,
            filter: 'blur(1px)',
          }}
        />
      )}
      {set.has('fog') && (
        <div
          className={paused ? undefined : 'fw-env-fog'}
          aria-hidden
          style={{
            position: 'absolute',
            inset: '-5%',
            pointerEvents: 'none',
            opacity: overlayOpacity(reactions, 0.65),
            background: `
              radial-gradient(ellipse 120% 55% at 50% 100%, rgba(200,230,220,${0.16 * p}) 0%, transparent 65%),
              radial-gradient(ellipse 80% 40% at 30% 80%, rgba(180,210,200,${0.1 * p}) 0%, transparent 60%)
            `,
            filter: 'blur(28px)',
          }}
        />
      )}
      {set.has('haze') && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: overlayOpacity(reactions, 0.4),
            background: `radial-gradient(ellipse 100% 80% at 50% 40%, rgba(200,210,255,${0.06 * p}) 0%, transparent 70%)`,
          }}
        />
      )}
      {set.has('caustics') && (
        <div
          className={paused ? undefined : 'fw-ocean-caustics'}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: overlayOpacity(reactions, 0.45),
            background: `
              radial-gradient(ellipse 38% 20% at 28% 48%, rgba(125,211,252,${0.14 * p}) 0%, transparent 70%),
              radial-gradient(ellipse 32% 18% at 68% 42%, rgba(56,189,248,${0.11 * p}) 0%, transparent 68%)
            `,
            mixBlendMode: 'screen',
          }}
        />
      )}
      {set.has('dust') && (
        <div
          className={paused ? undefined : 'fw-studio-dust'}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: overlayOpacity(reactions, 0.35),
            background: `radial-gradient(circle at 22% 32%, rgba(253,224,140,${0.08 * p}) 0 1px, transparent 2px 28px)`,
          }}
        />
      )}
      {set.has('grain') && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: overlayOpacity(reactions, 0.08),
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
            backgroundSize: '180px 180px',
            mixBlendMode: 'overlay',
          }}
        />
      )}
    </>
  );
});
