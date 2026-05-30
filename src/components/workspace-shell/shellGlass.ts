import type { CSSProperties } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

/** Clears fixed workspace chrome (bar + safe area). */
export const WORKSPACE_SHELL_TOP_INSET = 54;

type IslandTier = 'primary' | 'secondary';
type IslandPhase = 'idle' | 'hover' | 'active';

export function glassIsland(
  tokens: AtmosphereTokens,
  tier: IslandTier,
  phase: IslandPhase = 'idle',
): CSSProperties {
  const primary = tier === 'primary';
  const hover = phase === 'hover';
  const active = phase === 'active';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: primary ? 8 : 6,
    padding: primary ? '8px 14px' : '7px 11px',
    borderRadius: 999,
    border: `1px solid ${
      active
        ? `${tokens.accent}55`
        : hover
          ? `${tokens.cardBorderHover}`
          : `${tokens.cardBorder}88`
    }`,
    background: active
      ? `linear-gradient(145deg, ${tokens.cardBg}ee, ${tokens.wellBg}d8)`
      : hover
        ? `linear-gradient(145deg, ${tokens.cardBg}dc, ${tokens.wellBg}c8)`
        : `linear-gradient(145deg, ${tokens.cardBg}b8, ${tokens.wellBg}9a)`,
    backdropFilter: 'blur(20px) saturate(1.45)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.45)',
    boxShadow: hover || active
      ? `0 8px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)`
      : `0 4px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.05)`,
    opacity: primary ? 0.96 : 0.82,
    transition:
      'opacity 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    pointerEvents: 'auto',
  };
}

export function shellIconBtn(tokens: AtmosphereTokens, phase: IslandPhase = 'idle'): CSSProperties {
  const hover = phase === 'hover';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    minHeight: 40,
    padding: 0,
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    color: hover ? tokens.textPrimary : tokens.textMuted,
    backgroundColor: hover ? `${tokens.wellBg}cc` : 'transparent',
    opacity: hover ? 1 : 0.88,
    transition: 'color 0.15s ease, background-color 0.15s ease, opacity 0.15s ease',
    pointerEvents: 'auto',
  };
}
