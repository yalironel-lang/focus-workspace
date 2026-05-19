import type { LibraryHomeTone } from '../../../lib/libraryHomeAtmosphere';
import { spatialFocusPoint, spatialParallaxOffset, useLibrarySpatial } from './LibrarySpatialContext';

interface Props {
  accent: string;
  /** Featured workspace visible — strengthens hero monument + spotlight */
  featured?: boolean;
  /** Living background preset tint for home continuity */
  homeTone?: LibraryHomeTone | null;
}

export function LibrarySpatialAtmosphere({ accent, featured = false, homeTone }: Props) {
  const spatial = useLibrarySpatial();
  const far = spatialParallaxOffset(spatial, 0.35);
  const mid = spatialParallaxOffset(spatial, 0.55);
  const focus = spatialFocusPoint(spatial);

  const motionScale = spatial.idle ? 0.78 : 1;
  const accentStrength = featured ? 0.95 + spatial.engagement * 0.12 : 0.88 + spatial.engagement * 0.12;
  const heroBoost = featured ? 1 : 0.72;
  const focusOpacity = spatial.reducedMotion
    ? 0.14
    : (0.11 + spatial.engagement * 0.16) * (spatial.idle ? 0.7 : 1) * heroBoost;

  const transformEase = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
  const bgEase = 'background 1.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 1.2s ease';

  const heroSpotX = spatial.focusRegion === 'field' ? focus.left : '28%';
  const heroSpotY = spatial.focusRegion === 'field' ? focus.top : '34%';
  const env = homeTone?.blend ?? 0;
  const envGlow1 = homeTone?.glow1 ?? 'transparent';
  const envGlow2 = homeTone?.glow2 ?? 'transparent';

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 78% 58% at 16% 10%,  ${accent}1e, transparent 54%),
            radial-gradient(ellipse 52% 48% at 78% 8%,  rgba(99,102,241,0.12), transparent 56%),
            radial-gradient(ellipse 64% 50% at 72% 42%, rgba(139,92,246,0.06), transparent 58%),
            radial-gradient(ellipse 70% 55% at 22% 18%, ${envGlow1}, transparent 58%),
            radial-gradient(ellipse 55% 48% at 82% 28%, ${envGlow2}, transparent 62%),
            linear-gradient(168deg, #040810 0%, #020407 46%, #050912 100%)
          `,
          opacity: accentStrength * (0.92 + env * 0.08),
          transition: bgEase,
        }}
      />

      {env > 0 && homeTone && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse 85% 65% at 48% 22%, ${homeTone.accent}14, transparent 72%)`,
            opacity: env * 0.38,
            transition: bgEase,
          }}
        />
      )}

      {/* Monument — large ambient spatial form */}
      <div
        style={{
          position: 'fixed',
          zIndex: 0,
          pointerEvents: 'none',
          width: 'min(118vw, 1280px)',
          height: 'min(78vh, 720px)',
          left: '-12%',
          top: '-10%',
          borderRadius: '48% 52% 44% 56% / 42% 46% 54% 48%',
          background: `
            radial-gradient(ellipse 52% 46% at 34% 44%, ${accent}28, ${accent}10 38%, transparent 68%),
            radial-gradient(ellipse 38% 32% at 58% 38%, ${envGlow1}, transparent 62%),
            radial-gradient(ellipse 42% 36% at 48% 50%, ${envGlow2}, transparent 68%)
          `,
          opacity: (0.72 + spatial.engagement * 0.28 + env * 0.12) * heroBoost,
          animation: spatial.reducedMotion ? 'none' : `libMonumentBreath ${26 + (spatial.idle ? 10 : 0)}s ease-in-out infinite`,
          transition: `${bgEase}, ${transformEase}`,
          transform: `translate3d(${far.x * 0.7}px, ${far.y * 0.7}px, 0) scale(${motionScale})`,
        }}
      />

      <div
        style={{
          position: 'fixed',
          zIndex: 0,
          pointerEvents: 'none',
          width: '68vw',
          height: '58vh',
          borderRadius: '50%',
          left: '4%',
          top: '-8%',
          background: `radial-gradient(circle, ${accent}1c, transparent 64%)`,
          animation: spatial.reducedMotion ? 'none' : `libBreath ${20 + (spatial.idle ? 8 : 0)}s ease-in-out infinite`,
          transition: `${bgEase}, ${transformEase}`,
          transform: `translate3d(${far.x}px, ${far.y}px, 0) scale(${motionScale})`,
          opacity: heroBoost,
        }}
      />

      {/* Center-right anchor */}
      <div
        style={{
          position: 'fixed',
          right: '-6%',
          top: '8%',
          width: 'min(52vw, 620px)',
          height: 'min(52vh, 480px)',
          zIndex: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 70% 60% at 60% 42%, rgba(99,102,241,0.10), transparent 68%),
            radial-gradient(ellipse 50% 45% at 40% 55%, ${accent}0c, transparent 72%)
          `,
          opacity: 0.55 + spatial.engagement * 0.2,
          transition: bgEase,
          transform: `translate3d(${mid.x * 0.35}px, ${mid.y * 0.35}px, 0)`,
        }}
      />

      {/* Featured workspace spotlight */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: featured ? focusOpacity * 1.15 : focusOpacity * 0.85,
          background: `
            radial-gradient(ellipse min(62vw, 780px) min(48vh, 520px) at ${heroSpotX} ${heroSpotY}, ${accent}22, transparent 68%),
            radial-gradient(ellipse min(36vw, 420px) min(28vh, 280px) at ${heroSpotX} ${heroSpotY}, rgba(255,255,255,0.04), transparent 72%)
          `,
          transition: spatial.reducedMotion ? 'none' : 'background 480ms ease, opacity 900ms ease',
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 64% 34% at 50% 0%, rgba(255,255,255,0.055), transparent 64%)',
          animation: spatial.reducedMotion ? 'none' : `libDrift ${30 + (spatial.idle ? 12 : 0)}s ease-in-out infinite`,
          opacity: 0.5 * motionScale,
          transform: `translate3d(${mid.x * 0.35}px, ${mid.y * 0.35}px, 0)`,
          transition: transformEase,
        }}
      />

      {/* Hero → card field bridge */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: '38vh',
          height: '28vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: `
            linear-gradient(180deg,
              transparent 0%,
              ${accent}06 28%,
              ${accent}0a 52%,
              rgba(4,6,14,0.35) 100%
            )
          `,
          opacity: featured ? 0.9 : 0.65,
          transition: bgEase,
        }}
      />

      {/* Card field depth pool */}
      <div
        style={{
          position: 'fixed',
          left: '14%',
          right: '4%',
          bottom: 0,
          height: 'min(58vh, 520px)',
          zIndex: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 88% 52% at 48% 18%, ${accent}12, transparent 62%),
            radial-gradient(ellipse 70% 40% at 52% 8%, rgba(99,102,241,0.08), transparent 58%)
          `,
          opacity: 0.65 + spatial.engagement * 0.2,
          transition: bgEase,
          transform: `translate3d(${mid.x * 0.2}px, ${mid.y * 0.12}px, 0)`,
        }}
      />

      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          width: '44vw',
          height: '68vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse at 100% 12%, ${accent}0c, transparent 66%)`,
          animation: spatial.reducedMotion ? 'none' : `libDriftSlow ${38 + (spatial.idle ? 14 : 0)}s ease-in-out infinite`,
          opacity: 0.38 * accentStrength,
          transition: bgEase,
          transform: `translate3d(${mid.x * 0.5}px, ${mid.y * 0.5}px, 0)`,
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.011) 1px, transparent 1px)
          `,
          backgroundSize: '88px 88px',
          maskImage: `
            radial-gradient(ellipse 75% 58% at 38% 24%, rgba(0,0,0,0.55), transparent 70%),
            radial-gradient(ellipse 90% 50% at 50% 78%, rgba(0,0,0,0.35), transparent 65%)
          `,
          opacity: 0.34,
          transform: `translate3d(${mid.x * 0.12}px, ${mid.y * 0.12}px, 0)`,
          transition: transformEase,
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: focusOpacity * 0.85,
          background: `radial-gradient(ellipse ${spatial.focusRegion === 'field' ? '40vmin' : '52vmin'} ${
            spatial.focusRegion === 'field' ? '32vmin' : '44vmin'
          } at ${focus.left} ${focus.top}, ${accent}14, transparent 76%)`,
          transition: spatial.reducedMotion ? 'none' : 'background 480ms ease, opacity 800ms ease',
        }}
      />

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '44vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.68) 0%, transparent 100%)',
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 82% 74% at 44% 38%, transparent 32%, rgba(2,4,10,0.48) 100%)',
        }}
      />
    </>
  );
}
