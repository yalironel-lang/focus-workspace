import type { CSSProperties, ReactNode } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

export type WorkspaceMicroSceneVariant =
  | 'study-flow'
  | 'reading-focus'
  | 'problem-tools'
  | 'thinking-map'
  | 'cluster-return'
  | 'course-desk'
  | 'review-column'
  | 'idea-flow';

interface Props {
  tokens: AtmosphereTokens;
  variant: WorkspaceMicroSceneVariant;
  size?: 'compact' | 'card' | 'empty';
}

const SIZE_MAP = {
  compact: { w: 64, h: 42, scale: 0.82 },
  card: { w: 92, h: 58, scale: 1 },
  empty: { w: 128, h: 76, scale: 1.18 },
} as const;

function hash(id: string): number {
  let value = 0;
  for (let i = 0; i < id.length; i++) value = (value * 31 + id.charCodeAt(i)) >>> 0;
  return value;
}

export function WorkspaceMicroScene({ tokens, variant, size = 'card' }: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const dims = SIZE_MAP[size];
  const rid = `fw-micro-${variant}-${hash(`${variant}-${size}`)}`;
  const durA = prefersReducedMotion ? '0s' : '10.5s';
  const durB = prefersReducedMotion ? '0s' : '13s';
  const durC = prefersReducedMotion ? '0s' : '8.5s';

  const scene: CSSProperties = {
    position: 'relative',
    width: dims.w,
    height: dims.h,
    borderRadius: 14,
    overflow: 'hidden',
    background: `linear-gradient(180deg, rgba(255,255,255,0.06) 0%, ${tokens.wellBg}ee 100%)`,
    border: `1px solid rgba(255,255,255,0.08)`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  };

  const node = (
    id: string,
    style: CSSProperties,
    tone: 'primary' | 'secondary' | 'utility' = 'secondary',
  ) => {
    const bg =
      tone === 'primary'
        ? `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, ${tokens.accent}2c 100%)`
        : tone === 'utility'
          ? 'rgba(148,163,184,0.12)'
          : 'rgba(148,163,184,0.16)';
    const border =
      tone === 'primary'
        ? `1px solid ${tokens.accent}30`
        : '1px solid rgba(255,255,255,0.08)';
    return (
      <span
        key={id}
        style={{
          position: 'absolute',
          display: 'block',
          borderRadius: 8,
          background: bg,
          border,
          boxShadow: tone === 'primary' ? `0 0 16px ${tokens.accent}14` : 'none',
          ...style,
        }}
      />
    );
  };

  const glow = (id: string, style: CSSProperties) => (
    <span
      key={id}
      style={{
        position: 'absolute',
        display: 'block',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${tokens.accent}2c 0%, transparent 72%)`,
        filter: 'blur(14px)',
        ...style,
      }}
    />
  );

  const beam = (id: string, style: CSSProperties) => (
    <span
      key={id}
      style={{
        position: 'absolute',
        display: 'block',
        borderRadius: 999,
        background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 28%, ${tokens.accent}2e 50%, rgba(255,255,255,0.12) 72%, transparent 100%)`,
        filter: 'blur(0.2px)',
        opacity: 0.82,
        ...style,
      }}
    />
  );

  const animated = (name: 'floatA' | 'floatB' | 'floatC' | 'pulse') =>
    prefersReducedMotion ? undefined : `${rid}-${name} linear infinite`;

  const nodesByVariant: Record<WorkspaceMicroSceneVariant, ReactNode[]> = {
    'study-flow': [
      beam('line-1', { left: '20%', top: '49%', width: '58%', height: 2, animation: animated('pulse'), animationDuration: durC }),
      node('pdf', { left: '7%', top: '18%', width: '28%', height: '50%', animation: animated('floatA'), animationDuration: durA }, 'secondary'),
      node('notebook', { left: '39%', top: '12%', width: '32%', height: '58%', animation: animated('floatB'), animationDuration: durB }, 'primary'),
      node('tool', { left: '76%', top: '18%', width: '14%', height: '24%', animation: animated('floatC'), animationDuration: durC }, 'utility'),
      node('mistake', { left: '71%', top: '49%', width: '19%', height: '24%', animation: animated('floatA'), animationDuration: durA }, 'secondary'),
      glow('glow', { left: '34%', top: '9%', width: '36%', height: '54%', animation: animated('pulse'), animationDuration: durB }),
    ],
    'reading-focus': [
      node('pdf', { left: '8%', top: '10%', width: '40%', height: '70%', animation: animated('floatA'), animationDuration: durA }, 'primary'),
      node('notes', { left: '56%', top: '16%', width: '28%', height: '42%', animation: animated('floatB'), animationDuration: durB }, 'secondary'),
      node('quotes', { left: '56%', top: '64%', width: '30%', height: '16%', animation: animated('floatC'), animationDuration: durC }, 'utility'),
      beam('beam', { left: '41%', top: '38%', width: '22%', height: 2, transform: 'rotate(-7deg)', animation: animated('pulse'), animationDuration: durC }),
      glow('glow', { left: '11%', top: '18%', width: '34%', height: '48%', animation: animated('pulse'), animationDuration: durB }),
    ],
    'problem-tools': [
      node('notebook', { left: '8%', top: '14%', width: '31%', height: '56%', animation: animated('floatA'), animationDuration: durA }, 'primary'),
      node('calc', { left: '46%', top: '14%', width: '17%', height: '42%', animation: animated('floatB'), animationDuration: durB }, 'utility'),
      node('graph', { left: '67%', top: '16%', width: '22%', height: '30%', animation: animated('floatC'), animationDuration: durC }, 'secondary'),
      node('scratch', { left: '48%', top: '60%', width: '24%', height: '16%', animation: animated('floatB'), animationDuration: durA }, 'secondary'),
      node('mistake', { left: '76%', top: '54%', width: '15%', height: '22%', animation: animated('floatA'), animationDuration: durB }, 'secondary'),
      beam('beam', { left: '33%', top: '41%', width: '44%', height: 2, animation: animated('pulse'), animationDuration: durC }),
    ],
    'thinking-map': [
      node('hub', { left: '39%', top: '30%', width: '24%', height: '26%', animation: animated('floatB'), animationDuration: durA }, 'primary'),
      node('a', { left: '10%', top: '14%', width: '18%', height: '18%', animation: animated('floatA'), animationDuration: durB }, 'secondary'),
      node('b', { left: '70%', top: '18%', width: '18%', height: '18%', animation: animated('floatC'), animationDuration: durC }, 'secondary'),
      node('c', { left: '18%', top: '60%', width: '22%', height: '16%', animation: animated('floatC'), animationDuration: durA }, 'utility'),
      node('d', { left: '66%', top: '60%', width: '20%', height: '18%', animation: animated('floatB'), animationDuration: durB }, 'secondary'),
      beam('ab', { left: '25%', top: '34%', width: '24%', height: 2, transform: 'rotate(16deg)', animation: animated('pulse'), animationDuration: durC }),
      beam('bb', { left: '50%', top: '33%', width: '23%', height: 2, transform: 'rotate(-12deg)', animation: animated('pulse'), animationDuration: durB }),
      beam('cb', { left: '31%', top: '54%', width: '22%', height: 2, transform: 'rotate(-20deg)', animation: animated('pulse'), animationDuration: durA }),
      beam('db', { left: '49%', top: '54%', width: '22%', height: 2, transform: 'rotate(18deg)', animation: animated('pulse'), animationDuration: durA }),
      glow('glow', { left: '28%', top: '20%', width: '44%', height: '40%', animation: animated('pulse'), animationDuration: durB }),
    ],
    'cluster-return': [
      node('a', { left: '10%', top: '22%', width: '18%', height: '20%', animation: animated('floatA'), animationDuration: durA }, 'secondary'),
      node('b', { left: '31%', top: '18%', width: '22%', height: '26%', animation: animated('floatB'), animationDuration: durB }, 'primary'),
      node('c', { left: '56%', top: '24%', width: '18%', height: '18%', animation: animated('floatC'), animationDuration: durC }, 'secondary'),
      node('d', { left: '74%', top: '46%', width: '16%', height: '18%', animation: animated('floatA'), animationDuration: durA }, 'utility'),
      beam('line', { left: '18%', top: '40%', width: '55%', height: 2, animation: animated('pulse'), animationDuration: durC }),
      glow('glow', { left: '23%', top: '12%', width: '40%', height: '42%', animation: animated('pulse'), animationDuration: durB }),
    ],
    'course-desk': [
      node('nb1', { left: '8%', top: '12%', width: '28%', height: '42%', animation: animated('floatA'), animationDuration: durA }, 'primary'),
      node('nb2', { left: '40%', top: '14%', width: '24%', height: '38%', animation: animated('floatB'), animationDuration: durB }, 'primary'),
      node('pdf', { left: '69%', top: '18%', width: '19%', height: '30%', animation: animated('floatC'), animationDuration: durC }, 'secondary'),
      node('tools', { left: '18%', top: '60%', width: '20%', height: '14%', animation: animated('floatB'), animationDuration: durA }, 'utility'),
      node('notes', { left: '43%', top: '58%', width: '18%', height: '16%', animation: animated('floatC'), animationDuration: durB }, 'secondary'),
      beam('beam', { left: '32%', top: '48%', width: '42%', height: 2, animation: animated('pulse'), animationDuration: durC }),
    ],
    'review-column': [
      node('pdf', { left: '34%', top: '10%', width: '30%', height: '18%', animation: animated('floatA'), animationDuration: durA }, 'secondary'),
      node('notes', { left: '31%', top: '34%', width: '34%', height: '18%', animation: animated('floatB'), animationDuration: durB }, 'primary'),
      node('formula', { left: '34%', top: '58%', width: '28%', height: '12%', animation: animated('floatC'), animationDuration: durC }, 'utility'),
      node('mistakes', { left: '30%', top: '76%', width: '34%', height: '14%', animation: animated('floatA'), animationDuration: durA }, 'secondary'),
      beam('beam', { left: '47%', top: '25%', width: 2, height: '52%', animation: animated('pulse'), animationDuration: durC }),
      glow('glow', { left: '24%', top: '28%', width: '48%', height: '42%', animation: animated('pulse'), animationDuration: durB }),
    ],
    'idea-flow': [
      node('hub', { left: '38%', top: '32%', width: '22%', height: '22%', animation: animated('floatB'), animationDuration: durA }, 'primary'),
      node('a', { left: '10%', top: '18%', width: '18%', height: '16%', animation: animated('floatA'), animationDuration: durB }, 'secondary'),
      node('b', { left: '68%', top: '14%', width: '16%', height: '14%', animation: animated('floatC'), animationDuration: durC }, 'utility'),
      node('c', { left: '20%', top: '64%', width: '20%', height: '14%', animation: animated('floatC'), animationDuration: durA }, 'secondary'),
      node('d', { left: '68%', top: '60%', width: '18%', height: '16%', animation: animated('floatB'), animationDuration: durB }, 'secondary'),
      beam('ab', { left: '25%', top: '34%', width: '22%', height: 2, transform: 'rotate(13deg)', animation: animated('pulse'), animationDuration: durC }),
      beam('bb', { left: '52%', top: '29%', width: '18%', height: 2, transform: 'rotate(-20deg)', animation: animated('pulse'), animationDuration: durB }),
      beam('cb', { left: '35%', top: '56%', width: '18%', height: 2, transform: 'rotate(-22deg)', animation: animated('pulse'), animationDuration: durA }),
      beam('db', { left: '53%', top: '57%', width: '20%', height: 2, transform: 'rotate(18deg)', animation: animated('pulse'), animationDuration: durA }),
    ],
  };

  return (
    <div style={scene} aria-hidden>
      <style>{`
        @keyframes ${rid}-floatA {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.94; }
          50% { transform: translateY(-2px) translateX(1px); opacity: 1; }
        }
        @keyframes ${rid}-floatB {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.92; }
          50% { transform: translateY(1px) translateX(-1px); opacity: 1; }
        }
        @keyframes ${rid}-floatC {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.9; }
          50% { transform: translateY(-1px) scale(1.01); opacity: 0.98; }
        }
        @keyframes ${rid}-pulse {
          0%, 100% { opacity: 0.42; }
          50% { opacity: 0.82; }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${dims.scale})`,
          transformOrigin: 'center center',
        }}
      >
        {nodesByVariant[variant]}
      </div>
    </div>
  );
}
