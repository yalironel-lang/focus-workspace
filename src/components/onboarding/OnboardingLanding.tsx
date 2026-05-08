/**
 * OnboardingLanding — cinematic first-visit full-screen entry experience.
 *
 * Shown once, on very first open. Covers the entire viewport including the nav.
 * Layout: left 42% (headline + path choices) · right 58% (live workspace preview).
 *
 * After choosing a path, exit animation fires → onEnter(path) is called
 * → the real canvas appears beneath with the chosen template applied.
 */

import { useState, useEffect } from 'react';
import { ArrowRight, BookOpenCheck, Zap } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OnboardingPath = 'student-exam' | 'deep-work' | 'blank-canvas';

interface Props {
  tokens:  AtmosphereTokens;
  onEnter: (path: OnboardingPath) => void;
}

// ── Path definitions ──────────────────────────────────────────────────────────

const PATHS: {
  id:          OnboardingPath;
  emoji:       string;
  label:       string;
  description: string;
  tagColor:    string;
}[] = [
  {
    id:          'student-exam',
    emoji:       '🎓',
    label:       'Student Workspace',
    description: 'Courses, deadlines, exams, and notes.',
    tagColor:    '#6366f1',   // indigo — academic
  },
  {
    id:          'deep-work',
    emoji:       '🎯',
    label:       'Deep Work Setup',
    description: 'Focus sessions, execution flow, and momentum.',
    tagColor:    '#10b981',   // emerald — performance
  },
  {
    id:          'blank-canvas',
    emoji:       '✦',
    label:       'Blank Canvas',
    description: 'Start completely from scratch.',
    tagColor:    null as unknown as string,  // uses theme accent
  },
];

// ── Ambient background ────────────────────────────────────────────────────────

function AmbientBackground({ tokens }: { tokens: AtmosphereTokens }) {
  const PARTICLES = [
    { w: 2, top: '12%', left: '8%',  delay: '0s',    dur: '8s'  },
    { w: 3, top: '68%', left: '6%',  delay: '1.5s',  dur: '10s' },
    { w: 2, top: '80%', left: '22%', delay: '3.2s',  dur: '7s'  },
    { w: 2, top: '28%', left: '48%', delay: '0.8s',  dur: '9s'  },
    { w: 3, top: '54%', left: '68%', delay: '2.0s',  dur: '11s' },
    { w: 2, top: '18%', left: '75%', delay: '1.2s',  dur: '7s'  },
    { w: 2, top: '88%', left: '82%', delay: '0.4s',  dur: '9s'  },
    { w: 3, top: '40%', left: '91%', delay: '2.8s',  dur: '8s'  },
    { w: 2, top: '72%', left: '44%', delay: '4.1s',  dur: '10s' },
    { w: 2, top: '6%',  left: '58%', delay: '0.3s',  dur: '12s' },
  ] as const;

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
      aria-hidden="true"
    >
      {/* Radial glow blob — right side, where preview lives */}
      <div style={{
        position:         'absolute',
        top:              '-10%',
        right:            '-5%',
        width:            '65%',
        height:           '120%',
        background:       `radial-gradient(ellipse 60% 70% at 60% 40%, ${tokens.accent}12 0%, transparent 70%)`,
        pointerEvents:    'none',
      }} />
      {/* Secondary glow — bottom-left */}
      <div style={{
        position:      'absolute',
        bottom:        '-20%',
        left:          '0%',
        width:         '45%',
        height:        '80%',
        background:    `radial-gradient(ellipse 50% 60% at 30% 70%, ${tokens.accent}07 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      {/* Dot grid */}
      <div style={{
        position:           'absolute',
        inset:              0,
        backgroundImage:    `radial-gradient(circle, ${tokens.accent}18 1px, transparent 1px)`,
        backgroundSize:     '36px 36px',
        backgroundPosition: '18px 18px',
        opacity:            0.4,
      }} />
      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <div key={i} style={{
          position:        'absolute',
          top:             p.top,
          left:            p.left,
          width:           `${p.w}px`,
          height:          `${p.w}px`,
          borderRadius:    '50%',
          backgroundColor: tokens.accent,
          opacity:         0,
          animation:       `emptyStateParticle ${p.dur} ${p.delay} ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Workspace preview cards ───────────────────────────────────────────────────

function PreviewCard({
  children, tokens, style = {},
}: {
  children:  React.ReactNode;
  tokens:    AtmosphereTokens;
  style?:    React.CSSProperties;
}) {
  return (
    <div style={{
      backgroundColor: tokens.cardBg,
      border:          `1px solid ${tokens.cardBorder}`,
      borderRadius:    '14px',
      padding:         '14px',
      boxShadow:       `0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardLabel({ text, tokens }: { text: string; tokens: AtmosphereTokens }) {
  return (
    <p style={{
      fontFamily:    "'Space Grotesk', sans-serif",
      fontSize:      '8px',
      fontWeight:    700,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color:         tokens.textGhost,
      margin:        '0 0 8px',
    }}>
      {text}
    </p>
  );
}

// Focus Mode preview
function FocusModePreview({ tokens }: { tokens: AtmosphereTokens }) {
  return (
    <PreviewCard tokens={tokens}>
      <CardLabel text="Focus Mode" tokens={tokens} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Bullseye rings */}
        <div style={{ position: 'relative', width: '36px', height: '36px', flexShrink: 0 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `1.5px solid ${tokens.accent}25`,
          }} />
          <div style={{
            position: 'absolute', inset: '8px', borderRadius: '50%',
            border: `1.5px solid ${tokens.accent}45`,
          }} />
          <div style={{
            position: 'absolute', inset: '16px', borderRadius: '50%',
            backgroundColor: tokens.accent,
            boxShadow: `0 0 10px ${tokens.accentGlow}`,
            animation: 'previewDotPulse 2.5s ease-in-out infinite',
          }} />
        </div>
        <div style={{ minWidth: 0 }}>
          {/* Active indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
            <div style={{
              width:           '5px',
              height:          '5px',
              borderRadius:    '50%',
              backgroundColor: '#10b981',
              boxShadow:       '0 0 6px #10b98170',
              animation:       'previewDotPulse 1.8s ease-in-out infinite',
            }} />
            <span style={{ fontSize: '8px', fontWeight: 600, color: '#10b981', letterSpacing: '0.06em' }}>
              ACTIVE
            </span>
          </div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: tokens.textPrimary, margin: 0, letterSpacing: '-0.01em' }}>
            Organic Chemistry
          </p>
          <p style={{ fontSize: '10px', color: tokens.textMuted, margin: '2px 0 0' }}>
            Deep review session
          </p>
        </div>
      </div>
    </PreviewCard>
  );
}

// Deep Work Timer preview
function DeepWorkTimerPreview({ tokens }: { tokens: AtmosphereTokens }) {
  const r = 26;
  const circ = 2 * Math.PI * r;

  return (
    <PreviewCard tokens={tokens} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <CardLabel text="Deep Work" tokens={tokens} />
      <div style={{ position: 'relative', width: '72px', height: '72px' }}>
        <svg width="72" height="72" viewBox="0 0 72 72" style={{ display: 'block' }}>
          <circle cx="36" cy="36" r={r} fill="none" stroke={`${tokens.accent}22`} strokeWidth="3.5" />
          <circle
            cx="36" cy="36" r={r}
            fill="none" stroke={tokens.accent} strokeWidth="3.5"
            strokeDasharray={circ}
            strokeDashoffset={circ * 0.28}
            strokeLinecap="round"
            transform="rotate(-90 36 36)"
            style={{ animation: 'previewTimerArc 6s ease-in-out infinite alternate' }}
          />
        </svg>
        <div style={{
          position:   'absolute', inset: 0,
          display:    'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      '13px',
            fontWeight:    700,
            color:         tokens.accent,
            letterSpacing: '0.04em',
          }}>
            25:00
          </span>
          <span style={{ fontSize: '8px', color: tokens.textGhost, marginTop: '1px' }}>remaining</span>
        </div>
      </div>
    </PreviewCard>
  );
}

// Quick Capture preview
function QuickCapturePreview({ tokens }: { tokens: AtmosphereTokens }) {
  return (
    <PreviewCard tokens={tokens} style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Zap style={{ width: '12px', height: '12px', color: tokens.accent, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: tokens.textGhost }}>Capture a thought</span>
          <span style={{
            width:           '1.5px',
            height:          '13px',
            backgroundColor: tokens.accent,
            borderRadius:    '1px',
            animation:       'previewCursorBlink 1s step-end infinite',
          }} />
        </div>
      </div>
    </PreviewCard>
  );
}

// Momentum preview
function MomentumPreview({ tokens }: { tokens: AtmosphereTokens }) {
  const BARS = [
    { label: 'Organic Chem', pct: 0.78, delay: '0s' },
    { label: 'Physics',      pct: 0.45, delay: '0.3s' },
    { label: 'Final Essay',  pct: 0.62, delay: '0.6s' },
  ] as const;

  return (
    <PreviewCard tokens={tokens}>
      <CardLabel text="Momentum" tokens={tokens} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {BARS.map(bar => (
          <div key={bar.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontSize: '9px', color: tokens.textMuted }}>{bar.label}</span>
              <span style={{ fontSize: '9px', color: tokens.textGhost, fontFamily: "'Space Grotesk', monospace" }}>
                {Math.round(bar.pct * 100)}%
              </span>
            </div>
            <div style={{ height: '3px', borderRadius: '2px', backgroundColor: `${tokens.accent}18`, overflow: 'hidden' }}>
              <div style={{
                height:          '100%',
                borderRadius:    '2px',
                width:           `${bar.pct * 100}%`,
                backgroundColor: tokens.accent,
                transformOrigin: 'left',
                animation:       `previewBarFill 1.2s ${bar.delay} var(--fw-ease-smooth, cubic-bezier(0.32,0.72,0,1)) both`,
              }} />
            </div>
          </div>
        ))}
      </div>
    </PreviewCard>
  );
}

// Note preview
function NotePreview({ tokens }: { tokens: AtmosphereTokens }) {
  return (
    <PreviewCard tokens={tokens}>
      <CardLabel text="Notes" tokens={tokens} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {[1, 0.9, 1, 0.7, 0.85].map((w, i) => (
          <div key={i} style={{
            height:          '2.5px',
            borderRadius:    '2px',
            width:           `${w * 100}%`,
            backgroundColor: i === 0 ? tokens.textMuted + 'aa' : tokens.textGhost + '55',
          }} />
        ))}
        {/* Blinking cursor at end */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
          <div style={{ width: '35%', height: '2.5px', borderRadius: '2px', backgroundColor: tokens.textGhost + '30' }} />
          <span style={{
            width:           '1px',
            height:          '10px',
            backgroundColor: tokens.accent + 'aa',
            animation:       'previewCursorBlink 1.4s step-end infinite',
          }} />
        </div>
      </div>
    </PreviewCard>
  );
}

// Full workspace preview composite
function WorkspacePreview({ tokens }: { tokens: AtmosphereTokens }) {
  return (
    <div
      style={{
        width:     '100%',
        maxWidth:  '420px',
        animation: 'previewFloat 6s ease-in-out infinite',
      }}
    >
      {/* Browser-like chrome strip */}
      <div style={{
        backgroundColor: tokens.cardBg,
        border:          `1px solid ${tokens.cardBorderHover}`,
        borderBottom:    'none',
        borderRadius:    '14px 14px 0 0',
        padding:         '10px 14px',
        display:         'flex',
        alignItems:      'center',
        gap:             '6px',
      }}>
        {/* Traffic lights */}
        {['#ff5f57', '#ffbd2e', '#28c840'].map((c, i) => (
          <div key={i} style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: c, opacity: 0.7 }} />
        ))}
        {/* URL bar */}
        <div style={{
          flex:            1,
          height:          '22px',
          marginLeft:      '6px',
          borderRadius:    '6px',
          backgroundColor: tokens.wellBg,
          border:          `1px solid ${tokens.cardBorder}`,
          display:         'flex',
          alignItems:      'center',
          padding:         '0 8px',
          gap:             '6px',
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tokens.accent, opacity: 0.6 }} />
          <span style={{
            fontFamily:  "'Space Grotesk', monospace",
            fontSize:    '9px',
            color:       tokens.textGhost,
            letterSpacing: '0.02em',
          }}>
            focus / workspace
          </span>
        </div>
      </div>

      {/* Main preview body */}
      <div style={{
        backgroundColor: tokens.pageBg,
        border:          `1px solid ${tokens.cardBorderHover}`,
        borderTop:       'none',
        borderRadius:    '0 0 14px 14px',
        padding:         '16px',
        boxShadow:       `0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px ${tokens.accent}15`,
        display:         'flex',
        flexDirection:   'column',
        gap:             '10px',
      }}>
        {/* Row 1: Focus Mode + Timer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <FocusModePreview tokens={tokens} />
          <DeepWorkTimerPreview tokens={tokens} />
        </div>

        {/* Row 2: Quick Capture (full width) */}
        <QuickCapturePreview tokens={tokens} />

        {/* Row 3: Momentum + Note */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <MomentumPreview tokens={tokens} />
          <NotePreview tokens={tokens} />
        </div>
      </div>

      {/* Preview label below */}
      <p style={{
        textAlign:     'center',
        marginTop:     '12px',
        fontFamily:    "'Space Grotesk', sans-serif",
        fontSize:      '9px',
        fontWeight:    600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color:         tokens.textGhost,
        opacity:       0.6,
      }}>
        Your workspace, live
      </p>
    </div>
  );
}

// ── Path card ─────────────────────────────────────────────────────────────────

function PathCard({
  path, tokens, index, onSelect,
}: {
  path:     typeof PATHS[number];
  tokens:   AtmosphereTokens;
  index:    number;
  onSelect: () => void;
}) {
  const accentColor = path.tagColor ?? tokens.accent;

  return (
    <button
      onClick={onSelect}
      style={{
        display:         'flex',
        alignItems:      'center',
        gap:             '14px',
        width:           '100%',
        padding:         '14px 16px',
        borderRadius:    '14px',
        border:          `1px solid ${tokens.cardBorder}`,
        backgroundColor: tokens.cardBg,
        cursor:          'pointer',
        textAlign:       'left',
        transition:      'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        animation:       `slideUp 0.5s ${0.35 + index * 0.1}s cubic-bezier(0.32,0.72,0,1) both`,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor     = `${accentColor}55`;
        el.style.backgroundColor = `${accentColor}08`;
        el.style.transform       = 'translateY(-2px)';
        el.style.boxShadow       = `0 8px 28px ${accentColor}25`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor     = tokens.cardBorder;
        el.style.backgroundColor = tokens.cardBg;
        el.style.transform       = 'none';
        el.style.boxShadow       = 'none';
      }}
    >
      {/* Icon */}
      <div style={{
        width:           '40px',
        height:          '40px',
        borderRadius:    '11px',
        backgroundColor: `${accentColor}14`,
        border:          `1px solid ${accentColor}25`,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        fontSize:        '18px',
        lineHeight:      1,
        flexShrink:      0,
      }}>
        {path.emoji}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily:    "'Plus Jakarta Sans', sans-serif",
          fontSize:      '13px',
          fontWeight:    700,
          color:         tokens.textPrimary,
          margin:        0,
          letterSpacing: '-0.01em',
        }}>
          {path.label}
        </p>
        <p style={{
          fontSize:   '11px',
          color:      tokens.textMuted,
          margin:     '3px 0 0',
          lineHeight: 1.45,
        }}>
          {path.description}
        </p>
      </div>

      {/* Arrow */}
      <ArrowRight
        style={{
          width:     '15px',
          height:    '15px',
          color:     tokens.textGhost,
          flexShrink: 0,
          transition: 'transform 0.2s ease, color 0.2s ease',
        }}
        className="path-arrow"
      />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OnboardingLanding({ tokens, onEnter }: Props) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Staggered entrance
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const exit = (path: OnboardingPath) => {
    setExiting(true);
    setTimeout(() => onEnter(path), 380);
  };

  return (
    <div
      style={{
        position:             'fixed',
        inset:                0,
        zIndex:               70,
        backgroundColor:      tokens.pageBg,
        color:                tokens.textPrimary,
        opacity:              visible && !exiting ? 1 : 0,
        transform:            exiting ? 'scale(0.98)' : 'scale(1)',
        transition:           'opacity 0.4s cubic-bezier(0.32,0.72,0,1), transform 0.4s cubic-bezier(0.32,0.72,0,1)',
        overflowY:            'auto',
        display:              'flex',
        flexDirection:        'column',
      }}
    >
      <AmbientBackground tokens={tokens} />

      {/* ── Content ─────────────────────────────────────────── */}
      <div
        style={{
          position:       'relative',
          zIndex:         1,
          flex:           1,
          display:        'flex',
          flexDirection:  'column',
          maxWidth:       '1180px',
          width:          '100%',
          margin:         '0 auto',
          padding:        '0 32px',
        }}
      >
        {/* ── Top nav strip ───────────────────────────────── */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            height:         '56px',
            flexShrink:     0,
            animation:      'slideUp 0.4s 0.05s cubic-bezier(0.32,0.72,0,1) both',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width:           '26px',
              height:          '26px',
              borderRadius:    '7px',
              backgroundColor: tokens.accent,
              boxShadow:       `0 0 12px ${tokens.accentGlow}`,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
            }}>
              <BookOpenCheck style={{ width: '14px', height: '14px', color: '#000' }} strokeWidth={2.5} />
            </div>
            <span style={{
              fontFamily:    "'Plus Jakarta Sans', sans-serif",
              fontSize:      '15px',
              fontWeight:    800,
              letterSpacing: '-0.02em',
              color:         tokens.textPrimary,
            }}>
              Focus
            </span>
          </div>

          {/* Keyboard hint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: tokens.textGhost }}>
              Press
            </span>
            <kbd style={{
              fontFamily:      "'Space Grotesk', monospace",
              fontSize:        '10px',
              fontWeight:      600,
              padding:         '2px 6px',
              borderRadius:    '6px',
              border:          `1px solid ${tokens.cardBorderHover}`,
              backgroundColor: tokens.cardBg,
              color:           tokens.textMuted,
              letterSpacing:   '0.02em',
            }}>
              ⌘K
            </kbd>
            <span style={{ fontSize: '11px', color: tokens.textGhost }}>
              anytime to add anything
            </span>
          </div>
        </div>

        {/* ── Main two-column layout ───────────────────────── */}
        <div
          style={{
            flex:            1,
            display:         'flex',
            alignItems:      'center',
            gap:             '64px',
            paddingBottom:   '48px',
          }}
        >
          {/* ── Left: copy + path cards ─────────────────── */}
          <div style={{ flex: '0 0 auto', width: 'min(420px, 42%)', display: 'flex', flexDirection: 'column' }}>

            {/* Product type label */}
            <div
              style={{
                display:         'inline-flex',
                alignItems:      'center',
                gap:             '7px',
                padding:         '4px 10px 4px 8px',
                borderRadius:    '20px',
                border:          `1px solid ${tokens.accent}30`,
                backgroundColor: `${tokens.accent}10`,
                marginBottom:    '22px',
                width:           'fit-content',
                animation:       'slideUp 0.5s 0.1s cubic-bezier(0.32,0.72,0,1) both',
              }}
            >
              <span style={{
                width:           '6px',
                height:          '6px',
                borderRadius:    '50%',
                backgroundColor: tokens.accent,
                boxShadow:       `0 0 8px ${tokens.accentGlow}`,
                animation:       'previewDotPulse 2s ease-in-out infinite',
                flexShrink:      0,
              }} />
              <span style={{
                fontFamily:    "'Space Grotesk', sans-serif",
                fontSize:      '9px',
                fontWeight:    700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color:         tokens.accent,
              }}>
                Personal operating system
              </span>
            </div>

            {/* Headline */}
            <h1
              style={{
                fontFamily:    "'Plus Jakarta Sans', sans-serif",
                fontSize:      'clamp(28px, 3.5vw, 42px)',
                fontWeight:    800,
                letterSpacing: '-0.035em',
                lineHeight:    1.1,
                color:         tokens.textPrimary,
                marginBottom:  '16px',
                animation:     'slideUp 0.55s 0.15s cubic-bezier(0.32,0.72,0,1) both',
              }}
            >
              Build a workspace{' '}
              <span style={{
                color:      tokens.accent,
                textShadow: `0 0 40px ${tokens.accentGlow}`,
              }}>
                that thinks
              </span>
              {' '}like you.
            </h1>

            {/* Subheadline */}
            <p
              style={{
                fontSize:      '14px',
                lineHeight:    1.72,
                color:         tokens.textMuted,
                marginBottom:  '32px',
                maxWidth:      '360px',
                animation:     'slideUp 0.55s 0.22s cubic-bezier(0.32,0.72,0,1) both',
              }}
            >
              Organize focus, study, projects, notes, and momentum
              in one adaptive space — made exactly for how your mind works.
            </p>

            {/* Path cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {PATHS.map((path, i) => (
                <PathCard
                  key={path.id}
                  path={path}
                  tokens={tokens}
                  index={i}
                  onSelect={() => exit(path.id)}
                />
              ))}
            </div>

            {/* Footer note */}
            <p
              style={{
                fontSize:   '11px',
                color:      tokens.textGhost,
                lineHeight: 1.6,
                animation:  'slideUp 0.5s 0.65s cubic-bezier(0.32,0.72,0,1) both',
              }}
            >
              You can change or reset your workspace at any time.
            </p>
          </div>

          {/* ── Right: live workspace preview ───────────── */}
          <div
            style={{
              flex:           1,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              minWidth:       0,
              animation:      'slideUp 0.6s 0.3s cubic-bezier(0.32,0.72,0,1) both',
            }}
            className="hidden md:flex"
          >
            <WorkspacePreview tokens={tokens} />
          </div>
        </div>
      </div>
    </div>
  );
}
