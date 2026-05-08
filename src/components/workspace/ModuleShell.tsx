import { useRef } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleSize, SIZE_LABEL } from '../../hooks/useWorkspaceLayout';
import { getMeta } from '../../modules/registry';
import { GripVertical, X, Eye, EyeOff } from 'lucide-react';

interface Props {
  id: string;
  size: ModuleSize;
  enabled: boolean;
  designMode: boolean;
  dragOver: boolean;
  tokens: AtmosphereTokens;
  children: React.ReactNode;
  onDragStart: (id: string) => void;
  onDragOver:  (e: React.DragEvent, id: string) => void;
  onDrop:      (e: React.DragEvent, id: string) => void;
  onDragEnd:   () => void;
  onToggle:    (id: string) => void;
  onSetSize:   (id: string, size: ModuleSize) => void;
}

const SIZES: ModuleSize[] = ['third', 'half', 'two-thirds', 'full'];

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function ModuleShell({
  id, size, enabled, designMode, dragOver, tokens, children,
  onDragStart, onDragOver, onDrop, onDragEnd, onToggle, onSetSize,
}: Props) {
  const dragRef = useRef<HTMLDivElement>(null);
  const meta = getMeta(id);

  if (!designMode) {
    // Normal rendering — no wrapper overhead
    return <>{children}</>;
  }

  return (
    <div
      ref={dragRef}
      draggable
      onDragStart={() => onDragStart(id)}
      onDragOver={e => onDragOver(e, id)}
      onDrop={e => onDrop(e, id)}
      onDragEnd={onDragEnd}
      className="relative transition-all duration-200"
      style={{
        opacity: dragOver ? 0.5 : 1,
        outline: dragOver ? `2px solid ${tokens.accent}` : undefined,
        outlineOffset: dragOver ? '3px' : undefined,
        borderRadius: `${tokens.radius}px`,
        cursor: 'grab',
      }}
    >
      {/* Design mode header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-xl mb-0.5 select-none"
        style={{
          backgroundColor: tokens.cardBg,
          border: `1px solid ${tokens.accent}28`,
          borderBottom: 'none',
        }}
      >
        {/* Left: grip + label */}
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tokens.textGhost }} />
          <span style={{ ...META, color: tokens.textMuted, fontSize: '9px' }}>
            {meta?.icon} {meta?.label ?? id}
          </span>
        </div>

        {/* Right: size pips + toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Size selector */}
          <div className="flex items-center gap-0.5">
            {SIZES.map(s => (
              <button
                key={s}
                onClick={e => { e.stopPropagation(); onSetSize(id, s); }}
                className="transition-all"
                style={{
                  ...META,
                  fontSize: '8px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  color: size === s ? tokens.accent : tokens.textGhost,
                  backgroundColor: size === s ? tokens.accentSubtle : 'transparent',
                  border: `1px solid ${size === s ? tokens.accent + '40' : 'transparent'}`,
                }}
              >
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>

          {/* Hide/show */}
          <button
            onClick={e => { e.stopPropagation(); onToggle(id); }}
            className="p-1 rounded transition-colors"
            style={{ color: enabled ? tokens.textGhost : tokens.accent }}
            title={enabled ? 'Hide module' : 'Show module'}
          >
            {enabled
              ? <EyeOff className="w-3 h-3" />
              : <Eye className="w-3 h-3" />
            }
          </button>

          {/* Disable (X) */}
          <button
            onClick={e => { e.stopPropagation(); onToggle(id); }}
            className="p-1 rounded transition-colors"
            style={{ color: tokens.textGhost }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={e => (e.currentTarget.style.color = tokens.textGhost)}
            title="Remove from workspace"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Module content */}
      <div
        style={{
          pointerEvents: 'none', // prevent interaction during design mode
          opacity: 0.85,
          userSelect: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
