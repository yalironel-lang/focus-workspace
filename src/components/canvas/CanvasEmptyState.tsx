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
    label:   'Add anything',
    sub:     'Text, note, checklist, image, quote…',
    accent:  true,
  },
  {
    id:      'template',
    icon:    <Sparkles style={{ width: '20px', height: '20px' }} strokeWidth={1.5} />,
    label:   'Choose a starter layout',
    sub:     'Student, deep work, moodboard, capture…',
    accent:  false,
  },
  {
    id:      'blank',
    icon:    <Layout style={{ width: '20px', height: '20px' }} strokeWidth={1.5} />,
    label:   'Start from blank canvas',
    sub:     'Clean slate, all panels hidden.',
    accent:  false,
  },
] as const;

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
      style={{ minHeight: '80vh', padding: '48px 24px 120px' }}
    >

      {/* ── Ambient rings ─────────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center mb-10"
        style={{ width: '100px', height: '100px', flexShrink: 0 }}
      >
        <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${tokens.cardBorder}` }} />
        <div className="absolute rounded-full" style={{
          inset: '14px', border: `1px solid ${tokens.accent}22`,
          boxShadow: `0 0 28px ${tokens.accentGlow}`,
        }} />
        <div className="absolute rounded-full" style={{ inset: '28px', border: `1px solid ${tokens.accent}38` }} />
        <span style={{
          fontSize: '22px', lineHeight: 1, color: tokens.accent, userSelect: 'none',
          filter: `drop-shadow(0 0 8px ${tokens.accentGlow})`,
          animation: 'scaleIn 0.5s 0.2s var(--fw-ease-spring, cubic-bezier(0.34,1.56,0.64,1)) both',
        }}>
          ✦
        </span>
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
        Start shaping your workspace.
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
        This space is yours. Add modules, blocks, and layouts — make it fit exactly how you think.
      </p>

      {/* ── Template picker (conditional) ─────────────────────── */}
      {showTemplates ? (
        <div
          className="animate-slide-up w-full"
          style={{ maxWidth: '600px' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span style={{ ...LABEL, color: tokens.textMuted }}>Choose a starter layout</span>
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

    </div>
  );
}
