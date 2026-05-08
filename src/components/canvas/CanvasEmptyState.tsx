import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { WorkspacePreset } from '../../hooks/useWorkspaceLayout';
import { Plus } from 'lucide-react';

interface Props {
  tokens:        AtmosphereTokens;
  presets:       WorkspacePreset[];
  onOpenAdd:     () => void;
  onApplyPreset: (id: string) => void;
}

const LABEL: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '9px',
  fontWeight:    700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
};

const PILLARS = [
  {
    icon: '✦',
    title: 'Place anything',
    body: 'Text, quotes, images, notes, checklists — every thought deserves a home.',
  },
  {
    icon: '◈',
    title: 'Design your space',
    body: 'Choose atmospheres, surfaces, accents. Make the environment match your mind.',
  },
  {
    icon: '⟡',
    title: 'Flow freely',
    body: 'Drag, resize, reorder. Your workspace bends to how you think.',
  },
];

export function CanvasEmptyState({ tokens, presets, onOpenAdd, onApplyPreset }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center animate-entrance"
      style={{ minHeight: '70vh', padding: '48px 24px 80px' }}
    >

      {/* ── Ambient rings ──────────────────────────────────────────────── */}
      <div
        className="relative flex items-center justify-center mb-12"
        style={{ width: '140px', height: '140px', flexShrink: 0 }}
      >
        {/* Outermost ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border:     `1px solid ${tokens.cardBorder}`,
            animation:  'fadeIn 0.8s ease both',
          }}
        />
        {/* Middle ring — subtle glow */}
        <div
          className="absolute rounded-full"
          style={{
            inset:      '18px',
            border:     `1px solid ${tokens.accent}25`,
            boxShadow:  `0 0 32px ${tokens.accentGlow}`,
            animation:  'fadeIn 1s 0.15s ease both',
          }}
        />
        {/* Inner ring */}
        <div
          className="absolute rounded-full"
          style={{
            inset:      '36px',
            border:     `1px solid ${tokens.accent}40`,
            animation:  'fadeIn 1.1s 0.25s ease both',
          }}
        />
        {/* Center mark */}
        <div
          style={{
            fontSize:   '28px',
            lineHeight: 1,
            color:      tokens.accent,
            userSelect: 'none',
            animation:  'scaleIn 0.5s 0.3s var(--fw-ease-spring, cubic-bezier(0.34,1.56,0.64,1)) both',
            filter:     `drop-shadow(0 0 8px ${tokens.accentGlow})`,
          }}
        >
          ✦
        </div>
      </div>

      {/* ── Heading ──────────────────────────────────────────────────── */}
      <h2
        className="animate-slide-up stagger-1"
        style={{
          fontFamily:   "'Plus Jakarta Sans', sans-serif",
          fontSize:     'clamp(24px, 4vw, 34px)',
          fontWeight:   800,
          letterSpacing: '-0.03em',
          lineHeight:   1.15,
          color:        tokens.textPrimary,
          marginBottom: '12px',
          maxWidth:     '400px',
        }}
      >
        Your space.{' '}
        <span style={{ color: tokens.accent }}>Your rules.</span>
      </h2>

      <p
        className="animate-slide-up stagger-2"
        style={{
          fontSize:     '14px',
          lineHeight:   1.7,
          color:        tokens.textMuted,
          maxWidth:     '320px',
          marginBottom: '48px',
        }}
      >
        A personal canvas that adapts to how you think.
        Start with a module or build from scratch.
      </p>

      {/* ── Three pillars ───────────────────────────────────────────── */}
      <div
        className="animate-slide-up stagger-3"
        style={{
          display:              'grid',
          gridTemplateColumns:  'repeat(3, 1fr)',
          gap:                  '12px',
          width:                '100%',
          maxWidth:             '540px',
          marginBottom:         '48px',
        }}
      >
        {PILLARS.map((p, i) => (
          <div
            key={p.title}
            style={{
              backgroundColor: tokens.cardBg,
              border:          `1px solid ${tokens.cardBorder}`,
              borderRadius:    `${tokens.radius}px`,
              padding:         '20px 16px',
              textAlign:       'left',
              animation:       `slideUp 0.4s ${0.2 + i * 0.06}s var(--fw-ease-smooth, cubic-bezier(0.32,0.72,0,1)) both`,
            }}
          >
            <div
              style={{
                fontSize:     '18px',
                marginBottom: '10px',
                color:        tokens.accent,
                lineHeight:   1,
                filter:       `drop-shadow(0 0 6px ${tokens.accentGlow})`,
              }}
            >
              {p.icon}
            </div>
            <p
              style={{
                fontFamily:   "'Space Grotesk', sans-serif",
                fontSize:     '11px',
                fontWeight:   700,
                letterSpacing: '0.02em',
                color:        tokens.textSecondary,
                marginBottom: '6px',
              }}
            >
              {p.title}
            </p>
            <p
              style={{
                fontSize:  '11px',
                lineHeight: 1.55,
                color:     tokens.textMuted,
              }}
            >
              {p.body}
            </p>
          </div>
        ))}
      </div>

      {/* ── Primary CTA ─────────────────────────────────────────────── */}
      <button
        onClick={onOpenAdd}
        className="animate-slide-up stagger-4 flex items-center gap-2"
        style={{
          fontFamily:      "'Space Grotesk', sans-serif",
          fontSize:        '13px',
          fontWeight:      700,
          letterSpacing:   '0.04em',
          padding:         '11px 24px',
          borderRadius:    '40px',
          border:          'none',
          backgroundColor: tokens.accent,
          color:           '#000',
          cursor:          'pointer',
          boxShadow:       `0 4px 24px ${tokens.accentGlow}, 0 0 0 1px ${tokens.accent}40`,
          marginBottom:    '32px',
          transition:      'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px) scale(1.02)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            `0 8px 32px ${tokens.accentGlow}, 0 0 0 1px ${tokens.accentHover}60`;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
          (e.currentTarget as HTMLButtonElement).style.transform = 'none';
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            `0 4px 24px ${tokens.accentGlow}, 0 0 0 1px ${tokens.accent}40`;
        }}
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        Add first module
      </button>

      {/* ── Preset quick-starts ─────────────────────────────────────── */}
      <div className="animate-slide-up stagger-5 flex flex-col items-center gap-3">
        <p style={{ ...LABEL, color: tokens.textGhost }}>
          or start from a layout preset
        </p>
        <div
          style={{
            display:        'flex',
            flexWrap:       'wrap',
            justifyContent: 'center',
            gap:            '8px',
            maxWidth:       '480px',
          }}
        >
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => onApplyPreset(p.id)}
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             '6px',
                fontSize:        '12px',
                fontWeight:      600,
                padding:         '7px 14px',
                borderRadius:    '20px',
                border:          `1px solid ${tokens.cardBorder}`,
                backgroundColor: tokens.cardBg,
                color:           tokens.textSecondary,
                cursor:          'pointer',
                transition:      'all 0.15s ease',
                backdropFilter:  'blur(12px)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor  = `${tokens.accent}50`;
                (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentSubtle;
                (e.currentTarget as HTMLElement).style.color        = tokens.accent;
                (e.currentTarget as HTMLElement).style.transform    = 'translateY(-1px)';
                (e.currentTarget as HTMLElement).style.boxShadow    = `0 4px 16px ${tokens.accentGlow}`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor  = tokens.cardBorder;
                (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBg;
                (e.currentTarget as HTMLElement).style.color        = tokens.textSecondary;
                (e.currentTarget as HTMLElement).style.transform    = 'none';
                (e.currentTarget as HTMLElement).style.boxShadow    = 'none';
              }}
            >
              <span style={{ fontSize: '14px', lineHeight: 1 }}>{p.emoji}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
