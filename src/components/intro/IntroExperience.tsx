/**
 * Cinematic entry — calm spatial OS awakening before the dashboard.
 * ~3.2s timeline; skippable; respects prefers-reduced-motion.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import './introExperience.css';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_CINEMATIC = [0.16, 1, 0.3, 1] as const;

/** Phase boundaries (ms from mount). */
const T_VOID_END = 1000;
const T_AWAKEN_END = 2100;
const T_REVEAL_END = 2900;
const T_EXIT_END = 3600;

const PARTICLES = [
  { x: '18%', y: '22%', d: 0, s: 2 },
  { x: '72%', y: '18%', d: 0.8, s: 1.5 },
  { x: '84%', y: '62%', d: 1.2, s: 2.2 },
  { x: '28%', y: '74%', d: 0.4, s: 1.8 },
  { x: '52%', y: '38%', d: 1.6, s: 1.2 },
  { x: '38%', y: '48%', d: 2.1, s: 1.6 },
];

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export function IntroExperience({ onComplete, onSkip }: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const framerReduced = useReducedMotion();
  const reduced = prefersReducedMotion || framerReduced;
  const [phase, setPhase] = useState<'void' | 'awaken' | 'reveal' | 'exit'>('void');
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  const skip = useCallback(() => {
    onSkip?.();
    finish();
  }, [finish, onSkip]);

  useEffect(() => {
    if (reduced) {
      const t = window.setTimeout(finish, 380);
      return () => window.clearTimeout(t);
    }

    const marks: Array<[number, typeof phase]> = [
      [T_VOID_END, 'awaken'],
      [T_AWAKEN_END, 'reveal'],
      [T_REVEAL_END, 'exit'],
      [T_EXIT_END, 'exit'],
    ];
    const timers = marks.map(([ms, p]) => window.setTimeout(() => setPhase(p), ms));
    const doneTimer = window.setTimeout(finish, T_EXIT_END);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(doneTimer);
    };
  }, [reduced, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const showRings = phase !== 'void';
  const showTitle = phase === 'reveal' || phase === 'exit';
  const showSubtitle = phase === 'reveal' || phase === 'exit';
  const exiting = phase === 'exit';

  const titleMotion = useMemo(
    () =>
      reduced
        ? { opacity: 1, y: 0, filter: 'blur(0px)' }
        : {
            initial: { opacity: 0, y: 18, filter: 'blur(12px)' },
            animate: {
              opacity: exiting ? 0 : 1,
              y: exiting ? -8 : 0,
              filter: exiting ? 'blur(8px)' : 'blur(0px)',
            },
            transition: {
              duration: exiting ? 0.55 : 0.85,
              ease: EASE_CINEMATIC,
            },
          },
    [reduced, exiting],
  );

  if (reduced) {
    return (
      <div
        className="fw-intro-root fixed inset-0 z-[500] flex items-center justify-center"
        role="presentation"
        aria-hidden
      >
        <p
          className="font-sans text-sm tracking-[0.2em] uppercase"
          style={{ color: 'rgba(148,163,184,0.9)' }}
        >
          Focus Workspace
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="fw-intro-root fixed inset-0 z-[500] overflow-hidden"
      role="presentation"
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: exiting ? 0.65 : 0.2, ease: EASE_OUT }}
      onAnimationComplete={() => {
        if (exiting) finish();
      }}
    >
      {/* Phase 1 — void atmosphere */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, ease: EASE_OUT }}
        style={{
          background: `
            radial-gradient(ellipse 90% 70% at 50% 42%, #0a0f1c 0%, #04060e 55%, #020308 100%)
          `,
        }}
      />

      <div className="fw-intro-noise pointer-events-none absolute inset-0" />
      <motion.div
        className="fw-intro-grid pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: showRings ? 0.55 : 0.28 }}
        transition={{ duration: 1.4, ease: EASE_OUT }}
      />

      {/* Ambient glows */}
      <motion.div
        className="fw-intro-glow-drift pointer-events-none absolute left-[12%] top-[8%] h-[42vmin] w-[42vmin] rounded-full"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 0.5, scale: 1 }}
        transition={{ duration: 1.6, ease: EASE_OUT }}
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 68%)',
          filter: 'blur(40px)',
        }}
      />
      <motion.div
        className="fw-intro-glow-drift pointer-events-none absolute bottom-[10%] right-[8%] h-[38vmin] w-[38vmin] rounded-full"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 0.38, scale: 1 }}
        transition={{ duration: 1.8, delay: 0.15, ease: EASE_OUT }}
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />

      {/* Particles */}
      {PARTICLES.map((p, i) => (
        <motion.div
          key={i}
          className="fw-intro-particle pointer-events-none absolute rounded-full"
          style={{
            left: p.x,
            top: p.y,
            width: p.s,
            height: p.s,
            background: 'rgba(199,210,254,0.9)',
            boxShadow: '0 0 8px rgba(99,102,241,0.35)',
            animationDelay: `${p.d}s`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'void' ? 0.2 : 0.35 }}
          transition={{ delay: 0.4 + p.d * 0.15, duration: 1.2 }}
        />
      ))}

      {/* Phase 2 — spatial rings */}
      {showRings && (
        <>
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="fw-intro-ring-pulse pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                width: `${38 + i * 14}vmin`,
                height: `${38 + i * 14}vmin`,
                borderColor: `rgba(99,102,241,${0.12 - i * 0.02})`,
                boxShadow: `0 0 ${40 + i * 20}px rgba(99,102,241,${0.08 - i * 0.02})`,
                animationDelay: `${i * 0.6}s`,
              }}
              initial={{ opacity: 0, scale: 0.72 }}
              animate={{
                opacity: exiting ? 0 : 0.45 - i * 0.08,
                scale: exiting ? 1.08 : 1,
              }}
              transition={{
                delay: 0.08 * i,
                duration: 1.1,
                ease: EASE_CINEMATIC,
              }}
            />
          ))}
          <motion.div
            className="pointer-events-none absolute left-1/2 top-[46%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: exiting ? 0 : 0.9, scale: 1 }}
            transition={{ delay: 0.35, duration: 0.7, ease: EASE_CINEMATIC }}
            style={{
              background: 'rgba(199,210,254,0.95)',
              boxShadow: '0 0 24px rgba(99,102,241,0.65), 0 0 48px rgba(139,92,246,0.35)',
            }}
          />
        </>
      )}

      {/* Vignette */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.85 }}
        transition={{ duration: 1.4 }}
        style={{
          background:
            'radial-gradient(ellipse 75% 68% at 50% 44%, transparent 35%, rgba(2,3,8,0.75) 100%)',
        }}
      />

      {/* Phase 3 — typography */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6"
        style={{ paddingTop: '4vh' }}
      >
        {showTitle && (
          <motion.h1
            className="text-center font-sans text-[clamp(2rem,5.5vw,3.25rem)] font-semibold tracking-[-0.04em]"
            style={{
              color: 'rgba(248,250,252,0.96)',
              textShadow: '0 0 48px rgba(99,102,241,0.25)',
            }}
            {...titleMotion}
          >
            Focus Workspace
          </motion.h1>
        )}
        {showSubtitle && (
          <motion.p
            className="mt-4 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.32em]"
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: exiting ? 0 : 0.72,
              y: exiting ? -4 : 0,
            }}
            transition={{ delay: 0.12, duration: 0.65, ease: EASE_OUT }}
            style={{ color: 'rgba(148,163,184,0.85)' }}
          >
            Entering workspace
          </motion.p>
        )}
      </motion.div>

      {/* Lens flare line */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[46%] h-px w-[min(42vw,320px)] -translate-x-1/2"
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{
          opacity: showTitle ? (exiting ? 0 : 0.35) : 0,
          scaleX: showTitle ? 1 : 0,
        }}
        transition={{ duration: 0.9, ease: EASE_CINEMATIC }}
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(199,210,254,0.5), transparent)',
        }}
      />

      <button
        type="button"
        onClick={skip}
        className="absolute right-5 top-5 z-10 rounded-full border px-3 py-1.5 font-sans text-[10px] font-medium uppercase tracking-[0.18em] transition-colors hover:bg-white/5 sm:right-7 sm:top-7"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          color: 'rgba(148,163,184,0.65)',
          backgroundColor: 'rgba(255,255,255,0.02)',
        }}
      >
        Skip
      </button>
    </motion.div>
  );
}
