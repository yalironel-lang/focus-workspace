import { ArrowRight, BookOpenCheck, Compass, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { ArrivalWorkspacePreview } from './ArrivalWorkspacePreview';

export type ArrivalExperienceAction = 'start' | 'library' | 'dismiss';

interface Props {
  tokens: AtmosphereTokens;
  reopened?: boolean;
  onAction: (action: ArrivalExperienceAction) => void;
}

const ENTER_MS = 420;
const EXIT_MS = 260;

export function ArrivalExperienceLayer({ tokens, reopened = false, onAction }: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [entered, setEntered] = useState(prefersReducedMotion);
  const [exiting, setExiting] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setEntered(true);
      return;
    }
    closeTimerRef.current = window.setTimeout(() => setEntered(true), 24);
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const runAction = useCallback(
    (action: ArrivalExperienceAction) => {
      if (exiting) return;
      if (prefersReducedMotion) {
        onAction(action);
        return;
      }
      setExiting(true);
      setEntered(false);
      closeTimerRef.current = window.setTimeout(() => onAction(action), EXIT_MS);
    },
    [exiting, onAction, prefersReducedMotion],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      runAction('dismiss');
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [runAction]);

  const triggerAction = useCallback(
    (action: ArrivalExperienceAction) => () => runAction(action),
    [runAction],
  );

  const motionStyle = useMemo(
    () => ({
      opacity: entered ? 1 : 0,
      transform: entered ? 'translateY(0px)' : 'translateY(14px)',
      transition: prefersReducedMotion
        ? 'opacity 0.16s ease'
        : `opacity ${exiting ? EXIT_MS : ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${exiting ? EXIT_MS : ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
    }),
    [entered, exiting, prefersReducedMotion],
  );

  return (
    <div
      className="fixed inset-0 z-[290]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arrival-experience-heading"
      onMouseDown={event => {
        if (event.target !== event.currentTarget) return;
        runAction('dismiss');
      }}
      style={{
        background: 'rgba(4, 6, 10, 0.58)',
        backdropFilter: 'blur(12px)',
        pointerEvents: exiting ? 'none' : 'auto',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 18% 18%, ${tokens.accent}12 0%, transparent 28%),
            radial-gradient(circle at 82% 14%, rgba(56,189,248,0.10) 0%, transparent 24%),
            linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.22) 100%)
          `,
        }}
      />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 md:px-8">
        <div
          className="relative w-full max-w-[1240px] overflow-hidden rounded-[34px] border"
          style={{
            ...motionStyle,
            background: 'linear-gradient(180deg, rgba(8,10,16,0.82) 0%, rgba(8,10,16,0.72) 100%)',
            borderColor: tokens.cardBorder,
            boxShadow: '0 40px 120px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <div className="grid min-h-[min(84vh,780px)] grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="relative z-10 flex flex-col justify-between px-6 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
              <div>
                <div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${tokens.cardBorder}`,
                    color: tokens.textGhost,
                  }}
                >
                  <BookOpenCheck className="h-3.5 w-3.5" strokeWidth={2.1} />
                  {reopened ? 'Workspace arrival' : 'First launch'}
                </div>

                <h1
                  id="arrival-experience-heading"
                  className="mt-6 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl lg:text-[42px]"
                  style={{ color: tokens.textPrimary }}
                >
                  Focus Workspace
                </h1>

                <p className="mt-4 max-w-[28rem] text-base leading-7 sm:text-[17px]" style={{ color: tokens.textSecondary }}>
                  A calm workspace for deep study and thinking.
                </p>
                <p className="mt-3 max-w-[29rem] text-sm leading-7 sm:text-[15px]" style={{ color: tokens.textMuted }}>
                  Notes, ideas, problems, and reference tools stay connected in one spatial place that feels ready when you return.
                </p>
              </div>

              <div className="mt-8 space-y-3">
                <button
                  type="button"
                  onClick={triggerAction('start')}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-transform active:scale-[0.99] sm:w-auto sm:min-w-[220px]"
                  style={{ backgroundColor: tokens.accent, color: '#09090b' }}
                >
                  Start workspace
                  <ArrowRight className="h-4 w-4" strokeWidth={2.3} />
                </button>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={triggerAction('library')}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors"
                    style={{
                      borderColor: tokens.cardBorder,
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      color: tokens.textSecondary,
                    }}
                  >
                    <Compass className="h-4 w-4" strokeWidth={2} />
                    Open library
                  </button>

                  <button
                    type="button"
                    onClick={triggerAction('dismiss')}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors"
                    style={{ color: tokens.textMuted }}
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                    {reopened ? 'Continue' : 'Skip'}
                  </button>
                </div>
              </div>
            </div>

            <div className="relative px-3 pb-3 pt-0 sm:px-4 sm:pb-4 lg:px-5 lg:pb-5 lg:pt-5">
              <div className="relative h-full w-full" style={{ minHeight: 320 }}>
                <ArrivalWorkspacePreview tokens={tokens} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
