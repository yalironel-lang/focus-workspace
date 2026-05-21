/**
 * FreeSpaceCallout — atmospheric narrator bubble with spatial anchoring.
 *
 * Connection language:
 *   Not a diagram. Not a tooltip. Not an arrow.
 *   Three ambient layers suggest spatial relationship without naming it:
 *
 *   1. Target radiance   — a soft radial glow at the element. Warmth
 *                          emanating from the object, not pointing to it.
 *   2. Atmospheric smear — a blur-diffused light bleed between bubble and
 *                          target. So faint it registers subconsciously:
 *                          "the air is brighter over there."
 *   3. Narrator bubble   — positioned in a stable zone (not chasing).
 *                          Its amber left accent already faces the space.
 *
 * Zone anchoring:
 *   Two vertical positions only — bottom-third and top-third.
 *   Transitions between them with a slow CSS ease (0.7s).
 *   Never chases individual elements — the bubble settles into a zone
 *   and the step content changes independently.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalloutStep {
  id: string;
  /** CSS selector for the target element, or null for centered/no-target step. */
  target: string | null;
  headline: string;
  body: string;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface SmearProps {
  bubbleRect: DOMRect | null;
  spotlightRect: SpotlightRect | null;
  accent: string;
}

// ── Atmospheric smear — diffused light bleed, not a line ──────────────────────

function AtmosphericSmear({ bubbleRect, spotlightRect, accent }: SmearProps) {
  if (!bubbleRect || !spotlightRect) return null;

  const bx = bubbleRect.left + bubbleRect.width / 2;
  const by = bubbleRect.top + bubbleRect.height / 2;
  const tx = spotlightRect.centerX;
  const ty = spotlightRect.centerY;

  const dx = tx - bx;
  const dy = ty - by;
  const distance = Math.hypot(dx, dy);
  if (distance < 60) return null;

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const smearW = distance * 0.65;
  const smearH = 72;
  const cx = (bx + tx) / 2;
  const cy = (by + ty) / 2;

  // Parse accent hex to rgb for rgba usage
  const hex = accent.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 245;
  const g = parseInt(hex.slice(2, 4), 16) || 158;
  const b = parseInt(hex.slice(4, 6), 16) || 11;

  return (
    <div
      aria-hidden
      style={{
        position:      'fixed',
        zIndex:        991,
        pointerEvents: 'none',
        width:         smearW,
        height:        smearH,
        left:          cx - smearW / 2,
        top:           cy - smearH / 2,
        transform:     `rotate(${angle}deg)`,
        // Elliptical radial gradient — bright center, fully transparent edges
        // Both ends fade so neither tip "points" at anything
        background:    `radial-gradient(ellipse 55% 38% at 50% 50%, rgba(${r},${g},${b},0.09) 0%, transparent 100%)`,
        filter:        'blur(28px)',
        mixBlendMode:  'screen',
      }}
    />
  );
}

// ── Target radiance — warmth emanating from the element ───────────────────────

const GLOW_PAD = 36;

function TargetRadiance({
  spotlightRect,
  accent,
}: {
  spotlightRect: SpotlightRect | null;
  accent: string;
}) {
  if (!spotlightRect) return null;
  const hex = accent.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 245;
  const g = parseInt(hex.slice(2, 4), 16) || 158;
  const b = parseInt(hex.slice(4, 6), 16) || 11;

  return (
    <div
      aria-hidden
      style={{
        position:      'fixed',
        zIndex:        991,
        pointerEvents: 'none',
        top:           spotlightRect.top    - GLOW_PAD,
        left:          spotlightRect.left   - GLOW_PAD,
        width:         spotlightRect.width  + GLOW_PAD * 2,
        height:        spotlightRect.height + GLOW_PAD * 2,
        borderRadius:  24,
        // Soft radial warmth — no ring, no outline, no edge
        background:    `radial-gradient(ellipse at center, rgba(${r},${g},${b},0.07) 0%, transparent 68%)`,
        filter:        'blur(2px)',
        mixBlendMode:  'screen',
      }}
    />
  );
}

// ── Narrator bubble ───────────────────────────────────────────────────────────

interface BubbleProps {
  step: CalloutStep;
  stepIndex: number;
  totalSteps: number;
  isLastStep: boolean;
  tokens: AtmosphereTokens;
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
  bubbleRef: React.RefObject<HTMLDivElement | null>;
}

function NarratorBubble({
  step,
  stepIndex,
  totalSteps,
  isLastStep,
  tokens,
  onClose,
  onNext,
  onBack,
  bubbleRef,
}: BubbleProps) {
  const amber = tokens.accent;

  return (
    <div
      key={stepIndex}
      ref={bubbleRef}
      className="fw-callout-bubble-enter"
      style={{
        background:     'rgba(14,10,6,0.88)',
        backdropFilter: 'blur(24px)',
        borderLeft:     `2px solid ${amber}50`,
        borderRadius:   '0 14px 14px 0',
        padding:        '18px 18px 16px 20px',
        width:          268,
      }}
    >
      {/* Step dots + close */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              style={{
                display:    'block',
                width:      4,
                height:     4,
                borderRadius: '50%',
                background: i <= stepIndex ? `${amber}b0` : 'rgba(255,255,255,0.10)',
                transition: 'background 0.35s ease',
              }}
            />
          ))}
        </div>
        <button
          onClick={onClose}
          aria-label="Close guide"
          style={{
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            color:      'rgba(255,248,235,0.20)',
            fontSize:   16,
            lineHeight: 1,
            padding:    '0 2px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.50)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.20)'; }}
        >×</button>
      </div>

      {/* Headline */}
      <h3 style={{
        fontFamily:  'Georgia, serif',
        fontStyle:   'italic',
        fontWeight:  400,
        fontSize:    17,
        color:       'rgba(255,248,235,0.90)',
        margin:      '0 0 8px',
        lineHeight:  1.35,
      }}>
        {step.headline}
      </h3>

      {/* Body */}
      <p style={{
        fontFamily:  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        fontSize:    12.5,
        lineHeight:  1.64,
        color:       'rgba(255,248,235,0.42)',
        margin:      '0 0 18px',
      }}>
        {step.body}
      </p>

      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {stepIndex > 0 && (
          <button
            onClick={onBack}
            style={{
              background:  'none',
              border:      'none',
              cursor:      'pointer',
              color:       'rgba(255,248,235,0.26)',
              fontSize:    12,
              padding:     0,
              transition:  'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.55)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,248,235,0.26)'; }}
          >←</button>
        )}
        <button
          onClick={isLastStep ? onClose : onNext}
          style={{
            marginLeft:  'auto',
            background:  'none',
            border:      'none',
            cursor:      'pointer',
            padding:     0,
            color:       isLastStep ? amber : 'rgba(255,248,235,0.46)',
            fontSize:    12,
            fontWeight:  isLastStep ? 500 : 400,
            transition:  'color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = isLastStep
              ? '#fbbf24'
              : 'rgba(255,248,235,0.80)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = isLastStep
              ? amber
              : 'rgba(255,248,235,0.46)';
          }}
        >
          {isLastStep ? 'Begin →' : 'Next →'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface FreeSpaceCalloutProps {
  steps: CalloutStep[];
  tokens: AtmosphereTokens;
  isOpen: boolean;
  onClose: () => void;
}

export function FreeSpaceCallout({ steps, tokens, isOpen, onClose }: FreeSpaceCalloutProps) {
  const [stepIndex, setStepIndex]         = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [narratorZone, setNarratorZone]   = useState<'top' | 'bottom'>('bottom');
  const [bubbleDomRect, setBubbleDomRect] = useState<DOMRect | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setStepIndex(0);
      setSpotlightRect(null);
      setNarratorZone('bottom');
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  const currentStep = steps[stepIndex];
  const isLastStep  = stepIndex === steps.length - 1;

  // Measure target element
  const measureTarget = useCallback(() => {
    if (!currentStep?.target) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(currentStep.target);
    if (!el) {
      setSpotlightRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setSpotlightRect({
      top:     r.top,
      left:    r.left,
      width:   r.width,
      height:  r.height,
      centerX: r.left + r.width  / 2,
      centerY: r.top  + r.height / 2,
    });
    // Zone: if target center is in upper half → bubble goes to lower third, and vice versa
    const centerY = r.top + r.height / 2;
    setNarratorZone(centerY > window.innerHeight / 2 ? 'top' : 'bottom');
  }, [currentStep?.target]);

  useEffect(() => {
    if (!isOpen) return;
    measureTarget();
    window.addEventListener('resize', measureTarget);
    return () => window.removeEventListener('resize', measureTarget);
  }, [isOpen, measureTarget]);

  // Capture bubble DOM rect for smear computation
  useEffect(() => {
    if (!isOpen) return;
    const el = bubbleRef.current;
    if (!el) return;
    const update = () => setBubbleDomRect(el.getBoundingClientRect());
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [isOpen, stepIndex]);

  const narratorTop = narratorZone === 'bottom'
    ? 'calc(65vh)'   // target in top half → narrator in lower third
    : 'calc(18vh)';  // target in bottom half → narrator lifts to upper third

  const next  = () => setStepIndex(i => Math.min(i + 1, steps.length - 1));
  const back  = () => setStepIndex(i => Math.max(i - 1, 0));

  if (!isOpen || !currentStep) return null;

  return (
    <>
      {/* Near-invisible backdrop — workspace stays alive beneath */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed',
          inset:    0,
          zIndex:   990,
          background: 'rgba(14,10,6,0.10)',
        }}
      />

      {/* Target radiance — warmth at the element, no ring */}
      <TargetRadiance spotlightRect={spotlightRect} accent={tokens.accent} />

      {/* Atmospheric smear — diffused light between bubble and target */}
      <AtmosphericSmear
        bubbleRect={bubbleDomRect}
        spotlightRect={spotlightRect}
        accent={tokens.accent}
      />

      {/* Outer zone container — transitions between top/bottom zones */}
      <div
        style={{
          position:   'fixed',
          top:        narratorTop,
          left:       32,
          zIndex:     995,
          width:      268,
          transition: 'top 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <NarratorBubble
          step={currentStep}
          stepIndex={stepIndex}
          totalSteps={steps.length}
          isLastStep={isLastStep}
          tokens={tokens}
          onClose={onClose}
          onNext={next}
          onBack={back}
          bubbleRef={bubbleRef}
        />
      </div>
    </>
  );
}

// ── Trigger button — ambient node at rest ─────────────────────────────────────

interface TriggerProps {
  onClick: () => void;
  tokens: AtmosphereTokens;
}

export function FreeSpaceCalloutTrigger({ onClick, tokens }: TriggerProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Open workspace guide"
      className="fw-callout-trigger"
      style={{
        position:     'fixed',
        bottom:       24,
        right:        24,
        zIndex:       980,
        width:        30,
        height:       30,
        borderRadius: '50%',
        background:   `${tokens.accent}08`,
        border:       `1px solid ${tokens.accent}28`,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        cursor:       'pointer',
        transition:   'background 0.4s, border-color 0.4s, box-shadow 0.4s',
      }}
    >
      <span className="fw-callout-ambient-node" />
    </button>
  );
}
