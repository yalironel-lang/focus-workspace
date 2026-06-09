import { ArrowRight } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

interface Props {
  tokens: AtmosphereTokens;
  title: string;
  subtitle?: string | null;
  buttonLabel: string;
  onPrimary: () => void;
  onDismiss?: () => void;
}

/** Thin course-entry strip — same chrome family as StudyContinueBanner. */
export function CourseEntryStrip({
  tokens,
  title,
  subtitle,
  buttonLabel,
  onPrimary,
  onDismiss,
}: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 16,
        right: 16,
        zIndex: 48,
        maxWidth: 'min(640px, calc(100% - 32px))',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 12,
        border: `1px solid ${tokens.cardBorder}`,
        background: tokens.cardBg,
        boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: tokens.textPrimary }}>{title}</div>
        {subtitle ? (
          <div
            style={{
              fontSize: 11,
              color: tokens.textMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onPrimary}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          padding: '6px 10px',
          borderRadius: 8,
          border: 'none',
          background: tokens.accent,
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {buttonLabel}
        <ArrowRight size={14} />
      </button>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            border: 'none',
            background: 'transparent',
            color: tokens.textMuted,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
