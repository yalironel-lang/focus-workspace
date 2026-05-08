import { useState } from 'react';
import { Plus, Layout, Sparkles } from 'lucide-react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { WorkspacePreset }  from '../../hooks/useWorkspaceLayout';
import type { BlockType }   from '../../hooks/useCustomBlocks';
import type { StarterTemplate } from '../../data/starterTemplates';

interface Props {
  tokens:            AtmosphereTokens;
  designMode:        boolean;
  starterTemplates:  StarterTemplate[];
  presets:           WorkspacePreset[];
  onOpenAdd:         () => void;
  onAddBlock:        (type: BlockType) => void;
  onApplyPreset:     (id: string) => void;
  onApplyTemplate:   (id: string) => void;
}

const LABEL: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '9px',
  fontWeight:    700,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
};

// The 3 dominant creation actions
const BIG_ACTIONS = [
  {
    id:      'add',
    icon:    <Plus style={{ width: '20px', height: '20px' }} strokeWidth={1.5} />,
    label:   'Add something you need',
    sub:     'Note, timer, checklist, image, quote…',
    accent:  true,
  },
  {
    id:      'template',
    icon:    <Sparkles style={{ width: '20px', height: '20px' }} strokeWidth={1.5} />,
    label:   'Start from a layout',
    sub:     'Student, deep work, moodboard, capture…',
    accent:  false,
  },
  {
    id:      'blank',
    icon:    <Layout style={{ width: '20px', height: '20px' }} strokeWidth={1.5} />,
    label:   'Clean slate',
    sub:     'Completely empty. Build it your way.',
    accent:  false,
  },
] as const;

// Ambient floating particles — pure decorative CSS elements
function AmbientParticles({ tokens }: { tokens: AtmosphereTokens }) {
  const PARTICLES = [
    { size: 2,  top: '18%', left: '12%',  delay: '0s',    dur: '7s'  },
    { size: 3,  top: '72%', left: '8%',   delay: '1.2s',  dur: '9s'  },
    { size: 2,  top: '35%', left: '88%',  delay: '0.4s',  dur: '6s'  },
    { size: 4,  top: '58%', left: '82%',  delay: '2.1s',  dur: '8s'  },
    { size: 2,  top: '82%', left: '55%',  delay: '0.8s',  dur: '11s' },
    { size: 3,  top: '15%', left: '65%',  delay: '3.0s',  dur: '7s'  },
    { size: 2,  top: '45%', left: '5%',   delay: '1.8s',  dur: '10s' },
    { size: 2,  top: '90%', left: '30%',  delay: '0.2s',  dur: '8s'  },
  ] as const;

  return (
    <div
      style={{
        position:      'absolute',
        inset:         0,
        pointerEvents: 'none',
        overflow:      'hidden',
      }}
      aria-hidden="true"
    >
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          style={{
            position:        'absolute',
            top:             p.top,
            left:            p.left,
            width:           `${p.size}px`,
            height:          `${p.size}px`,
            borderRadius:    '50%',
            backgroundColor: tokens.accent,
            opacity:         0,
            animation:       `emptyStateParticle ${p.dur} ${p.delay} ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function CanvasEmptyState({
  tokens, starterTemplates, onOpenAdd, onAddBlock, onApplyTemplate,
}: Props) {
  const [showTemplates, setShowTemplates] = useState(false);

  const handleAction = (id: string) => {
    if (id === 'add')      { onOpenAdd(); return; }
    if (id === 'template') { setShowTemplates(true); return; }
    if (id === 'blank')    { onApplyTemplate('blank-canvas'); onAddBlock('text'); return; }
  };

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        minHeight:  '80vh',
        padding:    '48px 24px 120px',
        position:   'relative',
        overflow:   'hidden',
      }}
    >
      <AmbientParticles tokens={tokens} />

      {/* ── Ambient rings ─────────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center mb-10"
        style={{ width: '110px', height: '110px', flexShrink: 0 }}
      >
        {/* Outermost slow-breathing ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border:    `1px solid ${tokens.cardBorder}`,
            animation: 'onboardRingPulse 4s ease-in-out infinite',
          }}
        />
        {/* Middle ring with glow */}
        <div
          className="absolute rounded-full"
          style={{
            inset:     '15px',
            border:    `1px solid ${tokens.accent}28`,
            boxShadow: `0 0 40px ${tokens.accentGlow}`,
            animation: 'onboardRingPulse 4s 0.8s ease-in-out infinite',
          }}
        />
        {/* Inner ring */}
        <div
          className="absolute rounded-full"
          style={{
            inset:     '30px',
            border:    `1px solid ${tokens.accent}45`,
            animation: 'onboardRingPulse 4s 1.6s ease-in-out infinite',
          }}
        />
        {/* Innermost dot */}
        <div
          className="absolute rounded-full"
          style={{
            inset:           '42px',
            backgroundColor: `${tokens.accent}18`,
            boxShadow:       `0 0 28px ${tokens.accentGlow}`,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}
        >
          <span style={{
            fontSize:   '13px',
            lineHeight: 1,
            color:      tokens.accent,
            userSelect: 'none',
            filter:     `drop-shadow(0 0 8px ${tokens.accentGlow})`,
            animation:  'onboardGlyphFloat 4.5s ease-in-out infinite',
          }}>
            ✦
          </span>
        </div>
      </div>

      {/* ── Heading ───────────────────────────────────────────── */}
      <h2
        className="animate-slide-up stagger-1 text-center"
        style={{
          fontFamily:    "'Plus Jakarta Sans', sans-serif",
          fontSize:      'clamp(22px, 4vw, 30px)',
          fontWeight:    800,
          letterSpacing: '-0.03em',
          lineHeight:    1.15,
          color:         tokens.textPrimary,
          marginBottom:  '10px',
        }}
      >
        Start shaping your space.
      </h2>

      <p
        className="animate-slide-up stagger-2 text-center"
        style={{
          fontSize:     '13px',
          lineHeight:   1.65,
          color:        tokens.textMuted,
          maxWidth:     '300px',
          marginBottom: '44px',
        }}
      >
        Add tools, notes, and layouts —
        make it fit exactly how you think.
      </p>

      {/* ── Template picker (conditional) ─────────────────────── */}
      {showTemplates ? (
        <div
          className="animate-slide-up w-full"
          style={{ maxWidth: '600px' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span style={{ ...LABEL, color: tokens.textMuted }}>Choose a layout</span>
            <button
              onClick={() => setShowTemplates(false)}
              style={{
                fontSize:  '11px', color: tokens.textGhost,
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          </div>

          <div
            style={{
              display:             'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap:                 '10px',
            }}
          >
            {starterTemplates.map((t, i) => (
              <button
                key={t.id}
                onClick={() => onApplyTemplate(t.id)}
                style={{
                  display:         'flex',
                  flexDirection:   'column',
                  alignItems:      'flex-start',
                  gap:             '8px',
                  padding:         '16px',
                  borderRadius:    `${tokens.radius}px`,
                  border:          `1px solid ${tokens.cardBorder}`,
                  backgroundColor: tokens.cardBg,
                  cursor:          'pointer',
                  textAlign:       'left',
                  transition:      'all 0.15s ease',
                  animation:       `slideUp 0.35s ${i * 40}ms var(--fw-ease-smooth, cubic-bezier(0.32,0.72,0,1)) both`,
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
                <span style={{ fontSize: '20px', lineHeight: 1 }}>{t.emoji}</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: tokens.textPrimary, margin: 0 }}>
                    {t.name}
                  </p>
                  <p style={{ fontSize: '11px', color: tokens.textMuted, margin: '3px 0 0', lineHeight: 1.45 }}>
                    {t.tagline}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

      ) : (
        /* ── Three big action cards ───────────────────────────── */
        <div
          className="animate-slide-up stagger-3 w-full"
          style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap:                 '12px',
            maxWidth:            '660px',
          }}
        >
          {BIG_ACTIONS.map((action, i) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              style={{
                display:         'flex',
                flexDirection:   'column',
                alignItems:      'flex-start',
                gap:             '12px',
                padding:         '22px 20px',
                borderRadius:    `${tokens.radius}px`,
                border:          `1.5px solid ${action.accent ? tokens.accent + '60' : tokens.cardBorder}`,
                backgroundColor: action.accent ? `${tokens.accent}10` : tokens.cardBg,
                cursor:          'pointer',
                textAlign:       'left',
                transition:      'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                animation:       `slideUp 0.4s ${0.12 + i * 0.07}s var(--fw-ease-smooth, cubic-bezier(0.32,0.72,0,1)) both`,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.borderColor     = action.accent ? tokens.accent : `${tokens.accent}50`;
                el.style.backgroundColor = action.accent ? `${tokens.accent}18` : tokens.accentSubtle;
                el.style.transform       = 'translateY(-3px) scale(1.01)';
                el.style.boxShadow       = `0 8px 28px ${tokens.accentGlow}`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.borderColor     = action.accent ? tokens.accent + '60' : tokens.cardBorder;
                el.style.backgroundColor = action.accent ? `${tokens.accent}10` : tokens.cardBg;
                el.style.transform       = 'none';
                el.style.boxShadow       = 'none';
              }}
            >
              {/* Icon pill */}
              <div
                style={{
                  width:           '40px',
                  height:          '40px',
                  borderRadius:    '12px',
                  backgroundColor: action.accent ? tokens.accent : `${tokens.accent}18`,
                  border:          `1px solid ${action.accent ? 'transparent' : tokens.accent + '30'}`,
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  color:           action.accent ? '#000' : tokens.accent,
                  flexShrink:      0,
                  boxShadow:       action.accent ? `0 4px 16px ${tokens.accentGlow}` : 'none',
                }}
              >
                {action.icon}
              </div>

              {/* Text */}
              <div>
                <p style={{
                  fontFamily:    "'Plus Jakarta Sans', sans-serif",
                  fontSize:      '14px',
                  fontWeight:    700,
                  color:         tokens.textPrimary,
                  margin:        0,
                  letterSpacing: '-0.01em',
                }}>
                  {action.label}
                </p>
                <p style={{
                  fontSize:  '11px',
                  color:     tokens.textMuted,
                  margin:    '4px 0 0',
                  lineHeight: 1.45,
                }}>
                  {action.sub}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Keyboard shortcut hint ────────────────────────────── */}
      {!showTemplates && (
        <p
          className="animate-slide-up stagger-5 text-center"
          style={{
            fontSize:   '11px',
            color:      tokens.textGhost,
            marginTop:  '28px',
            display:    'flex',
            alignItems: 'center',
            gap:        '5px',
          }}
        >
          <kbd style={{
            fontFamily:      "'Space Grotesk', monospace",
            fontSize:        '10px',
            fontWeight:      600,
            padding:         '1px 5px',
            borderRadius:    '5px',
            border:          `1px solid ${tokens.cardBorderHover}`,
            backgroundColor: tokens.cardBg,
            color:           tokens.textGhost,
          }}>
            ⌘K
          </kbd>
          to add anything, anytime
        </p>
      )}
    </div>
  );
}
