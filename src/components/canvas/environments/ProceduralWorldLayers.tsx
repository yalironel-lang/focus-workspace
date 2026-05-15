import { memo, useId } from 'react';
import type { EnvironmentReactions } from '../../../lib/livingEnvironment/livingEnvironmentTypes';
import type { LivingWorldRenderer } from '../../../lib/livingEnvironment/livingEnvironmentTypes';

interface LayerProps {
  reactions: EnvironmentReactions;
  calmEffects: boolean;
  reduceMotion: boolean;
}

function motionPaused(calm: boolean, reduce: boolean, reactions: EnvironmentReactions) {
  return calm || reduce || reactions.driftPaused;
}

function layerTransform(
  reactions: EnvironmentReactions,
  depth: 'far' | 'mid' | 'near',
  paused: boolean,
): React.CSSProperties {
  if (paused) return { transform: 'translate3d(0,0,0) scale(1)' };
  const x =
    depth === 'far'
      ? reactions.parallaxFarX
      : depth === 'mid'
        ? reactions.parallaxMidX
        : reactions.parallaxNearX;
  const y =
    depth === 'far'
      ? reactions.parallaxFarY
      : depth === 'mid'
        ? reactions.parallaxMidY
        : reactions.parallaxNearY;
  const scale = 1 + reactions.zoomSpread * (depth === 'far' ? -0.05 : depth === 'mid' ? 0.025 : 0.07);
  const z = reactions.zoomDepth * (depth === 'near' ? 1 : depth === 'mid' ? 0.48 : 0.22);
  return {
    transform: `translate3d(${x}px, ${y + z}px, 0) scale(${scale})`,
    transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
    willChange: 'transform',
  };
}

const presenceOpacity = (reactions: EnvironmentReactions, base: number) =>
  base * reactions.presence * (1 + reactions.breathe * 0.45);

function EnvRoot({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}

/** Keeps workspace content readable — edges fall into shadow, center stays open. */
function ReadabilityVignette({ p }: { p: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 85% 75% at 50% 42%, transparent 0%, rgba(0,0,0,${0.12 * p}) 72%, rgba(0,0,0,${0.38 * p}) 100%),
          linear-gradient(180deg, rgba(0,0,0,${0.08 * p}) 0%, transparent 18%, transparent 78%, rgba(0,0,0,${0.22 * p}) 100%)
        `,
      }}
    />
  );
}

function DepthStage({
  reactions,
  children,
}: LayerProps & { children: React.ReactNode }) {
  return (
    <EnvRoot>
      {children}
      <ReadabilityVignette p={reactions.presence} />
    </EnvRoot>
  );
}

function DepthLayer({
  reactions,
  calmEffects,
  reduceMotion,
  depth,
  opacity,
  children,
  className,
}: LayerProps & {
  depth: 'far' | 'mid' | 'near';
  opacity: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const paused = motionPaused(calmEffects, reduceMotion, reactions);
  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: depth === 'far' ? '-12%' : depth === 'near' ? '-4%' : '-6%',
        opacity: presenceOpacity(reactions, opacity),
        ...layerTransform(reactions, depth, paused),
      }}
    >
      {children}
    </div>
  );
}

export const CosmicAtmosphereLayer = memo(function CosmicAtmosphereLayer({
  reactions,
  calmEffects,
  reduceMotion,
}: LayerProps) {
  const paused = motionPaused(calmEffects, reduceMotion, reactions);
  const p = reactions.presence;
  const uid = useId().replace(/:/g, '');

  return (
    <EnvRoot>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="far" opacity={0.9}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id={`${uid}-neb-a`} cx="32%" cy="28%" r="55%">
              <stop offset="0%" stopColor={`rgba(129,140,248,${0.35 * p})`} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            <radialGradient id={`${uid}-neb-b`} cx="78%" cy="62%" r="48%">
              <stop offset="0%" stopColor={`rgba(79,70,229,${0.22 * p})`} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <rect width="1200" height="800" fill="#060a14" />
          <rect width="1200" height="800" fill={`url(#${uid}-neb-a)`} />
          <rect width="1200" height="800" fill={`url(#${uid}-neb-b)`} />
          <ellipse
            cx="920"
            cy="520"
            rx="140"
            ry="95"
            fill={`rgba(30,35,55,${0.55 * p})`}
          />
          <ellipse
            cx="920"
            cy="520"
            rx="95"
            ry="65"
            fill={`rgba(55,65,95,${0.35 * p})`}
          />
        </svg>
      </DepthLayer>
      <DepthLayer
        reactions={reactions}
        calmEffects={calmEffects}
        reduceMotion={reduceMotion}
        depth="mid"
        opacity={0.55}
        className={paused ? undefined : 'fw-cosmic-nebula-drift'}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(ellipse 90% 40% at 50% 18%, rgba(200,210,255,${0.06 * p}) 0%, transparent 70%),
              linear-gradient(125deg, transparent 30%, rgba(99,102,241,${0.08 * p}) 50%, transparent 70%)
            `,
          }}
        />
      </DepthLayer>
      <ReadabilityVignette p={p * 0.85} />
    </EnvRoot>
  );
});

export const AbstractAmbientLayer = memo(function AbstractAmbientLayer({
  reactions,
  calmEffects,
  reduceMotion,
  variant,
}: LayerProps & { variant: 'graphite' | 'warm' }) {
  const warm = variant === 'warm';
  const p = reactions.presence;
  const uid = useId().replace(/:/g, '');

  if (warm) {
    return (
      <DepthStage reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion}>
        <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="far" opacity={0.88}>
          <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
            <rect width="1200" height="800" fill="#14100c" />
            <rect x="720" y="60" width="180" height="220" rx="4" fill={`rgba(180,200,230,${0.06 * p})`} />
            <rect x="740" y="80" width="140" height="180" fill={`rgba(200,220,255,${0.04 * p})`} />
          </svg>
        </DepthLayer>
        <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="mid" opacity={0.82}>
          <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id={`${uid}-lamp`} cx="18%" cy="22%" r="45%">
                <stop offset="0%" stopColor={`rgba(253,224,140,${0.42 * p})`} />
                <stop offset="55%" stopColor={`rgba(251,191,36,${0.12 * p})`} />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>
            <rect width="1200" height="800" fill={`url(#${uid}-lamp)`} />
            <path d="M 0 520 L 1200 500 L 1200 800 L 0 800 Z" fill={`rgba(20,14,8,${0.75 * p})`} />
            <rect x="80" y="380" width="420" height="28" rx="2" fill={`rgba(35,28,20,${0.9 * p})`} />
            <rect x="100" y="200" width="12" height="190" fill={`rgba(30,24,18,${0.85 * p})`} />
            <ellipse cx="106" cy="195" rx="28" ry="18" fill={`rgba(253,224,140,${0.35 * p})`} filter="blur(6px)" />
            <rect x="680" y="240" width="220" height="160" rx="3" fill={`rgba(25,20,14,${0.7 * p})`} />
            {[0, 1, 2, 3].map(i => (
              <rect
                key={i}
                x={700 + i * 48}
                y={260}
                width={32}
                height={120}
                fill={`rgba(40,32,24,${0.5 * p})`}
              />
            ))}
          </svg>
        </DepthLayer>
        <DepthLayer
          reactions={reactions}
          calmEffects={calmEffects}
          reduceMotion={reduceMotion}
          depth="near"
          opacity={0.5}
          className={motionPaused(calmEffects, reduceMotion, reactions) ? undefined : 'fw-studio-dust'}
        >
          <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
            {[
              [120, 280, 1.2], [180, 320, 0.8], [240, 260, 1], [320, 340, 0.7], [90, 360, 0.9],
            ].map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill={`rgba(253,224,140,${0.12 * p})`} />
            ))}
            <path d="M 0 600 L 1200 580 L 1200 800 L 0 800 Z" fill={`rgba(8,6,4,${0.65 * p})`} />
          </svg>
        </DepthLayer>
      </DepthStage>
    );
  }

  return (
    <DepthStage reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion}>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="far" opacity={0.85}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={`${uid}-graphite-light`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={`rgba(220,230,245,${0.1 * p})`} />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <rect width="1200" height="800" fill="#0a0c10" />
          <rect width="1200" height="800" fill={`url(#${uid}-graphite-light)`} />
        </svg>
      </DepthLayer>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="mid" opacity={0.78}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          {[
            { x: 140, w: 90, h: 320, o: 0.12 },
            { x: 380, w: 70, h: 280, o: 0.08 },
            { x: 720, w: 110, h: 360, o: 0.14 },
            { x: 980, w: 85, h: 300, o: 0.1 },
          ].map((col, i) => (
            <g key={i}>
              <path
                d={`M ${col.x} 800 L ${col.x + col.w * 0.3} 480 L ${col.x + col.w} 460 L ${col.x + col.w} 800 Z`}
                fill={`rgba(180,190,210,${col.o * p})`}
              />
              <path
                d={`M ${col.x + col.w * 0.3} 480 L ${col.x + col.w} 460 L ${col.x + col.w} 800 L ${col.x} 800 Z`}
                fill={`rgba(120,130,150,${col.o * 0.6 * p})`}
              />
              <line
                x1={col.x + col.w * 0.35}
                y1={490}
                x2={col.x + col.w * 0.35}
                y2={800}
                stroke={`rgba(255,255,255,${0.06 * p})`}
                strokeWidth="1"
              />
            </g>
          ))}
        </svg>
      </DepthLayer>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="near" opacity={0.55}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path d="M 0 620 L 1200 600 L 1200 800 L 0 800 Z" fill={`rgba(6,8,12,${0.8 * p})`} />
          <path
            d="M 0 640 L 200 620 L 400 650 L 600 610 L 800 640 L 1000 615 L 1200 635 L 1200 800 L 0 800 Z"
            fill={`rgba(255,255,255,${0.02 * p})`}
          />
        </svg>
      </DepthLayer>
    </DepthStage>
  );
});

export const OceanDepthsLayer = memo(function OceanDepthsLayer({
  reactions,
  calmEffects,
  reduceMotion,
}: LayerProps) {
  const paused = motionPaused(calmEffects, reduceMotion, reactions);
  const p = reactions.presence;
  const uid = useId().replace(/:/g, '');

  return (
    <DepthStage reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion}>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="far" opacity={0.92}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={`${uid}-depth`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`rgba(56,189,248,${0.18 * p})`} />
              <stop offset="35%" stopColor="#062838" />
              <stop offset="100%" stopColor="#020a10" />
            </linearGradient>
            <radialGradient id={`${uid}-surface`} cx="50%" cy="0%" r="70%">
              <stop offset="0%" stopColor={`rgba(186,230,253,${0.28 * p})`} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <rect width="1200" height="800" fill={`url(#${uid}-depth)`} />
          <rect width="1200" height="280" fill={`url(#${uid}-surface)`} />
        </svg>
      </DepthLayer>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="mid" opacity={0.8}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path
            d="M 40 800 L 80 420 L 120 800 Z"
            fill={`rgba(4,30,45,${0.85 * p})`}
          />
          <path
            d="M 1080 800 L 1120 380 L 1160 800 Z"
            fill={`rgba(4,28,42,${0.85 * p})`}
          />
          <path
            d="M 200 800 Q 280 520 360 800"
            fill="none"
            stroke={`rgba(14,116,144,${0.25 * p})`}
            strokeWidth="28"
          />
          <path
            d="M 900 800 Q 980 480 1060 800"
            fill="none"
            stroke={`rgba(14,116,144,${0.22 * p})`}
            strokeWidth="24"
          />
        </svg>
      </DepthLayer>
      <DepthLayer
        reactions={reactions}
        calmEffects={calmEffects}
        reduceMotion={reduceMotion}
        depth="near"
        opacity={0.62}
        className={paused ? undefined : 'fw-ocean-caustics'}
      >
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <ellipse cx="360" cy="420" rx="220" ry="70" fill={`rgba(125,211,252,${0.1 * p})`} />
          <ellipse cx="780" cy="380" rx="180" ry="55" fill={`rgba(56,189,248,${0.08 * p})`} />
          <ellipse cx="540" cy="520" rx="260" ry="85" fill={`rgba(14,116,144,${0.12 * p})`} />
          {[
            [200, 300, 1.5], [450, 250, 1], [700, 320, 1.2], [950, 280, 0.9], [350, 600, 0.8],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={`rgba(200,240,255,${0.06 * p})`} />
          ))}
        </svg>
      </DepthLayer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.45 * p,
          background: 'linear-gradient(0deg, rgba(2,8,14,0.7) 0%, transparent 45%)',
        }}
      />
    </DepthStage>
  );
});

export const AncientForestLayer = memo(function AncientForestLayer({
  reactions,
  calmEffects,
  reduceMotion,
}: LayerProps) {
  const paused = motionPaused(calmEffects, reduceMotion, reactions);
  const p = reactions.presence;
  const uid = useId().replace(/:/g, '');

  return (
    <DepthStage reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion}>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="far" opacity={0.88}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id={`${uid}-clearing`} cx="52%" cy="18%" r="55%">
              <stop offset="0%" stopColor={`rgba(220,245,230,${0.2 * p})`} />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <rect width="1200" height="800" fill="#0a140e" />
          <rect width="1200" height="800" fill={`url(#${uid}-clearing)`} />
        </svg>
      </DepthLayer>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="mid" opacity={0.9}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path
            fill={`rgba(12,40,28,${0.55 * p})`}
            d="M 0 480 L 60 320 L 120 420 L 200 280 L 280 440 L 360 260 L 440 400 L 520 300 L 600 460 L 680 290 L 760 430 L 840 310 L 920 470 L 1000 340 L 1080 450 L 1200 400 L 1200 800 L 0 800 Z"
          />
          <path
            fill={`rgba(6,22,14,${0.88 * p})`}
            d="M 0 560 L 1200 500 L 1200 800 L 0 800 Z"
          />
        </svg>
      </DepthLayer>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="near" opacity={0.95}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path d="M 0 800 L 0 200 L 90 800 Z" fill={`rgba(4,12,8,${0.92 * p})`} />
          <path d="M 1200 800 L 1200 180 L 1110 800 Z" fill={`rgba(4,12,8,${0.92 * p})`} />
          <path d="M 40 800 L 70 350 L 100 800 Z" fill={`rgba(8,20,12,${0.95 * p})`} />
          <path d="M 1160 800 L 1130 320 L 1100 800 Z" fill={`rgba(8,20,12,${0.95 * p})`} />
        </svg>
      </DepthLayer>
      <div
        className={paused ? undefined : 'fw-forest-light-shaft'}
        style={{
          position: 'absolute',
          left: '38%',
          top: 0,
          width: '18%',
          height: '82%',
          opacity: 0.4 * p,
          background: `linear-gradient(180deg, rgba(230,250,235,${0.14 * p}) 0%, rgba(180,220,190,${0.04 * p}) 45%, transparent 100%)`,
          filter: 'blur(14px)',
          transform: `translateX(${reactions.parallaxMidX * 0.15}px)`,
        }}
      />
      <DepthLayer
        reactions={reactions}
        calmEffects={calmEffects}
        reduceMotion={reduceMotion}
        depth="near"
        opacity={0.5}
        className={paused ? undefined : 'fw-forest-mist'}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              radial-gradient(ellipse 120% 50% at 50% 100%, rgba(180,220,200,${0.14 * p}) 0%, transparent 65%),
              linear-gradient(0deg, rgba(20,50,35,${0.35 * p}) 0%, transparent 50%)
            `,
            filter: 'blur(24px)',
          }}
        />
      </DepthLayer>
    </DepthStage>
  );
});

export const DinosaurRealmLayer = memo(function DinosaurRealmLayer({
  reactions,
  calmEffects,
  reduceMotion,
}: LayerProps) {
  const paused = motionPaused(calmEffects, reduceMotion, reactions);
  const p = reactions.presence;
  const uid = useId().replace(/:/g, '');

  return (
    <DepthStage reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion}>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="far" opacity={0.85}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1814" />
              <stop offset="100%" stopColor="#0c0a08" />
            </linearGradient>
          </defs>
          <rect width="1200" height="800" fill={`url(#${uid}-sky)`} />
          <path
            d="M 0 520 L 180 480 L 320 510 L 480 470 L 620 500 L 800 460 L 1000 490 L 1200 475 L 1200 800 L 0 800 Z"
            fill={`rgba(25,20,14,${0.5 * p})`}
          />
        </svg>
      </DepthLayer>
      <DepthLayer
        reactions={reactions}
        calmEffects={calmEffects}
        reduceMotion={reduceMotion}
        depth="mid"
        opacity={0.72}
        className={paused ? undefined : 'fw-dino-breathe'}
      >
        <svg
          viewBox="0 0 520 300"
          width="100%"
          height="100%"
          preserveAspectRatio="xMaxYMax meet"
          style={{ position: 'absolute', right: '-5%', bottom: '-8%', width: 'min(78vw, 900px)', height: 'min(52vh, 480px)' }}
        >
          <defs>
            <linearGradient id={`${uid}-dino`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={`rgba(140,120,85,${0.5 * p})`} />
              <stop offset="100%" stopColor={`rgba(20,16,10,${0.05 * p})`} />
            </linearGradient>
          </defs>
          <g
            style={{
              transform: `rotate(${reactions.panShiftX * 0.04}deg)`,
              transformOrigin: '400px 200px',
            }}
          >
            <path
              fill={`url(#${uid}-dino)`}
              d="M 10 260 Q 55 200 105 215 L 135 155 Q 165 95 215 108 L 265 72 Q 310 48 355 68 L 395 52 Q 425 38 445 72 L 468 108 Q 478 135 462 152 L 425 178 L 375 205 Q 315 235 245 228 L 175 242 Q 95 258 35 268 Z"
            />
            <path
              fill={`rgba(90,75,50,${0.35 * p})`}
              d="M 355 68 L 395 52 L 410 75 L 385 95 Z"
            />
            <ellipse cx="452" cy="78" rx="6" ry="3.5" fill={`rgba(251,191,36,${0.4 * p})`} />
            <path
              d="M 30 268 Q 200 285 480 275"
              stroke={`rgba(0,0,0,${0.35 * p})`}
              strokeWidth="20"
              fill="none"
              opacity={0.5}
            />
          </g>
        </svg>
      </DepthLayer>
      <DepthLayer reactions={reactions} calmEffects={calmEffects} reduceMotion={reduceMotion} depth="near" opacity={0.65}>
        <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          <path d="M 0 640 L 1200 610 L 1200 800 L 0 800 Z" fill={`rgba(6,4,2,${0.75 * p})`} />
          <ellipse cx="200" cy="720" rx="120" ry="35" fill={`rgba(0,0,0,${0.25 * p})`} />
        </svg>
      </DepthLayer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.35 * p,
          background: `radial-gradient(ellipse 60% 50% at 75% 90%, rgba(180,140,80,${0.12 * p}) 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
      />
    </DepthStage>
  );
});

export function ProceduralLayerForRenderer(
  renderer: LivingWorldRenderer,
  presetId: string,
  props: LayerProps,
): React.ReactNode {
  switch (renderer) {
    case 'abstract':
      return (
        <AbstractAmbientLayer
          {...props}
          variant={presetId === 'warm-studio' ? 'warm' : 'graphite'}
        />
      );
    case 'ocean':
      return <OceanDepthsLayer {...props} />;
    case 'forest':
      return <AncientForestLayer {...props} />;
    case 'dinosaur':
      return <DinosaurRealmLayer {...props} />;
    case 'cosmic':
      return <CosmicAtmosphereLayer {...props} />;
    default:
      return null;
  }
}
