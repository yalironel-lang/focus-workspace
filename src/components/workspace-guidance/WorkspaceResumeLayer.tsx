import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, X } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type {
  WorkspaceContinuityMemory,
  WorkspaceContinuitySuggestion,
} from '../../lib/workspaceContinuity';

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

export function WorkspaceResumeLayer({
  tokens,
  topOffset = 0,
  inShell = false,
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

  const primary = suggestions[0];

  if (!resumeCopy) return null;

  const showDock = expanded || hovered;

  return (
    <div
      onMouseEnter={() => {
        setHovered(true);
        setExpanded(true);
      }}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: inShell ? 'absolute' : 'fixed',
        top: inShell ? 8 : topOffset + 8,
        left: 16,
        right: 16,
        zIndex: 48,
        maxWidth: inShell ? undefined : 'min(640px, calc(100vw - 32px))',
        pointerEvents: 'none',
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(-4px)',
        transition: prefersReducedMotion
          ? 'opacity 0.2s ease'
          : 'opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {!showDock ? (
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
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderRadius: 12,
            border: `1px solid ${tokens.cardBorder}`,
            background: tokens.cardBg,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
            padding: '8px 10px',
            minHeight: 40,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 650,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: tokens.accent,
                flexShrink: 0,
              }}
            >
              {resumeCopy.headline}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: tokens.textPrimary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {resumeCopy.subtitle}
            </span>
          </div>
          {primary ? (
            <button
              type="button"
              onClick={() => onSuggestionClick(primary)}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${tokens.accent}33`,
                background: `${tokens.accent}12`,
                color: tokens.accent,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>{primary.label}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss resume for this workspace"
            onClick={onDismiss}
            style={{
              width: 28,
              height: 28,
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
      )}
    </div>
  );
}
