/**
 * Premium ambient layer for section Free Space — sits in world space behind blocks.
 * Restrained: low contrast, no busy motion, optional ultra-slow drift.
 */

import { useMemo, useId } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens | null | undefined;
  /** Focus Mode: scales overall ambient presence (1 = default). */
  opacityScale?: number;
}

/** Deterministic pseudo-random 0..1 from index (stable layout). */
function hash01(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function FreeSpaceSpatialAmbient({ tokens, opacityScale = 1 }: Props) {
  const rid = useId().replace(/:/g, '');
  const idCore = `fwAmbientCore-${rid}`;
  const idSide = `fwAmbientSide-${rid}`;
  const idOrbital = `fwOrbital-${rid}`;

  const stars = useMemo(() => {
    const out: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 92; i++) {
      const x = hash01(i, 1) * 4200 - 400;
      const y = hash01(i, 2) * 3200 - 300;
      const r = 0.35 + hash01(i, 3) * 0.85;
      const o = 0.045 + hash01(i, 4) * 0.09;
      out.push({ x, y, r, o });
    }
    return out;
  }, []);

  const lines = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 40; i++) {
      pts.push({
        x: hash01(i, 5) * 3800 - 200,
        y: hash01(i, 6) * 2800 - 200,
      });
    }
    const segs: { x1: number; y1: number; x2: number; y2: number; o: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const pi = pts[i];
        const pj = pts[j];
        if (!pi || !pj) continue;
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const d = Math.hypot(dx, dy);
        if (d > 80 && d < 220 && hash01(i + j, 7) > 0.72) {
          segs.push({
            x1: pi.x,
            y1: pi.y,
            x2: pj.x,
            y2: pj.y,
            o: 0.028 + hash01(i * j, 8) * 0.034,
          });
        }
      }
    }
    return segs.slice(0, 26);
  }, []);

  if (!tokens || typeof tokens !== 'object' || typeof tokens.accent !== 'string') {
    return null;
  }

  const accentFill = tokens.accent.length > 0 ? tokens.accent : '#6366f1';

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: -720,
        top: -520,
        width: 4800,
        height: 3800,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: Math.max(0.34, Math.min(1.2, opacityScale)),
        transition: 'opacity 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
        animation: 'fwSpatialDrift 140s linear infinite alternate',
      }}
    >
      <style>{`
        @keyframes fwSpatialDrift {
          from { transform: translate(0, 0); }
          to { transform: translate(-10px, -6px); }
        }
      `}</style>
      <svg width="100%" height="100%" viewBox="0 0 4800 3800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id={idCore} cx="42%" cy="38%" r="55%">
            <stop offset="0%" stopColor={tokens.accent} stopOpacity="0.078" />
            <stop offset="45%" stopColor={tokens.textSecondary} stopOpacity="0.038" />
            <stop offset="100%" stopColor={tokens.pageBg} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={idSide} cx="78%" cy="62%" r="40%">
            <stop offset="0%" stopColor={tokens.textSecondary} stopOpacity="0.05" />
            <stop offset="100%" stopColor={tokens.pageBg} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={idOrbital} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tokens.accent} stopOpacity="0" />
            <stop offset="50%" stopColor={tokens.accent} stopOpacity="0.05" />
            <stop offset="100%" stopColor={tokens.textSecondary} stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="4800" height="3800" fill={`url(#${idCore})`} />
        <rect x="0" y="0" width="4800" height="3800" fill={`url(#${idSide})`} />

        <ellipse
          cx={2100}
          cy={1900}
          rx={1180}
          ry={820}
          fill="none"
          stroke={`url(#${idOrbital})`}
          strokeWidth={1.2}
          opacity={0.45}
          transform="rotate(-8 2100 1900)"
        />
        <ellipse
          cx={2480}
          cy={2100}
          rx={920}
          ry={640}
          fill="none"
          stroke={tokens.textGhost}
          strokeWidth={0.9}
          opacity={0.055}
          transform="rotate(14 2480 2100)"
        />

        {lines.map((ln, i) => (
          <line
            key={`ln-${rid}-${i}`}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke={tokens.textSecondary}
            strokeWidth={0.55}
            opacity={ln.o}
          />
        ))}

        {stars.map((s, i) => (
          <circle key={`st-${rid}-${i}`} cx={s.x} cy={s.y} r={s.r} fill={tokens.textPrimary} opacity={s.o} />
        ))}

        <circle cx={3200} cy={900} r={340} fill={accentFill} opacity={0.038} filter="blur(80px)" />
        <circle cx={1200} cy={2600} r={420} fill={tokens.textSecondary} opacity={0.032} filter="blur(90px)" />
      </svg>
    </div>
  );
}
