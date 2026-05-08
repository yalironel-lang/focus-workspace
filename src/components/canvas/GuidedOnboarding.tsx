/**
 * GuidedOnboarding — cinematic first-visit experience.
 *
 * Shows once, when the user has no content and hasn't seen it before.
 * Two steps:
 *   0 — Ambient welcome: "This space is yours."
 *   1 — Choose a path: template, add manually, or blank canvas.
 *
 * On any choice: calls onComplete() (which sets fw_onboarding_v1 in localStorage)
 * so the normal CanvasEmptyState or canvas renders.
 */

import { useState, useEffect } from 'react';
import { ArrowRight, Sparkles, Layout, Plus } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { StarterTemplate } from '../../data/starterTemplates';

interface Props {
  tokens:           AtmosphereTokens;
  starterTemplates: StarterTemplate[];
  onComplete:       () => void;
  onApplyTemplate:  (id: string) => void;
  onOpenAdd:        () => void;
}

// ── Step 0 — Welcome ──────────────────────────────────────────────────────────

function WelcomeStep({
  tokens,
  onNext,
  onSkip,
}: {
  tokens:  AtmosphereTokens;
  onNext:  () => void;
  onSkip:  () => void;
}) {
  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        textAlign:      'center',
        maxWidth:       '480px',
        width:          '100%',
        animation:      'slideUp 0.6s 0.15s cubic-bezier(0.32,0.72,0,1) both',
      }}
    >
      {/* ── Ambient rings ─────────────────────────────────────── */}
      <div
        style={{
          position:    'relative',
          width:       '100px',
          height:      '100px',
          marginBottom: '36px',
          flexShrink:  0,
        }}
      >
        {/* Outermost ring */}
        <div style={{
          position:     'absolute',
          inset:        0,
          borderRadius: '50%',
          border:       `1px solid ${tokens.cardBorder}`,
          animation:    'onboardRingPulse 3.5s ease-in-out infinite',
        }} />
        {/* Middle ring */}
        <div style={{
          position:     'absolute',
          inset:        '14px',
          borderRadius: '50%',
          border:       `1px solid ${tokens.accent}30`,
          boxShadow:    `0 0 36px ${tokens.accentGlow}`,
          animation:    'onboardRingPulse 3.5s 0.6s ease-in-out infinite',
        }} />
        {/* Inner ring */}
        <div style={{
          position:     'absolute',
          inset:        '28px',
          borderRadius: '50%',
          border:       `1px solid ${tokens.accent}50`,
          animation:    'onboardRingPulse 3.5s 1.2s ease-in-out infinite',
        }} />
        {/* Center glyph */}
        <div style={{
          position:        'absolute',
          inset:           '38px',
          borderRadius:    '50%',
          backgroundColor: `${tokens.accent}18`,
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          boxShadow:       `0 0 24px ${tokens.accentGlow}`,
        }}>
          <span style={{
            fontSize:   '11px',
            color:      tokens.accent,
            lineHeight: 1,
            filter:     `drop-shadow(0 0 6px ${tokens.accentGlow})`,
            animation:  'onboardGlyphFloat 4s ease-in-out infinite',
          }}>
            ✦
          </span>
        </div>
      </div>

      {/* ── Headline ──────────────────────────────────────────── */}
      <h1
        style={{
          fontFamily:    "'Plus Jakarta Sans', sans-serif",
          fontSize:      'clamp(26px, 5vw, 36px)',
          fontWeight:    800,
          letterSpacing: '-0.03em',
          lineHeight:    1.12,
          color:         tokens.textPrimary,
          marginBottom:  '14px',
          animation:     'slideUp 0.5s 0.3s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        This space is yours.
      </h1>

      <p
        style={{
          fontSize:      '15px',
          lineHeight:    1.7,
          color:         tokens.textMuted,
          maxWidth:      '360px',
          marginBottom:  '40px',
          animation:     'slideUp 0.5s 0.45s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        Build it around how you think — not the other way around.
        Add what helps. Remove what doesn't.
      </p>

      {/* ── CTAs ──────────────────────────────────────────────── */}
      <div
        style={{
          display:   'flex',
          gap:       '10px',
          animation: 'slideUp 0.5s 0.55s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        <button
          onClick={onNext}
          style={{
            display:         'flex',
            alignItems:      'center',
            gap:             '7px',
            padding:         '11px 22px',
            borderRadius:    '12px',
            backgroundColor: tokens.accent,
            border:          'none',
            color:           '#000',
            fontSize:        '13px',
            fontWeight:      700,
            cursor:          'pointer',
            boxShadow:       `0 4px 20px ${tokens.accentGlow}`,
            transition:      'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.backgroundColor = tokens.accentHover;
            el.style.transform = 'translateY(-1px) scale(1.02)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.backgroundColor = tokens.accent;
            el.style.transform = 'none';
          }}
        >
          Shape it
          <ArrowRight style={{ width: '14px', height: '14px' }} strokeWidth={2.5} />
        </button>

        <button
          onClick={onSkip}
          style={{
            padding:         '11px 18px',
            borderRadius:    '12px',
            backgroundColor: 'transparent',
            border:          `1px solid ${tokens.cardBorder}`,
            color:           tokens.textGhost,
            fontSize:        '13px',
            fontWeight:      500,
            cursor:          'pointer',
            transition:      'all 0.15s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = tokens.cardBorderHover;
            el.style.color = tokens.textMuted;
            el.style.backgroundColor = tokens.cardBorder;
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = tokens.cardBorder;
            el.style.color = tokens.textGhost;
            el.style.backgroundColor = 'transparent';
          }}
        >
          Skip intro
        </button>
      </div>

      {/* ── Step indicator ────────────────────────────────────── */}
      <div
        style={{
          display:       'flex',
          gap:           '5px',
          marginTop:     '28px',
          animation:     'slideUp 0.5s 0.6s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        {[0, 1].map(i => (
          <div
            key={i}
            style={{
              width:           i === 0 ? '16px' : '5px',
              height:          '5px',
              borderRadius:    '3px',
              backgroundColor: i === 0 ? tokens.accent : tokens.cardBorderHover,
              transition:      'all 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Step 1 — Choose path ──────────────────────────────────────────────────────

function ChooseStep({
  tokens,
  starterTemplates,
  onApplyTemplate,
  onOpenAdd,
  onBlank,
}: {
  tokens:           AtmosphereTokens;
  starterTemplates: StarterTemplate[];
  onApplyTemplate:  (id: string) => void;
  onOpenAdd:        () => void;
  onBlank:          () => void;
}) {
  const [showTemplates, setShowTemplates] = useState(false);

  const CHOICES = [
    {
      id:      'template',
      icon:    <Sparkles style={{ width: '18px', height: '18px' }} strokeWidth={1.5} />,
      label:   'Start from a template',
      sub:     'Student, focus sessions, capture hub, and more.',
      accent:  false,
    },
    {
      id:      'add',
      icon:    <Plus style={{ width: '18px', height: '18px' }} strokeWidth={2} />,
      label:   'Add something now',
      sub:     'Note, timer, checklist, quote, image…',
      accent:  true,
    },
    {
      id:      'blank',
      icon:    <Layout style={{ width: '18px', height: '18px' }} strokeWidth={1.5} />,
      label:   'Start with a blank canvas',
      sub:     "Clean slate. Add things when you're ready.",
      accent:  false,
    },
  ] as const;

  if (showTemplates) {
    return (
      <div
        style={{
          maxWidth:  '580px',
          width:     '100%',
          animation: 'slideUp 0.35s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{
            fontFamily:    "'Plus Jakarta Sans', sans-serif",
            fontSize:      '18px',
            fontWeight:    800,
            letterSpacing: '-0.02em',
            color:         tokens.textPrimary,
            margin:        0,
          }}>
            Choose a starter layout
          </h2>
          <button
            onClick={() => setShowTemplates(false)}
            style={{
              fontSize:   '11px',
              color:      tokens.textGhost,
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              padding:    '4px 8px',
            }}
          >
            ← Back
          </button>
        </div>

        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap:                 '10px',
        }}>
          {starterTemplates.filter(t => t.id !== 'blank-canvas').map((t, i) => (
            <button
              key={t.id}
              onClick={() => onApplyTemplate(t.id)}
              style={{
                display:         'flex',
                flexDirection:   'column',
                alignItems:      'flex-start',
                gap:             '8px',
                padding:         '16px',
                borderRadius:    '14px',
                border:          `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.cardBg,
                cursor:          'pointer',
                textAlign:       'left',
                transition:      'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                animation:       `slideUp 0.3s ${i * 40}ms cubic-bezier(0.32,0.72,0,1) both`,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.borderColor     = `${tokens.accent}50`;
                el.style.backgroundColor = tokens.accentSubtle;
                el.style.transform       = 'translateY(-2px)';
                el.style.boxShadow       = `0 6px 20px ${tokens.accentGlow}`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.borderColor     = tokens.cardBorder;
                el.style.backgroundColor = tokens.cardBg;
                el.style.transform       = 'none';
                el.style.boxShadow       = 'none';
              }}
            >
              <span style={{ fontSize: '22px', lineHeight: 1 }}>{t.emoji}</span>
              <div>
                <p style={{ fontSize: '12px', fontWeight: 700, color: tokens.textPrimary, margin: 0, letterSpacing: '-0.01em' }}>
                  {t.name}
                </p>
                <p style={{ fontSize: '10px', color: tokens.textMuted, margin: '3px 0 0', lineHeight: 1.4 }}>
                  {t.tagline}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '5px', marginTop: '24px', justifyContent: 'center' }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              width: i === 1 ? '16px' : '5px', height: '5px',
              borderRadius: '3px',
              backgroundColor: i === 1 ? tokens.accent : tokens.cardBorderHover,
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        maxWidth:      '520px',
        width:         '100%',
        animation:     'slideUp 0.4s cubic-bezier(0.32,0.72,0,1) both',
      }}
    >
      <h2 style={{
        fontFamily:    "'Plus Jakarta Sans', sans-serif",
        fontSize:      'clamp(18px, 4vw, 24px)',
        fontWeight:    800,
        letterSpacing: '-0.02em',
        color:         tokens.textPrimary,
        marginBottom:  '6px',
        textAlign:     'center',
        animation:     'slideUp 0.4s 0.05s cubic-bezier(0.32,0.72,0,1) both',
      }}>
        How do you want to start?
      </h2>
      <p style={{
        fontSize:     '13px',
        color:        tokens.textMuted,
        marginBottom: '28px',
        textAlign:    'center',
        animation:    'slideUp 0.4s 0.1s cubic-bezier(0.32,0.72,0,1) both',
      }}>
        You can change everything later — nothing is permanent.
      </p>

      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap:                 '10px',
          width:               '100%',
          animation:           'slideUp 0.4s 0.15s cubic-bezier(0.32,0.72,0,1) both',
        }}
      >
        {CHOICES.map(choice => (
          <button
            key={choice.id}
            onClick={() => {
              if (choice.id === 'template') setShowTemplates(true);
              else if (choice.id === 'add')  onOpenAdd();
              else                           onBlank();
            }}
            style={{
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'flex-start',
              gap:             '12px',
              padding:         '20px 18px',
              borderRadius:    '16px',
              border:          `1.5px solid ${choice.accent ? tokens.accent + '50' : tokens.cardBorder}`,
              backgroundColor: choice.accent ? `${tokens.accent}10` : tokens.cardBg,
              cursor:          'pointer',
              textAlign:       'left',
              transition:      'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor     = choice.accent ? tokens.accent : `${tokens.accent}50`;
              el.style.backgroundColor = choice.accent ? `${tokens.accent}18` : tokens.accentSubtle;
              el.style.transform       = 'translateY(-3px) scale(1.01)';
              el.style.boxShadow       = `0 8px 28px ${tokens.accentGlow}`;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor     = choice.accent ? `${tokens.accent}50` : tokens.cardBorder;
              el.style.backgroundColor = choice.accent ? `${tokens.accent}10` : tokens.cardBg;
              el.style.transform       = 'none';
              el.style.boxShadow       = 'none';
            }}
          >
            <div style={{
              width:           '36px',
              height:          '36px',
              borderRadius:    '10px',
              backgroundColor: choice.accent ? tokens.accent : `${tokens.accent}15`,
              border:          `1px solid ${choice.accent ? 'transparent' : tokens.accent + '25'}`,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              color:           choice.accent ? '#000' : tokens.accent,
              flexShrink:      0,
              boxShadow:       choice.accent ? `0 4px 14px ${tokens.accentGlow}` : 'none',
            }}>
              {choice.icon}
            </div>
            <div>
              <p style={{
                fontFamily:    "'Plus Jakarta Sans', sans-serif",
                fontSize:      '13px',
                fontWeight:    700,
                color:         tokens.textPrimary,
                margin:        0,
                letterSpacing: '-0.01em',
              }}>
                {choice.label}
              </p>
              <p style={{
                fontSize:   '11px',
                color:      tokens.textMuted,
                margin:     '4px 0 0',
                lineHeight: 1.45,
              }}>
                {choice.sub}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '5px', marginTop: '28px' }}>
        {[0, 1].map(i => (
          <div key={i} style={{
            width: i === 1 ? '16px' : '5px', height: '5px',
            borderRadius: '3px',
            backgroundColor: i === 1 ? tokens.accent : tokens.cardBorderHover,
            transition: 'all 0.3s ease',
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function GuidedOnboarding({ tokens, starterTemplates, onComplete, onApplyTemplate, onOpenAdd }: Props) {
  const [step,    setStep]    = useState<0 | 1>(0);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Stagger entrance
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const exit = (fn: () => void) => {
    setExiting(true);
    setTimeout(fn, 320);
  };

  // Keyboard: Escape → skip, Enter → advance
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape')  exit(onComplete);
      if (e.key === 'Enter' && step === 0) setStep(1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [step, onComplete]);

  return (
    <div
      style={{
        position:              'fixed',
        inset:                 0,
        zIndex:                60,
        display:               'flex',
        flexDirection:         'column',
        alignItems:            'center',
        justifyContent:        'center',
        padding:               '24px',
        // Use page bg with heavy opacity — canvas bleeds through very faintly
        backgroundColor:       `${tokens.pageBg}f2`,
        backdropFilter:        'blur(20px) saturate(1.2)',
        WebkitBackdropFilter:  'blur(20px) saturate(1.2)',
        opacity:               visible && !exiting ? 1 : 0,
        transition:            'opacity 0.4s cubic-bezier(0.32,0.72,0,1)',
        pointerEvents:         exiting ? 'none' : 'auto',
      }}
    >
      {step === 0 ? (
        <WelcomeStep
          tokens={tokens}
          onNext={() => setStep(1)}
          onSkip={() => exit(onComplete)}
        />
      ) : (
        <ChooseStep
          tokens={tokens}
          starterTemplates={starterTemplates}
          onApplyTemplate={id => exit(() => onApplyTemplate(id))}
          onOpenAdd={() => exit(onOpenAdd)}
          onBlank={() => exit(onComplete)}
        />
      )}

      {/* Skip affordance — always accessible */}
      <button
        onClick={() => exit(onComplete)}
        style={{
          position:        'absolute',
          top:             '18px',
          right:           '20px',
          fontSize:        '11px',
          fontFamily:      "'Space Grotesk', sans-serif",
          fontWeight:      600,
          letterSpacing:   '0.04em',
          color:           tokens.textGhost,
          background:      'none',
          border:          'none',
          cursor:          'pointer',
          padding:         '5px 10px',
          borderRadius:    '8px',
          transition:      'all 0.12s ease',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.color = tokens.textMuted;
          el.style.backgroundColor = tokens.cardBorder;
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.color = tokens.textGhost;
          el.style.backgroundColor = 'transparent';
        }}
      >
        Skip
      </button>
    </div>
  );
}
