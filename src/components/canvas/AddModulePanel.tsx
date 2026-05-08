import { useEffect, useState } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleConfig } from '../../hooks/useWorkspaceLayout';
import { MODULE_REGISTRY } from '../../modules/registry';
import { X, Check } from 'lucide-react';

interface Props {
  open:           boolean;
  modules:        ModuleConfig[];
  tokens:         AtmosphereTokens;
  onToggle:       (id: string) => void;
  onClose:        () => void;
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function AddModulePanel({ open, modules, tokens, onToggle, onClose }: Props) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const enabledIds = new Set(modules.filter(m => m.enabled).map(m => m.id));
  const filtered   = MODULE_REGISTRY.filter(m =>
    m.label.toLowerCase().includes(search.toLowerCase()) ||
    m.description.toLowerCase().includes(search.toLowerCase())
  );

  const active   = filtered.filter(m => enabledIds.has(m.id));
  const inactive = filtered.filter(m => !enabledIds.has(m.id));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed z-50 flex flex-col animate-slide-up"
        style={{
          bottom: '88px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(600px, calc(100vw - 32px))',
          maxHeight: '70vh',
          backgroundColor: tokens.cardBg,
          border: `1px solid ${tokens.cardBorderHover}`,
          borderRadius: `${tokens.radius}px`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px ${tokens.accentGlow}`,
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
        >
          <div>
            <h3 className="text-sm font-bold" style={{ color: tokens.textPrimary }}>Add modules</h3>
            <p style={{ ...META, fontSize: '9px', color: tokens.textGhost, marginTop: '2px' }}>
              {enabledIds.size} active · click to toggle
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-all"
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

        {/* Search */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search modules…"
            autoFocus
            className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none transition-all"
            style={{
              backgroundColor: tokens.wellBg,
              border: `1px solid ${tokens.cardBorder}`,
              color: tokens.textPrimary,
            }}
            onFocus={e => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.focusBorder)}
            onBlur={e  => ((e.currentTarget as HTMLInputElement).style.borderColor = tokens.cardBorder)}
          />
        </div>

        {/* Module grid */}
        <div className="flex-1 overflow-y-auto p-4">

          {inactive.length > 0 && (
            <>
              <p style={{ ...META, fontSize: '9px', color: tokens.textGhost, marginBottom: '10px' }}>
                Available
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                {inactive.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onToggle(m.id)}
                    className="flex flex-col items-start gap-2 p-3.5 rounded-xl transition-all text-left group"
                    style={{
                      backgroundColor: tokens.pageBg,
                      border: `1px dashed ${tokens.cardBorder}`,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = tokens.accent + '60';
                      (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentSubtle;
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = tokens.cardBorder;
                      (e.currentTarget as HTMLElement).style.backgroundColor = tokens.pageBg;
                    }}
                  >
                    <span style={{ fontSize: '20px', lineHeight: 1 }}>{m.icon}</span>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: tokens.textSecondary }}>{m.label}</p>
                      <p className="text-[10px] mt-0.5 leading-snug" style={{ color: tokens.textGhost }}>
                        {m.description}
                      </p>
                    </div>
                    <span
                      style={{
                        ...META, fontSize: '8px',
                        color: tokens.accent,
                        opacity: 0,
                        transition: 'opacity 0.15s',
                      }}
                      className="group-hover:!opacity-100"
                    >
                      + Add
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {active.length > 0 && (
            <>
              <p style={{ ...META, fontSize: '9px', color: tokens.textGhost, marginBottom: '10px' }}>
                Active
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {active.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onToggle(m.id)}
                    className="flex flex-col items-start gap-2 p-3.5 rounded-xl transition-all text-left"
                    style={{
                      backgroundColor: tokens.accentSubtle,
                      border: `1px solid ${tokens.accent + '30'}`,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)';
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(239,68,68,0.06)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = tokens.accent + '30';
                      (e.currentTarget as HTMLElement).style.backgroundColor = tokens.accentSubtle;
                    }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span style={{ fontSize: '20px', lineHeight: 1 }}>{m.icon}</span>
                      <Check className="w-3 h-3" style={{ color: tokens.accent }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: tokens.textPrimary }}>{m.label}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: tokens.textMuted }}>
                        Active · click to remove
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {filtered.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: tokens.textGhost }}>
              No modules match "{search}"
            </p>
          )}

        </div>
      </div>
    </>
  );
}
