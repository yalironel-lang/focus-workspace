import { useEffect } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleConfig, ModuleSize, SIZE_LABEL } from '../../hooks/useWorkspaceLayout';
import { getMeta } from '../../modules/registry';
import { X, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

interface Props {
  selectedId:   string | null;
  modules:      ModuleConfig[];
  tokens:       AtmosphereTokens;
  onClose:      () => void;
  onSetSize:    (id: string, size: ModuleSize) => void;
  onMoveUp:     (id: string) => void;
  onMoveDown:   (id: string) => void;
  onRemove:     (id: string) => void;
}

const SIZES: ModuleSize[] = ['third', 'half', 'two-thirds', 'full'];

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '9px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

function Row({ label, tokens, children }: { label: string; tokens: AtmosphereTokens; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
      <span style={{ ...META, color: tokens.textGhost }}>{label}</span>
      {children}
    </div>
  );
}

export function ModuleInspector({ selectedId, modules, tokens, onClose, onSetSize, onMoveUp, onMoveDown, onRemove }: Props) {
  const open = !!selectedId;

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  const mod  = modules.find(m => m.id === selectedId);
  const meta = selectedId ? getMeta(selectedId) : undefined;

  const orderedIds = [...modules].sort((a, b) => a.order - b.order).filter(m => m.enabled).map(m => m.id);
  const idx        = selectedId ? orderedIds.indexOf(selectedId) : -1;
  const canMoveUp  = idx > 0;
  const canMoveDown = idx < orderedIds.length - 1;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
      style={{
        width: '300px',
        backgroundColor: tokens.pageBg,
        borderLeft: `1px solid ${tokens.cardBorder}`,
        boxShadow: `-8px 0 32px rgba(0,0,0,0.5)`,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}
      >
        <div className="flex items-center gap-2">
          {meta && <span style={{ fontSize: '15px', lineHeight: 1 }}>{meta.icon}</span>}
          <div>
            <p className="text-xs font-bold" style={{ color: tokens.textPrimary }}>
              {meta?.label ?? 'Module'}
            </p>
            <p style={{ ...META, color: tokens.textGhost, marginTop: '1px' }}>Inspector</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-all"
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
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* Size */}
        {mod && (
          <Row label="Width" tokens={tokens}>
            <div className="flex gap-1">
              {SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => selectedId && onSetSize(selectedId, s)}
                  className="flex-1 py-2 rounded-lg text-center transition-all"
                  style={{
                    ...META,
                    fontSize: '9px',
                    color: mod.size === s ? '#000' : tokens.textMuted,
                    backgroundColor: mod.size === s ? tokens.accent : tokens.cardBg,
                    border: `1px solid ${mod.size === s ? tokens.accent : tokens.cardBorder}`,
                    boxShadow: mod.size === s ? `0 2px 8px ${tokens.accentGlow}` : 'none',
                  }}
                >
                  {SIZE_LABEL[s]}
                </button>
              ))}
            </div>
          </Row>
        )}

        {/* Order */}
        {selectedId && (
          <Row label="Position" tokens={tokens}>
            <div className="flex gap-2">
              <button
                onClick={() => onMoveUp(selectedId)}
                disabled={!canMoveUp}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all disabled:opacity-30"
                style={{
                  border: `1px solid ${tokens.cardBorder}`,
                  color: tokens.textSecondary,
                  backgroundColor: tokens.cardBg,
                  fontSize: '11px',
                  fontWeight: 600,
                }}
                onMouseEnter={e => {
                  if (canMoveUp) (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorderHover;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
                }}
              >
                <ArrowUp className="w-3 h-3" /> Move up
              </button>
              <button
                onClick={() => onMoveDown(selectedId)}
                disabled={!canMoveDown}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all disabled:opacity-30"
                style={{
                  border: `1px solid ${tokens.cardBorder}`,
                  color: tokens.textSecondary,
                  backgroundColor: tokens.cardBg,
                  fontSize: '11px',
                  fontWeight: 600,
                }}
                onMouseEnter={e => {
                  if (canMoveDown) (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorderHover;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.cardBorder;
                }}
              >
                <ArrowDown className="w-3 h-3" /> Move down
              </button>
            </div>
          </Row>
        )}

        {/* Module description */}
        {meta && (
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${tokens.cardBorder}` }}>
            <p className="text-xs leading-relaxed" style={{ color: tokens.textGhost }}>
              {meta.description}
            </p>
          </div>
        )}

      </div>

      {/* Footer: remove */}
      <div className="px-4 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${tokens.cardBorder}` }}>
        {selectedId && (
          <button
            onClick={() => { onRemove(selectedId); onClose(); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all"
            style={{
              border: `1px solid rgba(239,68,68,0.2)`,
              color: '#f87171',
              fontSize: '12px',
              fontWeight: 600,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.08)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.4)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.2)';
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove module
          </button>
        )}
      </div>
    </div>
  );
}
