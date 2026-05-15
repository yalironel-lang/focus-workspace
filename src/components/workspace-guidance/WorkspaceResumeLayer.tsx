import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type {
  WorkspaceContinuityMemory,
  WorkspaceContinuitySuggestion,
} from '../../lib/workspaceContinuity';
import { WorkspaceMicroScene } from './WorkspaceMicroScene';

interface Props {
  tokens: AtmosphereTokens;
  topOffset?: number;
  inShell?: boolean;
  continuity: WorkspaceContinuityMemory;
  resumeCopy: {
    headline: string;
    subtitle: string;
    details: string[];
  } | null;
  suggestions: WorkspaceContinuitySuggestion[];
  onDismiss: () => void;
  onSuggestionClick: (suggestion: WorkspaceContinuitySuggestion) => void;
}

const AUTO_HIDE_MS = 9000;

function variantForIntent(intent: WorkspaceContinuityMemory['intent']) {
  switch (intent) {
    case 'reading':
      return 'reading-focus';
    case 'solving':
      return 'problem-tools';
    case 'reviewing':
      return 'cluster-return';
    case 'thinking':
      return 'thinking-map';
    default:
      return 'course-desk';
  }
}

export function WorkspaceResumeLayer({
  tokens,
  topOffset = 0,
  inShell = false,
  continuity,
  resumeCopy,
  suggestions,
  onDismiss,
  onSuggestionClick,
}: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (hovered) {
      setExpanded(true);
      return;
    }
    const timer = window.setTimeout(
      () => setExpanded(false),
      prefersReducedMotion ? AUTO_HIDE_MS * 0.7 : AUTO_HIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [hovered, prefersReducedMotion]);

  const variant = useMemo(() => variantForIntent(continuity.intent), [continuity.intent]);
  const primary = suggestions[0];

  if (!resumeCopy) return null;

  const showCard = expanded || hovered;

  return (
    <div
      onMouseEnter={() => {
        setHovered(true);
        setExpanded(true);
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: inShell ? 'absolute' : 'fixed',
        top: inShell ? 10 : topOffset + 10,
        right: 16,
        zIndex: 48,
        maxWidth: 'min(340px, calc(100vw - 48px))',
        pointerEvents: 'none',
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(-4px)',
        transition: prefersReducedMotion
          ? 'opacity 0.2s ease'
          : 'opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {!showCard ? (
        <button
          type="button"
          aria-label="Show resume hint"
          style={{
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 999,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
            boxShadow: '0 6px 20px rgba(0,0,0,0.24)',
            color: tokens.textSecondary,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'default',
          }}
        >
          <Clock3 className="w-3 h-3" style={{ color: tokens.accent }} />
          Resume
        </button>
      ) : (
        <div
          style={{
            pointerEvents: 'auto',
            borderRadius: 14,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
            boxShadow: '0 10px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)',
            padding: '10px 10px 10px 8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <WorkspaceMicroScene tokens={tokens} variant={variant} size="compact" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: tokens.accent,
                }}
              >
                {resumeCopy.headline}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: tokens.textPrimary,
                }}
              >
                {resumeCopy.subtitle}
              </div>
            </div>
            <button
              type="button"
              aria-label="Dismiss resume for this workspace"
              onClick={onDismiss}
              style={{
                width: 24,
                height: 24,
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                color: tokens.textGhost,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {primary && (
            <button
              type="button"
              onClick={() => onSuggestionClick(primary)}
              style={{
                marginTop: 8,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 10,
                border: `1px solid ${tokens.accent}33`,
                background: `${tokens.accent}12`,
                color: tokens.accent,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span style={{ textAlign: 'left' }}>{primary.label}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
