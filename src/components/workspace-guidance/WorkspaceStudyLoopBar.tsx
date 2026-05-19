import { useMemo, type CSSProperties } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { StudyLoopAction } from '../../lib/studyConnections';

interface Props {
  tokens: AtmosphereTokens;
  actions: StudyLoopAction[];
  topOffset?: number;
  inShell?: boolean;
  onAction: (action: StudyLoopAction) => void;
  onDismiss?: () => void;
}

export function WorkspaceStudyLoopBar({
  tokens,
  actions,
  topOffset = 0,
  inShell = false,
  onAction,
  onDismiss,
}: Props) {
  const primary = actions[0];
  const secondary = actions.slice(1, 3);

  const shellStyle = useMemo((): CSSProperties => ({
    position: inShell ? 'absolute' : 'fixed',
    top: inShell ? 10 : topOffset + 10,
    left: 16,
    right: 16,
    zIndex: 47,
    maxWidth: 560,
    margin: inShell ? undefined : '0 auto',
    pointerEvents: 'auto',
  }), [inShell, topOffset]);

  if (!primary) return null;

  return (
    <div
      style={shellStyle}
      role="region"
      aria-label="Study loop"
    >
      <div
        style={{
          borderRadius: 16,
          border: `1px solid ${tokens.cardBorder}`,
          background: `linear-gradient(135deg, ${tokens.cardBg}f2, ${tokens.pageBg}e8)`,
          backdropFilter: 'blur(18px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                margin: '0 0 4px',
                fontSize: 9,
                fontWeight: 750,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: tokens.accent,
              }}
            >
              Study loop
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                fontWeight: 700,
                color: tokens.textPrimary,
                letterSpacing: '-0.02em',
                lineHeight: 1.25,
              }}
            >
              {primary.label}
            </p>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, color: tokens.textMuted, lineHeight: 1.4 }}>
              {primary.subtitle}
            </p>
          </div>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss study suggestions"
              style={{
                border: 'none',
                background: 'transparent',
                color: tokens.textGhost,
                fontSize: 11,
                cursor: 'pointer',
                padding: '2px 4px',
                flexShrink: 0,
              }}
            >
              Later
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => onAction(primary)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: tokens.accent,
              color: '#000',
              fontSize: 12,
              fontWeight: 750,
              cursor: 'pointer',
            }}
          >
            {primary.kind === 'review-mistakes' ? (
              <RotateCcw style={{ width: 13, height: 13 }} />
            ) : (
              <ArrowRight style={{ width: 13, height: 13 }} />
            )}
            {primary.kind === 'review-mistakes' ? 'Start review' : 'Continue'}
          </button>
          {secondary.map(action => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction(action)}
              style={{
                padding: '7px 11px',
                borderRadius: 10,
                border: `1px solid ${tokens.cardBorder}`,
                background: tokens.wellBg,
                color: tokens.textSecondary,
                fontSize: 11.5,
                fontWeight: 650,
                cursor: 'pointer',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
