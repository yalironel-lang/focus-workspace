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
  topOffset: number;
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

const AUTO_DISMISS_MS = 11_000;

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
  topOffset,
  continuity,
  resumeCopy,
  suggestions,
  onDismiss,
  onSuggestionClick,
}: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [focusedWithin, setFocusedWithin] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (hovered || focusedWithin) return;
    const timer = window.setTimeout(onDismiss, prefersReducedMotion ? AUTO_DISMISS_MS * 0.7 : AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [hovered, focusedWithin, onDismiss, prefersReducedMotion]);

  const variant = useMemo(() => variantForIntent(continuity.intent), [continuity.intent]);
  const primarySuggestions = suggestions.slice(0, 3);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusedWithin(true)}
      onBlurCapture={() => setFocusedWithin(false)}
      style={{
        position: 'fixed',
        top: topOffset + 10,
        left: '50%',
        transform: entered
          ? 'translateX(-50%) translateY(0)'
          : 'translateX(-50%) translateY(-6px)',
        zIndex: 55,
        width: 'min(760px, calc(100vw - 32px))',
        transition: prefersReducedMotion
          ? 'opacity 0.2s ease'
          : 'opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        opacity: entered ? 1 : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 14,
          padding: '12px 14px',
          borderRadius: 22,
          border: `1px solid ${tokens.cardBorderHover}`,
          background: `linear-gradient(180deg, ${tokens.cardBg}ee 0%, ${tokens.wellBg}ec 100%)`,
          boxShadow: `0 24px 72px rgba(0,0,0,0.38), 0 0 0 1px ${tokens.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
          backdropFilter: 'blur(28px) saturate(1.18)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.18)',
        }}
      >
        <div className="shrink-0" style={{ paddingTop: 2 }}>
          <WorkspaceMicroScene tokens={tokens} variant={variant} size="card" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
            style={{
              backgroundColor: `${tokens.accent}14`,
              border: `1px solid ${tokens.accent}22`,
              color: tokens.accent,
            }}
          >
            <Clock3 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
              Workspace Resume
            </span>
          </div>

          <div className="mt-3 flex items-start justify-between gap-4">
            <div style={{ minWidth: 0 }}>
              <div className="text-[12px] font-medium" style={{ color: tokens.textMuted }}>
                {resumeCopy?.headline ?? 'Continue where you left off'}
              </div>
              <div
                className="mt-1 text-[15px] font-semibold leading-[1.35]"
                style={{ color: tokens.textPrimary, letterSpacing: '-0.01em' }}
              >
                {resumeCopy?.subtitle ?? 'The workspace remembers your last working region.'}
              </div>
              {resumeCopy?.details?.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {resumeCopy.details.map(detail => (
                    <span
                      key={detail}
                      className="rounded-full px-2.5 py-1 text-[10px] font-medium"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.035)',
                        border: `1px solid ${tokens.cardBorder}`,
                        color: tokens.textGhost,
                      }}
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              aria-label="Dismiss resume layer"
              onClick={onDismiss}
              className="shrink-0 rounded-xl p-2.5 cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid transparent',
                color: tokens.textGhost,
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {primarySuggestions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {primarySuggestions.map(suggestion => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => onSuggestionClick(suggestion)}
                  className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-left cursor-pointer"
                  style={{
                    backgroundColor: suggestion.id === 'resume-anchor'
                      ? `${tokens.accent}18`
                      : 'rgba(255,255,255,0.035)',
                    border: suggestion.id === 'resume-anchor'
                      ? `1px solid ${tokens.accent}2e`
                      : `1px solid ${tokens.cardBorder}`,
                    color: suggestion.id === 'resume-anchor' ? tokens.accent : tokens.textSecondary,
                    transition: 'background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="text-[12px] font-semibold leading-tight">{suggestion.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight" style={{ color: tokens.textGhost }}>
                      {suggestion.subtitle}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
