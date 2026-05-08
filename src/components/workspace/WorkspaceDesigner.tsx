import { useEffect } from 'react';
import { AtmosphereTokens, ATMOSPHERES } from '../../hooks/useAtmosphere';
import { ModuleConfig, WorkspacePreset } from '../../hooks/useWorkspaceLayout';
import { MODULE_REGISTRY } from '../../modules/registry';
import { X, RotateCcw, Check } from 'lucide-react';

interface Props {
  open: boolean;
  tokens: AtmosphereTokens;
  atmosphereId: string;
  modules: ModuleConfig[];
  presets: WorkspacePreset[];
  onSetAtmosphere: (id: string) => void;
  onApplyPreset:   (id: string) => void;
  onToggleModule:  (id: string) => void;
  onReset:         () => void;
  onClose:         () => void;
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  letterSpacing: '0.13em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

function SectionLabel({ children, tokens }: { children: React.ReactNode; tokens: AtmosphereTokens }) {
  return (
    <div className="px-5 pt-5 pb-2">
      <span style={{ ...META, fontSize: '9px', color: tokens.textGhost }}>
        {children}
      </span>
    </div>
  );
}

export function WorkspaceDesigner({
  open, tokens, atmosphereId, modules, presets,
  onSetAtmosphere, onApplyPreset, onToggleModule, onReset, onClose,
}: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const enabledModules  = modules.filter(m => m.enabled);
  const disabledModules = modules.filter(m => !m.enabled);

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: '360px',
    zIndex: 200,
    backgroundColor: tokens.pageBg,
    borderLeft: `1px solid ${tokens.cardBorder}`,
    boxShadow: `-8px 0 40px rgba(0,0,0,0.6)`,
    overflowY: 'auto',
    transform: open ? 'translateX(0)' : 'translateX(100%)',
    transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[199]"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        />
      )}

      <div style={panelStyle} onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
        >
          <div>
            <h2 className="text-sm font-bold" style={{ color: tokens.textPrimary }}>
              Workspace Design
            </h2>
            <p style={{ ...META, fontSize: '9px', color: tokens.textGhost, marginTop: '2px' }}>
              Make it yours
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
              style={{ color: tokens.textGhost }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted;
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
              title="Reset to default"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-all"
              style={{ color: tokens.textGhost }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textPrimary;
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost;
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Scroll area ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto pb-8">

          {/* ── ATMOSPHERE ─────────────────────────────────────────── */}
          <SectionLabel tokens={tokens}>Atmosphere</SectionLabel>
          <div className="px-4 grid grid-cols-3 gap-2">
            {ATMOSPHERES.map(atm => {
              const active = atm.id === atmosphereId;
              return (
                <button
                  key={atm.id}
                  onClick={() => onSetAtmosphere(atm.id)}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-all text-center"
                  style={{
                    backgroundColor: active ? atm.accentSubtle : tokens.cardBg,
                    border: `1px solid ${active ? atm.accent : tokens.cardBorder}`,
                    boxShadow: active ? `0 0 12px ${atm.accentGlow}` : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorderHover;
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorder;
                  }}
                >
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>{atm.emoji}</span>
                  <span
                    style={{
                      ...META, fontSize: '8px',
                      color: active ? atm.accent : tokens.textMuted,
                      letterSpacing: '0.08em',
                    }}
                  >
                    {atm.name}
                  </span>
                  {active && (
                    <div
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: atm.accent }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── PRESETS ────────────────────────────────────────────── */}
          <SectionLabel tokens={tokens}>Layout Presets</SectionLabel>
          <div className="px-4 flex flex-col gap-2">
            {presets.map(preset => (
              <button
                key={preset.id}
                onClick={() => onApplyPreset(preset.id)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group"
                style={{
                  backgroundColor: tokens.cardBg,
                  border: `1px solid ${tokens.cardBorder}`,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = tokens.accent + '60';
                  (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentSubtle;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorder;
                  (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBg;
                }}
              >
                <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>{preset.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: tokens.textPrimary }}>
                    {preset.name}
                  </p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: tokens.textGhost }}>
                    {preset.description}
                  </p>
                </div>
                <span
                  className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  style={{ ...META, fontSize: '8px', color: tokens.accent }}
                >
                  Apply
                </span>
              </button>
            ))}
          </div>

          {/* ── ACTIVE MODULES ─────────────────────────────────────── */}
          <SectionLabel tokens={tokens}>Active modules</SectionLabel>
          <div className="px-4 flex flex-col gap-1.5">
            {enabledModules.map(m => {
              const meta = MODULE_REGISTRY.find(r => r.id === m.id);
              if (!meta) return null;
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    backgroundColor: tokens.cardBg,
                    border: `1px solid ${tokens.cardBorder}`,
                  }}
                >
                  <span style={{ fontSize: '13px', lineHeight: 1, flexShrink: 0, color: tokens.textMuted }}>
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: tokens.textSecondary }}>
                      {meta.label}
                    </p>
                  </div>
                  <button
                    onClick={() => onToggleModule(m.id)}
                    className="p-1 rounded transition-colors flex-shrink-0"
                    style={{ color: tokens.textGhost }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = tokens.textGhost)}
                    title="Remove from workspace"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {enabledModules.length === 0 && (
              <p className="px-3 text-xs" style={{ color: tokens.textGhost }}>
                No modules active. Add some below.
              </p>
            )}
          </div>

          {/* ── ADD MODULES ────────────────────────────────────────── */}
          {disabledModules.length > 0 && (
            <>
              <SectionLabel tokens={tokens}>Add modules</SectionLabel>
              <div className="px-4 grid grid-cols-2 gap-2">
                {disabledModules.map(m => {
                  const meta = MODULE_REGISTRY.find(r => r.id === m.id);
                  if (!meta) return null;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onToggleModule(m.id)}
                      className="flex flex-col items-start gap-1.5 px-3 py-3 rounded-xl transition-all text-left group"
                      style={{
                        backgroundColor: tokens.cardBg,
                        border: `1px dashed ${tokens.cardBorder}`,
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = tokens.accent + '50';
                        (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentSubtle;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorder;
                        (e.currentTarget as HTMLElement).style.backgroundColor = tokens.cardBg;
                      }}
                    >
                      <span style={{ fontSize: '16px', lineHeight: 1 }}>{meta.icon}</span>
                      <p className="text-xs font-semibold" style={{ color: tokens.textMuted }}>
                        {meta.label}
                      </p>
                      <span
                        className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ ...META, color: tokens.accent, fontSize: '8px' }}
                      >
                        + Add
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div
          className="px-5 py-4 flex-shrink-0"
          style={{ borderTop: `1px solid ${tokens.cardBorder}` }}
        >
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            style={{ backgroundColor: tokens.accent, color: '#000' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
            }}
          >
            <Check className="w-4 h-4" /> Done
          </button>
        </div>

      </div>
    </>
  );
}
