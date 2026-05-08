import { useRef } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleSize, SIZE_LABEL } from '../../hooks/useWorkspaceLayout';
import { getMeta } from '../../modules/registry';
import { GripVertical } from 'lucide-react';

interface Props {
  id:           string;
  size:         ModuleSize;
  designMode:   boolean;
  selected:     boolean;
  dragOver:     boolean;
  tokens:       AtmosphereTokens;
  children:     React.ReactNode;
  onSelect:     (id: string | null) => void;
  onDragStart:  (id: string) => void;
  onDragOver:   (e: React.DragEvent, id: string) => void;
  onDrop:       (e: React.DragEvent, id: string) => void;
  onDragEnd:    () => void;
}

const META: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '9px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
};

export function WorkspaceModule({
  id, size, designMode, selected, dragOver, tokens, children,
  onSelect, onDragStart, onDragOver, onDrop, onDragEnd,
}: Props) {
  const ref  = useRef<HTMLDivElement>(null);
  const meta = getMeta(id);

  const handleClick = (e: React.MouseEvent) => {
    if (!designMode) return;
    e.stopPropagation();
    onSelect(selected ? null : id);
  };

  const selectedStyle: React.CSSProperties = selected ? {
    outline: `2px solid ${tokens.accent}`,
    outlineOffset: '3px',
    boxShadow: `0 0 0 2px ${tokens.accentGlow}, ${tokens.shadowLg}`,
  } : {};

  const dragOverStyle: React.CSSProperties = dragOver ? {
    outline: `2px dashed ${tokens.accent}80`,
    outlineOffset: '4px',
    opacity: 0.55,
  } : {};

  return (
    <div
      ref={ref}
      className="relative group"
      draggable={designMode}
      onDragStart={() => designMode && onDragStart(id)}
      onDragOver={e  => designMode && onDragOver(e, id)}
      onDrop={e      => designMode && onDrop(e, id)}
      onDragEnd={() => designMode && onDragEnd()}
      onClick={handleClick}
      style={{
        cursor: designMode ? (selected ? 'grabbing' : 'grab') : 'default',
        transition: 'outline 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease',
        ...selectedStyle,
        ...dragOverStyle,
      }}
    >
      {/* Design mode handle overlay — shows on hover (always) or when design mode is on */}
      <div
        className={`absolute top-2 right-2 z-10 flex items-center gap-1 transition-all duration-150 ${
          designMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ pointerEvents: designMode ? 'auto' : 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Size badge */}
        {designMode && (
          <span
            style={{
              ...META,
              padding: '2px 5px',
              borderRadius: '4px',
              backgroundColor: selected ? tokens.accentSubtle : tokens.cardBg,
              color: selected ? tokens.accent : tokens.textGhost,
              border: `1px solid ${selected ? tokens.accent + '40' : tokens.cardBorder}`,
            }}
          >
            {SIZE_LABEL[size]}
          </span>
        )}
        {/* Grip icon */}
        <div
          style={{
            padding: '3px',
            borderRadius: '5px',
            backgroundColor: tokens.cardBg,
            border: `1px solid ${tokens.cardBorder}`,
            cursor: designMode ? 'grab' : 'default',
          }}
        >
          <GripVertical className="w-3 h-3" style={{ color: tokens.textGhost }} />
        </div>
      </div>

      {/* Module label in design mode (bottom-left) */}
      {designMode && meta && (
        <div
          className="absolute bottom-2 left-3 z-10 flex items-center gap-1 pointer-events-none"
          style={{ opacity: selected ? 1 : 0.5 }}
        >
          <span style={{ ...META, color: selected ? tokens.accent : tokens.textGhost }}>
            {meta.icon} {meta.label}
          </span>
        </div>
      )}

      {/* Content — non-interactive in design mode */}
      <div style={{ pointerEvents: designMode ? 'none' : 'auto', userSelect: designMode ? 'none' : 'auto' }}>
        {children}
      </div>
    </div>
  );
}
