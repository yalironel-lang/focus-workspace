import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { EXPLORE_FOCUS_LIBRARY_SUBTEXT } from '../../lib/exploreFocus';

interface Props {
  tokens: AtmosphereTokens;
  accent: string;
  disabled?: boolean;
  onExplore: () => void;
  dominant?: boolean;
}

export function ExploreFocusCTA({ tokens, accent, disabled = false, onExplore, dominant = true }: Props) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onExplore}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: dominant ? '100%' : 'auto',
        maxWidth: dominant ? 560 : undefined,
        textAlign: 'left',
        padding: dominant ? '22px 24px 20px' : '14px 18px',
        borderRadius: 20,
        border: `1px solid ${hover ? `${accent}66` : `${accent}40`}`,
        background: `linear-gradient(135deg, ${accent}22 0%, ${tokens.cardBg}cc 48%, ${tokens.pageBg}aa 100%)`,
        backdropFilter: 'blur(22px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
        boxShadow: hover
          ? `0 16px 48px ${accent}33, inset 0 1px 0 rgba(255,255,255,0.1)`
          : `0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)`,
        cursor: disabled ? 'wait' : 'pointer',
        transform: hover && !disabled ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '-40%',
          background: `radial-gradient(circle at 30% 40%, ${accent}28, transparent 55%)`,
          opacity: hover ? 0.9 : 0.55,
          animation: 'fwExploreCtaGlow 5s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: `${accent}cc`,
          }}
        >
          Start here
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: dominant ? 26 : 18,
                fontWeight: 850,
                letterSpacing: '-0.04em',
                color: tokens.textPrimary,
                lineHeight: 1.1,
              }}
            >
              Explore Focus
            </h2>
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 13,
                lineHeight: 1.5,
                color: tokens.textSecondary,
                maxWidth: 400,
              }}
            >
              {EXPLORE_FOCUS_LIBRARY_SUBTEXT}
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 14,
              background: accent,
              color: '#0a0805',
              flexShrink: 0,
            }}
          >
            <ArrowRight size={20} strokeWidth={2.5} />
          </span>
        </div>
      </div>
      <style>{`
        @keyframes fwExploreCtaGlow {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.05); }
        }
      `}</style>
    </button>
  );
}
