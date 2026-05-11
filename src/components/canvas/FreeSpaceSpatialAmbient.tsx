/**
 * Premium ambient layer for section Free Space — sits in world space behind blocks.
 * Restrained: low contrast, no busy motion, optional ultra-slow drift.
 */

import { useMemo } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens;
}

/** Deterministic pseudo-random 0..1 from index (stable layout). */
function hash01(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function FreeSpaceSpatialAmbient({ tokens }: Props) {
  const stars = useMemo(() => {
    const out: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 140; i++) {
      const x = hash01(i, 1) * 4200 - 400;
      const y = hash01(i, 2) * 3200 - 300;
      const r = 0.35 + hash01(i, 3) * 0.85;
      const o = 0.04 + hash01(i, 4) * 0.1;
      out.push({ x, y, r, o });
    }
    return out;
  }, []);

  const lines = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 48; i++) {
      pts.push({
        x: hash01(i, 5) * 3800 - 200,
        y: hash01(i, 6) * 2800 - 200,
      });
    }
    const segs: { x1: number; y1: number; x2: number; y2: number; o: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j]!.x - pts[i]!.x;
        const dy = pts[j]!.y - pts[i]!.y;
        const d = Math.hypot(dx, dy);
        if (d > 80 && d < 220 && hash01(i + j, 7) > 0.72) {
          segs.push({
            x1: pts[i]!.x,
            y1: pts[i]!.y,
            x2: pts[j]!.x,
            y2: pts[j]!.y,
            o: 0.03 + hash01(i * j, 8) * 0.04,
          });
        }
      }
    }
    return segs.slice(0, 42);
  }, []);

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
        opacity: 1,
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
          <radialGradient id="fwAmbientCore" cx="42%" cy="38%" r="55%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.07" />
            <stop offset="45%" stopColor="#4f46e5" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="fwAmbientSide" cx="78%" cy="62%" r="40%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.055" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="fwOrbital" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
            <stop offset="50%" stopColor="#818cf8" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="4800" height="3800" fill="url(#fwAmbientCore)" />
        <rect x="0" y="0" width="4800" height="3800" fill="url(#fwAmbientSide)" />

        {/* Soft orbital arcs */}
        <ellipse
          cx={2100}
          cy={1900}
          rx={1180}
          ry={820}
          fill="none"
          stroke="url(#fwOrbital)"
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
          stroke="#94a3b8"
          strokeWidth={0.9}
          opacity={0.04}
          transform="rotate(14 2480 2100)"
        />

        {lines.map((ln, i) => (
          <line
            key={`ln-${i}`}
            x1={ln.x1}
            y1={ln.y1}
            x2={ln.x2}
            y2={ln.y2}
            stroke="#c4b5fd"
            strokeWidth={0.55}
            opacity={ln.o}
          />
        ))}

        {stars.map((s, i) => (
          <circle key={`st-${i}`} cx={s.x} cy={s.y} r={s.r} fill="#e2e8f0" opacity={s.o} />
        ))}

        {/* Whisper of accent from the active atmosphere */}
        <circle cx={3200} cy={900} r={340} fill={tokens.accent} opacity={0.018} filter="blur(80px)" />
        <circle cx={1200} cy={2600} r={420} fill="#6366f1" opacity={0.022} filter="blur(90px)" />
      </svg>
    </div>
  );
}
