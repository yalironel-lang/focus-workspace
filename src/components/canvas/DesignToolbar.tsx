import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { WorkspacePreset } from '../../hooks/useWorkspaceLayout';
import { Plus, Layout, RotateCcw, ChevronDown, Palette } from 'lucide-react';
import { useState } from 'react';

interface Props {
  tokens:        AtmosphereTokens;
  designMode:    boolean;
  presets:       WorkspacePreset[];
  onOpenAdd:     () => void;
  onApplyPreset: (id: string) => void;
  onReset:       () => void;
  onOpenTheme:   () => void;
}

const LABEL: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '10px',
  fontWeight:    700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
};

export function DesignToolbar({
  tokens, designMode, presets, onOpenAdd, onApplyPreset, onReset, onOpenTheme,
}: Props) {
  const [presetsOpen, setPresetsOpen] = useState(false);

  const btnBase: React.CSSProperties = {
    display:     'flex',
    alignItems:  'center',
    gap:         '5px',
    padding:     '6px 10px',
    borderRadius: '9px',
    border:      '1px solid transparent',
    background:  'transparent',
    color:       designMode ? tokens.textSecondary : tokens.textMuted,
    cursor:      'pointer',
    transition:  'all 0.15s ease',
    whiteSpace:  'nowrap' as const,
    flexShrink:  0,
  };

  const divider = (
    <div
      style={{
        width:           '1px',
        height:          '18px',
        backgroundColor: tokens.divider,
        flexShrink:      0,
        margin:          '0 2px',
      }}
    />
  );

  return (
    <div
      className="fixed z-40 flex items-center"
      style={{
        bottom:               '24px',
        left:                 '50%',
        transform:            'translateX(-50%)',
        backgroundColor:      `${tokens.cardBg}ee`,
        backdropFilter:       'blur(28px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
        border:               `1px solid ${designMode ? tokens.accent + '35' : tokens.cardBorder}`,
        borderRadius:         '14px',
        padding:              '5px',
        boxShadow:            designMode
          ? `0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px ${tokens.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.04)`
          : `0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)`,
        transition:           'all 0.3s cubic-bezier(0.32,0.72,0,1)',
        gap:                  '2px',
      }}
    >
      {/* Add module — accent CTA */}
      <button
        onClick={onOpenAdd}
        style={{
          ...btnBase,
          color:           '#000',
          backgroundColor: tokens.accent,
          border:          'none',
          boxShadow:       `0 2px 10px ${tokens.accentGlow}`,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
          (e.currentTarget as HTMLButtonElement).style.transform = 'none';
        }}
      >
        <Plus style={{ width: '13px', height: '13px' }} strokeWidth={2.5} />
        <span style={LABEL}>Add</span>
      </button>

      {divider}

      {/* Layout presets */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setPresetsOpen(o => !o)}
          style={{
            ...btnBase,
            color:           presetsOpen ? tokens.accent : btnBase.color,
            backgroundColor: presetsOpen ? tokens.accentSubtle : 'transparent',
            borderColor:     presetsOpen ? `${tokens.accent}30` : 'transparent',
          }}
          onMouseEnter={e => {
            if (!presetsOpen) Object.assign((e.currentTarget as HTMLButtonElement).style, {
              backgroundColor: tokens.cardBorderHover,
              color: tokens.textPrimary,
            });
          }}
          onMouseLeave={e => {
            if (!presetsOpen) Object.assign((e.currentTarget as HTMLButtonElement).style, {
              backgroundColor: 'transparent',
              color: designMode ? tokens.textSecondary : tokens.textMuted,
            });
          }}
        >
          <Layout style={{ width: '13px', height: '13px' }} />
          <span style={LABEL} className="hidden sm:inline">Layout</span>
          <ChevronDown
            style={{
              width: '11px',
              height: '11px',
              transition: 'transform 0.2s ease',
              transform: presetsOpen ? 'rotate(180deg)' : 'none',
            }}
          />
        </button>

        {presetsOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPresetsOpen(false)} />
            <div
              className="absolute bottom-full z-50 animate-scale-in"
              style={{
                marginBottom:    '10px',
                left:            '50%',
                transform:       'translateX(-50%)',
                width:           '240px',
                backgroundColor: tokens.cardBg,
                border:          `1px solid ${tokens.cardBorder}`,
                borderRadius:    `${Math.min(tokens.radius, 16)}px`,
                boxShadow:       tokens.shadowLg,
                backdropFilter:  'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                overflow:        'hidden',
              }}
            >
              <div
                style={{
                  padding:      '8px 12px 6px',
                  fontFamily:   "'Space Grotesk', sans-serif",
                  fontSize:     '9px',
                  fontWeight:   700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase' as const,
                  color:        tokens.textGhost,
                  borderBottom: `1px solid ${tokens.divider}`,
                }}
              >
                Presets
              </div>
              <div style={{ padding: '6px' }}>
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { onApplyPreset(p.id); setPresetsOpen(false); }}
                    style={{
                      width:           '100%',
                      display:         'flex',
                      alignItems:      'center',
                      gap:             '10px',
                      padding:         '8px 10px',
                      borderRadius:    '9px',
                      border:          '1px solid transparent',
                      backgroundColor: 'transparent',
                      cursor:          'pointer',
                      textAlign:       'left' as const,
                      transition:      'all 0.12s ease',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBorderHover;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    }}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>
                      {p.emoji}
                    </span>
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: tokens.textPrimary, margin: 0 }}>
                        {p.name}
                      </p>
                      <p style={{ fontSize: '10px', color: tokens.textGhost, margin: 0, marginTop: '1px' }}>
                        {p.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Theme */}
      <button
        onClick={onOpenTheme}
        title="Customize theme"
        style={btnBase}
        onMouseEnter={e => {
          Object.assign((e.currentTarget as HTMLButtonElement).style, {
            backgroundColor: tokens.cardBorderHover,
            color: tokens.textPrimary,
          });
        }}
        onMouseLeave={e => {
          Object.assign((e.currentTarget as HTMLButtonElement).style, {
            backgroundColor: 'transparent',
            color: designMode ? tokens.textSecondary : tokens.textMuted,
          });
        }}
      >
        <Palette style={{ width: '13px', height: '13px' }} />
        <span style={LABEL} className="hidden sm:inline">Theme</span>
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        title="Reset layout"
        style={btnBase}
        onMouseEnter={e => {
          Object.assign((e.currentTarget as HTMLButtonElement).style, {
            backgroundColor: tokens.cardBorderHover,
            color: tokens.textPrimary,
          });
        }}
        onMouseLeave={e => {
          Object.assign((e.currentTarget as HTMLButtonElement).style, {
            backgroundColor: 'transparent',
            color: designMode ? tokens.textSecondary : tokens.textMuted,
          });
        }}
      >
        <RotateCcw style={{ width: '13px', height: '13px' }} />
        <span style={LABEL} className="hidden sm:inline">Reset</span>
      </button>

      {/* Design mode active indicator */}
      {designMode && (
        <>
          {divider}
          <div
            style={{
              display:     'flex',
              alignItems:  'center',
              gap:         '5px',
              padding:     '5px 10px',
              borderRadius: '8px',
              cursor:       'default',
            }}
          >
            <span
              style={{
                width:           '6px',
                height:          '6px',
                borderRadius:    '50%',
                backgroundColor: tokens.accent,
                boxShadow:       `0 0 8px ${tokens.accentGlow}`,
                flexShrink:      0,
                display:         'inline-block',
                animation:       'designGridPulse 2.5s ease-in-out infinite',
              }}
            />
            <span
              style={{
                ...LABEL,
                fontSize: '9px',
                color:    tokens.accent,
              }}
            >
              Design active
            </span>
          </div>
        </>
      )}
    </div>
  );
}
