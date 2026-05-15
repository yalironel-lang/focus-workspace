import { memo, useMemo, useState, useEffect } from 'react';
import type { CosmicBackdropConfig } from '../../lib/cosmic/cosmicBackgroundTypes';
import { normalizeConstellationStyle } from '../../lib/cosmic/cosmicBackgroundTypes';
import {
  getConstellation,
  constellationOpacityForStyle,
  lineOpacityForLuminance,
  starRadiusForMag,
} from '../../lib/cosmic/constellationCatalog';
import { generateStarfield } from '../../lib/cosmic/cosmicStarfield';
import { cosmicParallaxTransform } from '../../lib/cosmic/cosmicParallax';

interface Props {
  config: CosmicBackdropConfig;
  panX?: number;
  panY?: number;
  zoom?: number;
  calmEffects?: boolean;
}

function CosmicCanvasBackdropInner({
  config,
  panX = 0,
  panY = 0,
  zoom = 1,
  calmEffects,
}: Props) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const stars = useMemo(
    () =>
      generateStarfield(
        config.seed,
        config.starDensity,
        config.starBrightness,
        config.starScale,
      ),
    [config.seed, config.starDensity, config.starBrightness, config.starScale],
  );

  const farStars = useMemo(() => stars.filter(s => s.depth === 0), [stars]);
  const midStars = useMemo(() => stars.filter(s => s.depth === 1), [stars]);
  const nearStars = useMemo(() => stars.filter(s => s.depth === 2), [stars]);

  const constellation = getConstellation(config.constellationId);
  const constellationStyle = normalizeConstellationStyle(config.constellationStyle);
  const styleOpacity = constellationOpacityForStyle(
    constellationStyle,
    config.constellationVisibility,
  );
  const lineOp = lineOpacityForLuminance(
    config.constellationLineOpacity,
    styleOpacity,
    config.isLight,
  );
  const showLabels =
    config.constellationLabels &&
    constellationStyle === 'scientific' &&
    styleOpacity > 0.1 &&
    !calmEffects;

  const twinkle = calmEffects || reducedMotion ? 0 : config.starTwinkle;
  const lineRgb = config.lineRgb.join(',');
  const starRgb = config.starRgb.join(',');

  const tNebula = cosmicParallaxTransform(panX, panY, zoom, 'nebula', reducedMotion);
  const tFar = cosmicParallaxTransform(panX, panY, zoom, 'far', reducedMotion);
  const tMid = cosmicParallaxTransform(panX, panY, zoom, 'mid', reducedMotion);
  const tNear = cosmicParallaxTransform(panX, panY, zoom, 'near', reducedMotion);
  const tConst = cosmicParallaxTransform(panX, panY, zoom, 'constellation', reducedMotion);
  const tGrain = cosmicParallaxTransform(panX, panY, zoom, 'grain', reducedMotion);

  const renderStars = (layer: typeof stars, keyPrefix: string) =>
    layer.map((s, i) => {
      const isBright = s.opacity > 0.52;
      const glow = isBright ? s.r * (s.depth === 2 ? 2.4 : 1.6) : 0;
      return (
        <circle
          key={`${keyPrefix}-${i}`}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill={`rgba(${starRgb},${s.opacity})`}
          className={twinkle > 0.05 && !calmEffects ? 'fw-cosmic-star' : undefined}
          style={
            twinkle > 0.05
              ? {
                  animationDelay: `${s.twinklePhase}s`,
                  animationDuration: `${4 + (i % 5)}s`,
                }
              : glow > 0
                ? { filter: `drop-shadow(0 0 ${glow}px rgba(${starRgb},${isBright ? 0.28 : 0.12}))` }
                : undefined
          }
        />
      );
    });

  const constellationSvg =
    constellation && lineOp > 0.02 ? (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          transform: tConst,
          willChange: reducedMotion ? undefined : 'transform',
        }}
      >
        <g opacity={lineOp}>
          {constellationStyle === 'mythological' && constellation.stars.length >= 3 && (
            <polygon
              points={constellation.stars.map(st => `${st.x},${st.y}`).join(' ')}
              fill={`rgba(${lineRgb},${config.isLight ? 0.02 : 0.035})`}
              stroke={`rgba(${lineRgb},${config.isLight ? 0.05 : 0.08})`}
              strokeWidth={0.04}
              strokeLinejoin="round"
            />
          )}
          {constellation.edges.map(([a, b], i) => {
            const sa = constellation.stars[a];
            const sb = constellation.stars[b];
            if (!sa || !sb) return null;
            const strokeAlpha =
              constellationStyle === 'scientific'
                ? config.isLight ? 0.22 : 0.32
                : constellationStyle === 'mythological'
                  ? config.isLight ? 0.14 : 0.22
                  : config.isLight ? 0.16 : 0.26;
            return (
              <line
                key={`e-${i}`}
                x1={sa.x}
                y1={sa.y}
                x2={sb.x}
                y2={sb.y}
                stroke={`rgba(${lineRgb},${strokeAlpha})`}
                strokeWidth={constellationStyle === 'scientific' ? 0.06 : 0.045}
                strokeLinecap="round"
              />
            );
          })}
          {constellation.stars.map((st, i) => {
            const r = starRadiusForMag(st.mag, config.constellationStarScale);
            const isKey = st.name != null || (st.mag != null && st.mag < 1.5);
            return (
              <g key={`cs-${i}`}>
                {isKey && (
                  <circle
                    cx={st.x}
                    cy={st.y}
                    r={r * 2.2}
                    fill={`rgba(${lineRgb},${config.isLight ? 0.12 : 0.18})`}
                  />
                )}
                <circle
                  cx={st.x}
                  cy={st.y}
                  r={r}
                  fill={`rgba(${lineRgb},${config.isLight ? 0.55 : 0.78})`}
                />
              </g>
            );
          })}
          {showLabels &&
            constellation.stars
              .filter(st => st.name)
              .map((st, i) => (
                <text
                  key={`lbl-${i}`}
                  x={st.x + 1.4}
                  y={st.y - 0.6}
                  fontSize="1.4"
                  fill={`rgba(${lineRgb},0.38)`}
                  style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 400 }}
                >
                  {st.name}
                </text>
              ))}
        </g>
      </svg>
    ) : null;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '-15%',
          transform: tNebula,
          willChange: reducedMotion ? undefined : 'transform',
        }}
      >
        {config.milkyWayCss && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: config.milkyWayCss,
              opacity: calmEffects ? 0.7 : 1,
              transform: 'rotate(-8deg)',
            }}
          />
        )}
        {config.nebulaCss && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: config.nebulaCss,
              opacity: calmEffects ? 0.75 : 1,
            }}
          />
        )}
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          transform: tFar,
          willChange: reducedMotion ? undefined : 'transform',
        }}
      >
        {renderStars(farStars, 'f')}
      </svg>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          transform: tMid,
          willChange: reducedMotion ? undefined : 'transform',
        }}
      >
        {renderStars(midStars, 'm')}
      </svg>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          transform: tNear,
          willChange: reducedMotion ? undefined : 'transform',
        }}
      >
        {renderStars(nearStars, 'n')}
      </svg>

      {constellationSvg}

      {config.depthGlowCss && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: config.depthGlowCss,
            pointerEvents: 'none',
            opacity: calmEffects ? 0.65 : 1,
          }}
        />
      )}
      {config.grainAmount > 0.02 && !calmEffects && (
        <div
          style={{
            position: 'absolute',
            inset: '-8%',
            transform: tGrain,
            willChange: reducedMotion ? undefined : 'transform',
            opacity: config.grainAmount * (config.isLight ? 0.22 : 0.36),
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E")`,
            mixBlendMode: config.isLight ? 'multiply' : 'soft-light',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

export const CosmicCanvasBackdrop = memo(CosmicCanvasBackdropInner);