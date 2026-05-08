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

const META: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight:    600,
};

export function DesignToolbar({
  tokens, designMode, presets, onOpenAdd, onApplyPreset, onReset, onOpenTheme,
}: Props) {
  const [presetsOpen, setPresetsOpen] = useState(false);

  const btnBase: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    gap:            '6px',
    padding:        '6px 10px',
    borderRadius:   '10px',
    fontSize:       '11px',
    fontWeight:     600,
    cursor:         'pointer',
    transition:     'all 0.15s ease',
    border:         'none',
    background:     'transparent',
    color:          designMode ? tokens.textPrimary : tokens.textMuted,
    whiteSpace:     'nowrap' as const,
  };

  return (
    <div
      className="fixed z-40 flex items-center"
      style={{
        bottom:                 '24px',
        left:                   '50%',
        transform:              'translateX(-50%)',
        backgroundColor:        designMode ? `${tokens.cardBg}f0` : `${tokens.cardBg}d0`,
        backdropFilter:         'blur(20px)',
        WebkitBackdropFilter:   'blur(20px)',
        border:                `1px solid ${designMode ? tokens.accent + '40' : tokens.cardBorder}`,
        borderRadius:           '14px',
        padding:                '4px',
        boxShadow:              designMode
          ? `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${tokens.accentGlow}`
          : `0 8px 32px rgba(0,0,0,0.5)`,
        transition:             'all 0.3s ease',
        gap:                    '2px',
      }}
    >
      {/* Add module */}
      <button
        onClick={onOpenAdd}
        style={{
          ...btnBase,
          color:           '#000',
          backgroundColor: tokens.accent,
          boxShadow:      `0 2px 8px ${tokens.accentGlow}`,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
        }}
      >
        <Plus className="w-3.5 h-3.5" />
        <span style={META}>Add module</span>
      </button>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', backgroundColor: tokens.cardBorder, margin: '0 2px' }} />

      {/* Layout presets */}
      <div className="relative">
        <button
          onClick={() => setPresetsOpen(o => !o)}
          style={{
            ...btnBase,
            color:           presetsOpen ? tokens.accent : btnBase.color,
            backgroundColor: presetsOpen ? tokens.accentSubtle : 'transparent',
          }}
          onMouseEnter={e => {
            if (!presetsOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
          }}
          onMouseLeave={e => {
            if (!presetsOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
        >
          <Layout className="w-3.5 h-3.5" />
          <span style={META} className="hidden sm:inline">Layout</span>
          <ChevronDown className="w-3 h-3" />
        </button>

        {presetsOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPresetsOpen(false)} />
            <div
              className="absolute bottom-full mb-2 left-0 z-50 rounded-2xl overflow-hidden"
              style={{
                width:           '240px',
                backgroundColor: tokens.cardBg,
                border:         `1px solid ${tokens.cardBorder}`,
                boxShadow:       tokens.shadowLg,
              }}
            >
              <div className="p-1.5">
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { onApplyPreset(p.id); setPresetsOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = tokens.cardBorder)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>{p.emoji}</span>
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: tokens.textPrimary }}>
                        {p.name}
                      </p>
                      <p style={{ fontSize: '10px', color: tokens.textGhost }}>{p.description}</p>
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
        style={btnBase}
        title="Customize theme"
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
          (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = designMode ? tokens.textPrimary : tokens.textMuted;
        }}
      >
        <Palette className="w-3.5 h-3.5" />
        <span style={META} className="hidden sm:inline">Theme</span>
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        style={btnBase}
        title="Reset layout"
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span style={META} className="hidden sm:inline">Reset</span>
      </button>

      {/* Design mode indicator */}
      {designMode && (
        <>
          <div style={{ width: '1px', height: '20px', backgroundColor: tokens.cardBorder, margin: '0 2px' }} />
          <div style={{ ...btnBase, color: tokens.accent, cursor: 'default' }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: tokens.accent,
                boxShadow:      `0 0 6px ${tokens.accentGlow}`,
                flexShrink:      0,
              }}
            />
            <span style={{ ...META, fontSize: '9px' }}>Design mode on</span>
          </div>
        </>
      )}
    </div>
  );
}
