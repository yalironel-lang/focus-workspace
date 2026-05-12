import { useEffect, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

const FADE_MS = 420;
const VISIBLE_MS = 11000;

export function WorkspaceStarterHints({
  hints,
  tokens,
  onClear,
}: {
  hints: string[] | null;
  tokens: AtmosphereTokens;
  onClear: () => void;
}) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (!hints?.length) {
      setOpacity(0);
      return;
    }
    const raf = requestAnimationFrame(() => setOpacity(1));
    const fade = window.setTimeout(() => setOpacity(0), VISIBLE_MS);
    const done = window.setTimeout(() => onClear(), VISIBLE_MS + FADE_MS + 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [hints, onClear]);

  if (!hints?.length) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 28,
        transform: 'translateX(-50%)',
        zIndex: 70,
        maxWidth: 'min(520px, calc(100vw - 32px))',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        opacity,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      {hints.map((line, i) => (
        <div
          key={`${i}-${line.slice(0, 12)}`}
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: tokens.textSecondary,
            textAlign: 'center',
            padding: '7px 12px',
            borderRadius: 10,
            border: `1px solid ${tokens.cardBorder}`,
            background: `${tokens.cardBg}e6`,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}
