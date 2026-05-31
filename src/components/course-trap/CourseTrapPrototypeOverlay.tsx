import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { CourseTrapPrototype } from '../../lib/courseTrap/courseTrapPrototypeLibrary';
import { getThreeTrapsForRound } from '../../lib/courseTrap/courseTrapPrototypeLibrary';
import type { CourseTrapSubject } from '../../lib/courseTrap/detectCourseTrapSubject';
import { subjectDisplayLabel } from '../../lib/courseTrap/detectCourseTrapSubject';
import {
  impulseChoiceA,
  impulseChoiceB,
  impulseHookLines,
  impulseSnapMessage,
  impulseStingLine,
} from '../../lib/courseTrap/impulseRoundDisplay';
import {
  advanceCourseTrapRound,
  exportCourseTrapMetricsToClipboard,
  logCourseTrapMetric,
  peekCourseTrapIndex,
} from '../../lib/courseTrap/courseTrapPrototypeMetrics';

const SNAP_MS = 450;

type Phase = 'subject' | 'start' | 'impulse' | 'snap' | 'summary';

interface ImpulseResult {
  trapId: string;
  hitTrap: boolean;
}

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  subject: CourseTrapSubject | null;
  pdfObjectId: string | null;
  onClose: () => void;
  onSubjectPick: (subject: CourseTrapSubject) => void;
}

export function CourseTrapPrototypeOverlay({
  open,
  tokens,
  subject,
  pdfObjectId,
  onClose,
  onSubjectPick,
}: Props) {
  const [phase, setPhase] = useState<Phase>('subject');
  const [visible, setVisible] = useState(false);
  const [roundTraps, setRoundTraps] = useState<CourseTrapPrototype[]>([]);
  const [impulseIndex, setImpulseIndex] = useState(0);
  const [snapMessage, setSnapMessage] = useState('');
  const [results, setResults] = useState<ImpulseResult[]>([]);
  const roundIdRef = useRef<string | null>(null);
  const roundCompletedRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSnapTimer = useCallback(() => {
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }, []);

  const beginRound = useCallback(
    (s: CourseTrapSubject) => {
      clearSnapTimer();
      const startIndex = peekCourseTrapIndex(s);
      const traps = getThreeTrapsForRound(s, startIndex);
      if (traps.length < 3) return;
      const roundId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      roundIdRef.current = roundId;
      roundCompletedRef.current = false;
      setRoundTraps(traps);
      setImpulseIndex(0);
      setResults([]);
      setSnapMessage('');
      setPhase('impulse');
      logCourseTrapMetric('round_started', {
        subject: s,
        pdfObjectId: pdfObjectId ?? undefined,
        roundId,
      });
    },
    [pdfObjectId, clearSnapTimer],
  );

  useLayoutEffect(() => {
    if (!open) {
      setVisible(false);
      clearSnapTimer();
      return;
    }
    roundCompletedRef.current = false;
    roundIdRef.current = null;
    setResults([]);
    setImpulseIndex(0);
    setSnapMessage('');
    setRoundTraps([]);
    if (subject) {
      setPhase('start');
    } else {
      setPhase('subject');
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open, subject, clearSnapTimer]);

  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!roundCompletedRef.current) {
        logCourseTrapMetric('round_dismissed', {
          subject: subject ?? undefined,
          pdfObjectId: pdfObjectId ?? undefined,
          roundId: roundIdRef.current ?? undefined,
        });
      }
      clearSnapTimer();
      onClose();
    };
    document.addEventListener('keydown', onDocKey, true);
    return () => document.removeEventListener('keydown', onDocKey, true);
  }, [open, onClose, subject, pdfObjectId, clearSnapTimer]);

  const finishRoundToSummary = useCallback(() => {
    roundCompletedRef.current = true;
    setPhase('summary');
    logCourseTrapMetric('round_completed', {
      subject: subject ?? undefined,
      pdfObjectId: pdfObjectId ?? undefined,
      roundId: roundIdRef.current ?? undefined,
    });
  }, [subject, pdfObjectId]);

  const pickPath = useCallback(
    (path: 'A' | 'B') => {
      const trap = roundTraps[impulseIndex];
      if (!trap || !subject || phase !== 'impulse') return;
      const hitTrap = path === trap.trapPath;
      const impulseNum = impulseIndex + 1;
      logCourseTrapMetric('impulse_answered', {
        trapId: trap.id,
        subject,
        pdfObjectId: pdfObjectId ?? undefined,
        path,
        impulseIndex: impulseNum,
        hitTrap,
        roundId: roundIdRef.current ?? undefined,
      });
      const nextResults: ImpulseResult[] = [...results, { trapId: trap.id, hitTrap }];
      setResults(nextResults);
      setSnapMessage(impulseSnapMessage(hitTrap));
      setPhase('snap');

      clearSnapTimer();
      snapTimerRef.current = setTimeout(() => {
        snapTimerRef.current = null;
        if (impulseIndex >= 2) {
          finishRoundToSummary();
          return;
        }
        setImpulseIndex(i => i + 1);
        setSnapMessage('');
        setPhase('impulse');
      }, SNAP_MS);
    },
    [
      roundTraps,
      impulseIndex,
      subject,
      phase,
      pdfObjectId,
      results,
      clearSnapTimer,
      finishRoundToSummary,
    ],
  );

  const handleStart = useCallback(() => {
    if (!subject) return;
    beginRound(subject);
  }, [subject, beginRound]);

  const handleAgain = useCallback(() => {
    if (!subject) return;
    logCourseTrapMetric('again_tapped', {
      subject,
      pdfObjectId: pdfObjectId ?? undefined,
      roundId: roundIdRef.current ?? undefined,
    });
    advanceCourseTrapRound(subject);
    beginRound(subject);
  }, [subject, pdfObjectId, beginRound]);

  const handleDone = useCallback(() => {
    logCourseTrapMetric('done_tapped', {
      subject: subject ?? undefined,
      pdfObjectId: pdfObjectId ?? undefined,
      roundId: roundIdRef.current ?? undefined,
    });
    clearSnapTimer();
    onClose();
  }, [onClose, subject, pdfObjectId, clearSnapTimer]);

  const handleExportMetrics = useCallback(async () => {
    const ok = await exportCourseTrapMetricsToClipboard();
    if (ok && typeof window !== 'undefined') {
      window.alert('Impulse Round metrics copied to clipboard.');
    }
  }, []);

  useEffect(() => () => clearSnapTimer(), [clearSnapTimer]);

  if (!open) return null;

  const currentTrap = roundTraps[impulseIndex];
  const dodgedCount = results.filter(r => !r.hitTrap).length;
  const lastHit = [...results].reverse().find(r => r.hitTrap);
  const stingTrap = lastHit ? roundTraps.find(t => t.id === lastHit.trapId) : undefined;

  return (
    <div
      className="fixed inset-0 z-[290] flex items-end sm:items-center justify-center pointer-events-none p-4"
      role="presentation"
    >
      <div
        data-fw-course-trap-root="1"
        className="pointer-events-auto w-full max-w-[min(400px,94vw)] rounded-2xl overflow-hidden"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.18s ease-out, transform 0.18s ease-out',
          backgroundColor: 'rgba(10,14,24,0.88)',
          border: `1px solid ${tokens.cardBorder}`,
          boxShadow: '0 20px 56px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(18px) saturate(1.1)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: tokens.textGhost }}
            >
              Impulse Round · V0
            </span>
            {import.meta.env.DEV && (
              <button
                type="button"
                className="text-[10px] underline opacity-60 hover:opacity-100"
                style={{ color: tokens.textGhost }}
                onClick={() => void handleExportMetrics()}
              >
                Export metrics
              </button>
            )}
          </div>

          {phase === 'subject' && (
            <>
              <p className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
                Which course is this PDF for?
              </p>
              <div className="flex flex-col gap-2">
                {(['calculus', 'economics', 'physics'] as CourseTrapSubject[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    className="w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-opacity hover:opacity-90"
                    style={{
                      backgroundColor: `${tokens.cardBg}cc`,
                      border: `1px solid ${tokens.cardBorder}`,
                      color: tokens.textPrimary,
                    }}
                    onClick={() => onSubjectPick(s)}
                  >
                    {subjectDisplayLabel(s)}
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === 'start' && subject && (
            <>
              <p className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
                {subjectDisplayLabel(subject)} · 60-second impulse check
              </p>
              <p className="text-sm leading-relaxed" style={{ color: tokens.textMuted }}>
                3 gut calls. See if the course traps you.
              </p>
              <button
                type="button"
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: `${tokens.accent}33`,
                  border: `1px solid ${tokens.accent}`,
                  color: tokens.textPrimary,
                }}
                onClick={handleStart}
              >
                Start
              </button>
            </>
          )}

          {(phase === 'impulse' || phase === 'snap') && currentTrap && subject && (
            <>
              <p className="text-[11px] font-semibold tabular-nums" style={{ color: tokens.textMuted }}>
                {impulseIndex + 1}/3
              </p>
              {(() => {
                const [hook1, hook2] = impulseHookLines(currentTrap);
                return (
                  <div className="flex flex-col gap-1">
                    <p className="text-base font-semibold leading-snug" style={{ color: tokens.textPrimary }}>
                      {hook1}
                    </p>
                    <p className="text-sm leading-snug" style={{ color: tokens.textSecondary }}>
                      {hook2}
                    </p>
                  </div>
                );
              })()}

              {phase === 'snap' ? (
                <p
                  className="text-lg font-semibold py-2"
                  style={{ color: snapMessage === 'Trap.' ? tokens.accent : tokens.textPrimary }}
                >
                  {snapMessage}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <ChoiceButton
                    label={impulseChoiceA(currentTrap)}
                    tokens={tokens}
                    onClick={() => pickPath('A')}
                  />
                  <ChoiceButton
                    label={impulseChoiceB(currentTrap)}
                    tokens={tokens}
                    onClick={() => pickPath('B')}
                  />
                </div>
              )}
            </>
          )}

          {phase === 'summary' && subject && (
            <>
              <p className="text-lg font-semibold" style={{ color: tokens.textPrimary }}>
                {dodgedCount}/3 traps dodged
              </p>
              {stingTrap && dodgedCount < 3 && (
                <p className="text-sm leading-relaxed" style={{ color: tokens.textSecondary }}>
                  {impulseStingLine(stingTrap)}
                </p>
              )}
              {dodgedCount === 3 && (
                <p className="text-sm leading-relaxed" style={{ color: tokens.textSecondary }}>
                  Clean round — try another?
                </p>
              )}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: `${tokens.accent}33`,
                    border: `1px solid ${tokens.accent}`,
                    color: tokens.textPrimary,
                  }}
                  onClick={handleAgain}
                >
                  Again
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${tokens.cardBorder}`,
                    color: tokens.textGhost,
                  }}
                  onClick={handleDone}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({
  label,
  tokens,
  onClick,
}: {
  label: string;
  tokens: AtmosphereTokens;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="w-full rounded-xl px-4 py-3 text-left text-sm leading-relaxed transition-opacity hover:opacity-90"
      style={{
        backgroundColor: `${tokens.cardBg}dd`,
        border: `1px solid ${tokens.cardBorder}`,
        color: tokens.textPrimary,
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
