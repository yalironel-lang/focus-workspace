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
      {/* ── Architectural skeleton — neutral dark masses the gradient layers tint ── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          // Pass accent as custom property for the SVG ceiling light panel
          ['--lib-arch-accent' as string]: accent,
        }}
      >
        <svg
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          style={{ width: '100%', height: '100%', display: 'block' }}
          aria-hidden="true"
        >
          <defs>
            {/* Floor atmospheric gradient — lighter at front, darker at horizon */}
            <linearGradient id="libFloorGrad" x1="0" y1="900" x2="0" y2="720" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0f1e36" />
              <stop offset="100%" stopColor="#040c1c" />
            </linearGradient>
            {/* Ceiling light panel warm glow — stronger */}
            <radialGradient id="libArchCeilLight" cx="50%" cy="0%" r="55%" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={accent} stopOpacity="0.50" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            {/* Central warm light shaft — inner beam */}
            <linearGradient id="libArchShaftWarm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffd580" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#ffd580" stopOpacity="0" />
            </linearGradient>
            {/* Wide stage cone — theatrical spotlight, warm amber */}
            <linearGradient id="libStageLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffd580" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#ffd580" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#ffd580" stopOpacity="0" />
            </linearGradient>
            {/* Side cool shaft — teal flanks */}
            <linearGradient id="libArchShaftCool" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
            </linearGradient>
            {/* Column inner-face edge — left-facing highlight */}
            <linearGradient id="libColFaceL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(80,140,240,0.52)" />
              <stop offset="100%" stopColor="rgba(80,140,240,0)" />
            </linearGradient>
            {/* Column inner-face edge — right-facing highlight */}
            <linearGradient id="libColFaceR" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(80,140,240,0.52)" />
              <stop offset="100%" stopColor="rgba(80,140,240,0)" />
            </linearGradient>
            {/* Vault underside highlight — stronger */}
            <linearGradient id="libVaultUnder" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(50,110,220,0.44)" />
              <stop offset="100%" stopColor="rgba(50,110,220,0)" />
            </linearGradient>
            {/* Floor fade */}
            <linearGradient id="libFloorFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#040c1a" stopOpacity="0" />
              <stop offset="100%" stopColor="#030810" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* 1. Base void — deep graphite-blue, not pure black */}
          <rect width="1440" height="900" fill="#030710" />

          {/* 2. Back wall interior surface — visibly lighter than walls */}
          <rect x="160" y="80" width="1120" height="560" fill="#0c1830" />

          {/* 3. Ceiling light panel — warm glow strip */}
          <rect x="460" y="80" width="520" height="120" fill={`url(#libArchCeilLight)`} />
          {/* Gold slit at base of panel — clearly visible */}
          <rect x="510" y="196" width="420" height="2" fill="#ffd580" fillOpacity="0.72" rx="1" />

          {/* 4. Left near-wall mass */}
          <polygon points="0,0 200,0 160,900 0,900" fill="#020610" />
          {/* 5. Right near-wall mass */}
          <polygon points="1440,0 1240,0 1280,900 1440,900" fill="#020610" />

          {/* 6. Near columns — LEFT */}
          <rect x="148" y="80" width="42" height="700" fill="#121e32" />
          {/* Inner face highlight — lit edge facing centre */}
          <rect x="188" y="80" width="4" height="700" fill="url(#libColFaceL)" />

          {/* 7. Near columns — RIGHT */}
          <rect x="1250" y="80" width="42" height="700" fill="#121e32" />
          <rect x="1248" y="80" width="4" height="700" fill="url(#libColFaceR)" />

          {/* 8. Mid-distance columns — left */}
          <rect x="270" y="100" width="28" height="620" fill="#0c1828" />
          <rect x="296" y="100" width="3" height="620" fill="rgba(80,140,240,0.32)" />
          {/* Mid-distance columns — right */}
          <rect x="1142" y="100" width="28" height="620" fill="#0c1828" />
          <rect x="1141" y="100" width="3" height="620" fill="rgba(80,140,240,0.32)" />

          {/* 9. Far columns — left */}
          <rect x="380" y="118" width="16" height="540" fill="#090f1e" />
          <rect x="395" y="118" width="2" height="540" fill="rgba(80,140,240,0.20)" />
          {/* Far columns — right */}
          <rect x="1044" y="118" width="16" height="540" fill="#090f1e" />
          <rect x="1043" y="118" width="2" height="540" fill="rgba(80,140,240,0.20)" />

          {/* 10. Ceiling vault arch */}
          <path
            d="M0,0 L1440,0 L1440,110 Q1280,82 720,78 Q160,82 0,110 Z"
            fill="#040c18"
          />
          {/* Vault underside highlight line — clearly visible */}
          <path
            d="M148,110 Q720,90 1292,110"
            fill="none"
            stroke="url(#libVaultUnder)"
            strokeWidth="2.5"
          />

          {/* 11. Perspective floor polygon — atmospheric gradient, front lighter */}
          <polygon
            points="0,720 1440,720 1280,900 160,900"
            fill="url(#libFloorGrad)"
          />
          {/* Warm front-floor highlight — stage light reaching camera-near floor */}
          <ellipse cx="720" cy="852" rx="310" ry="22" fill="#ffd580" fillOpacity="0.048" />
          {/* Floor horizon seam — strong separation line */}
          <line x1="0" y1="720" x2="1440" y2="720" stroke={accent} strokeOpacity="0.28" strokeWidth="1.5" />
          {/* Floor depth lines — perspective */}
          <line x1="720" y1="720" x2="720" y2="900" stroke="rgba(80,140,240,0.12)" strokeWidth="1" />
          <line x1="560" y1="720" x2="160" y2="900" stroke="rgba(80,140,240,0.08)" strokeWidth="1" />
          <line x1="880" y1="720" x2="1280" y2="900" stroke="rgba(80,140,240,0.08)" strokeWidth="1" />

          {/* Floor specular — warm reflection pool under the stage cone */}
          <ellipse cx="720" cy="740" rx="180" ry="28" fill="#ffd580" fillOpacity="0.10" />
          <ellipse cx="720" cy="740" rx="90" ry="14" fill="#ffd580" fillOpacity="0.14" />

          {/* 12. Light shafts — wide stage cone + tight inner beam */}
          {/* Wide cone: theatrical spotlight illuminating the main stage */}
          <polygon
            points="540,80 900,80 960,900 480,900"
            fill="url(#libStageLight)"
          />
          {/* Tight warm shaft — inner beam, higher intensity */}
          <polygon
            points="630,80 810,80 790,720 650,720"
            fill="url(#libArchShaftWarm)"
          />
          {/* Cool flanking shaft — left */}
          <polygon
            points="190,80 280,80 270,500 190,500"
            fill="url(#libArchShaftCool)"
          />
          {/* Cool flanking shaft — right */}
          <polygon
            points="1160,80 1250,80 1250,500 1170,500"
            fill="url(#libArchShaftCool)"
          />

          {/* 13. Back wall back-panel — deep interior hint */}
          <rect x="460" y="200" width="520" height="360" fill="#040c1c" fillOpacity="0.65" />
          {/* Back panel edge light */}
          <rect x="460" y="200" width="520" height="1" fill="rgba(80,140,240,0.18)" />

          {/* ── Observatory ring portal — architectural depth centerpiece ─────────
              Placement: cx=720 cy=365, r=260 → top=105, bottom=625, sides=460–980
              Fits inside far columns, above floor horizon. Near-invisible by design.
              User perceives it as architectural structure, not decorative element.
          ─────────────────────────────────────────────────────────────────────── */}
          {/* Outer structural ring — barely perceptible */}
          <circle cx="720" cy="365" r="260" fill="none"
            stroke="rgba(50,80,175,0.08)" strokeWidth="1.2" />
          {/* Inner concentric ring — ghost trace */}
          <circle cx="720" cy="365" r="241" fill="none"
            stroke="rgba(50,80,175,0.04)" strokeWidth="0.6" />
          {/* Accent top arc — warm illuminated upper edge, ~28% of ring */}
          <circle cx="720" cy="365" r="260" fill="none"
            stroke={accent} strokeOpacity="0.06" strokeWidth="1.2"
            strokeDasharray={`${(Math.PI * 2 * 260 * 0.28).toFixed(1)} ${(Math.PI * 2 * 260 * 0.72).toFixed(1)}`}
            transform="rotate(-90 720 365)"
          />
          {/* Structural crosshairs — barely visible architectural ribs */}
          <line x1="462" y1="365" x2="978" y2="365" stroke="rgba(55,90,190,0.035)" strokeWidth="0.5" />
          <line x1="720" y1="107" x2="720" y2="623" stroke="rgba(55,90,190,0.035)" strokeWidth="0.5" />

          {/* ── Ambient atmospheric particles — dust motes in mid-space ─────── */}
          {/* Rendered only when motion is allowed (SVG animate doesn't read CSS prefers-reduced-motion) */}
          {!spatial.reducedMotion && (
            <>
              <circle cx="468" cy="278" r="1.5" fill="rgba(140,180,255,0.07)">
                <animateTransform attributeName="transform" type="translate" values="0,0;3,-8;-2,3;0,0" dur="19s" repeatCount="indefinite" />
              </circle>
              <circle cx="628" cy="192" r="2" fill="rgba(140,180,255,0.055)">
                <animateTransform attributeName="transform" type="translate" values="0,0;-4,-6;2,4;0,0" dur="24s" begin="3s" repeatCount="indefinite" />
              </circle>
              <circle cx="764" cy="240" r="1.5" fill="rgba(255,215,130,0.065)">
                <animateTransform attributeName="transform" type="translate" values="0,0;2,-7;-3,2;0,0" dur="22s" begin="8s" repeatCount="indefinite" />
              </circle>
              <circle cx="908" cy="318" r="2" fill="rgba(140,180,255,0.05)">
                <animateTransform attributeName="transform" type="translate" values="0,0;-3,-9;1,5;0,0" dur="17s" begin="13s" repeatCount="indefinite" />
              </circle>
              <circle cx="542" cy="386" r="1.5" fill="rgba(255,215,130,0.055)">
                <animateTransform attributeName="transform" type="translate" values="0,0;4,-5;-2,3;0,0" dur="28s" begin="5s" repeatCount="indefinite" />
              </circle>
              <circle cx="845" cy="204" r="2" fill="rgba(140,180,255,0.06)">
                <animateTransform attributeName="transform" type="translate" values="0,0;-2,-8;3,4;0,0" dur="21s" begin="10s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* 14. Foreground base strip */}
          <rect x="0" y="820" width="1440" height="80" fill="#020508" fillOpacity="0.80" />

          {/* 15. Corner depth vignettes */}
          <rect x="0" y="0" width="200" height="900" fill="url(#libFloorFade)" fillOpacity="0.32" />
          <rect x="1240" y="0" width="200" height="900" fill="url(#libFloorFade)" fillOpacity="0.32" />

          {/* 16. Near-foreground threshold — dark corner masses framing the view */}
          {/* Creates the feeling of looking through an architectural entrance */}
          <polygon points="0,900 220,900 0,580" fill="#010308" fillOpacity="0.88" />
          <polygon points="1440,900 1220,900 1440,580" fill="#010308" fillOpacity="0.88" />
          <rect x="0" y="860" width="1440" height="40" fill="#010308" fillOpacity="0.72" />
        </svg>

        {/* Ceiling darkness — seals enclosure, lighter than before */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '18%',
            background: 'linear-gradient(180deg, rgba(1,3,8,0.68) 0%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />
        {/* Left wall vignette — lighter, lets columns breathe */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '14%',
            height: '100%',
            background: 'linear-gradient(90deg, rgba(1,3,8,0.48) 0%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />
        {/* Right wall vignette */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '14%',
            height: '100%',
            background: 'linear-gradient(270deg, rgba(1,3,8,0.48) 0%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />
        {/* Warm amber overhead bloom — heat source above */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '40%',
            background: 'radial-gradient(ellipse 48% 28% at 50% 0%, rgba(255,210,120,0.10), transparent 80%)',
            pointerEvents: 'none',
          }}
        />
        {/* Floor teal ambient — cool shadow pooling at base */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '30%',
            background: 'radial-gradient(ellipse 80% 30% at 50% 100%, rgba(30,100,180,0.09), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ── Original gradient overlays tint the architecture with theme accent ── */}
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
            linear-gradient(168deg, #060e1c 0%, #030810 46%, #060d18 100%)
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
          opacity: featured ? focusOpacity * 1.55 : focusOpacity * 0.85,
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
          background: 'linear-gradient(0deg, rgba(0,0,0,0.38) 0%, transparent 100%)',
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 82% 74% at 44% 38%, transparent 32%, rgba(2,4,10,0.28) 100%)',
        }}
      />
    </>
  );
}
