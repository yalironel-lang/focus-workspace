/**
 * Calm OS intelligence — contextual hints for Explore Focus only.
 * No mascot, no modal, no blocking overlays.
 */

import { useEffect, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens;
  hints: string[];
  accent: string;
}

export function ExploreFocusGuide({ tokens, hints, accent }: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const messages =
    hints.length > 0
      ? hints
      : [
          'This is a spatial study room — objects stay where you place them.',
          'Connections preserve how ideas relate across sources.',
          'Press ⌘K to search notebooks on this device.',
        ];

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex(i => (i + 1) % messages.length);
        setVisible(true);
      }, 420);
    }, 9000);
    return () => window.clearInterval(id);
  }, [messages.length]);

  const text = messages[index] ?? messages[0];

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 'max(20px, env(safe-area-inset-left))',
        bottom: 'max(22px, env(safe-area-inset-bottom))',
        zIndex: 48,
        pointerEvents: 'none',
        maxWidth: 'min(360px, calc(100vw - 40px))',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 16px 12px 12px',
          borderRadius: 16,
          border: `1px solid ${tokens.cardBorder}99`,
          background: `linear-gradient(145deg, ${tokens.cardBg}d0, ${tokens.pageBg}b0)`,
          backdropFilter: 'blur(18px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            marginTop: 4,
            flexShrink: 0,
            background: accent,
            boxShadow: `0 0 16px ${accent}88, 0 0 32px ${accent}33`,
            animation: 'fwGuidePulse 3.2s ease-in-out infinite',
          }}
        />
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: tokens.textGhost,
            }}
          >
            Spatial OS
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: tokens.textSecondary,
              letterSpacing: '-0.01em',
            }}
          >
            {text}
          </p>
        </div>
      </div>
      <style>{`
        @keyframes fwGuidePulse {
          0%, 100% { opacity: 0.65; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
      `}</style>
    </div>
  );
}
