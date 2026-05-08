import { useRef } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleSize, SIZE_LABEL } from '../../hooks/useWorkspaceLayout';
import { getMeta } from '../../modules/registry';
import { GripVertical } from 'lucide-react';
import {
  DesignTokens, ModuleTheme, SurfaceStyle,
  ACCENT_PALETTE, computeSurface,
} from '../../hooks/useWorkspaceTheme';

interface Props {
  id:           string;
  size:         ModuleSize;
  designMode:   boolean;
  selected:     boolean;
  dragOver:     boolean;
  tokens:       AtmosphereTokens;
  design:       DesignTokens;
  moduleTheme?: ModuleTheme;
  children:     React.ReactNode;
  onSelect:     (id: string | null) => void;
  onDragStart:  (id: string) => void;
  onDragOver:   (e: React.DragEvent, id: string) => void;
  onDrop:       (e: React.DragEvent, id: string) => void;
  onDragEnd:    () => void;
}

const META: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '9px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight:    600,
};

export function WorkspaceModule({
  id, size, designMode, selected, dragOver,
  tokens, design, moduleTheme,
  children, onSelect, onDragStart, onDragOver, onDrop, onDragEnd,
}: Props) {
  const ref  = useRef<HTMLDivElement>(null);
  const meta = getMeta(id);

  const handleClick = (e: React.MouseEvent) => {
    if (!designMode) return;
    e.stopPropagation();
    onSelect(selected ? null : id);
  };

  // ── Resolve module-level accent ──────────────────────────────────────────
  let modAccent:  string | undefined;
  let modGlow:    string | undefined;

  if (moduleTheme?.accentPreset && moduleTheme.accentPreset !== 'custom') {
    const e = ACCENT_PALETTE[moduleTheme.accentPreset];
    modAccent = e.color;
    modGlow   = e.glow;
  } else if (moduleTheme?.accentCustom) {
    modAccent = moduleTheme.accentCustom;
  }

  // ── Effective surface style ───────────────────────────────────────────────
  const effectiveSurface: SurfaceStyle = moduleTheme?.surfaceStyle ?? design.surfaceStyle;

  // ── Surface CSS ───────────────────────────────────────────────────────────
  const surfaceCSS = computeSurface(effectiveSurface, tokens, design, {
    accent:      modAccent,
    accentGlow:  modGlow,
    glowEnabled: moduleTheme?.glowEnabled,
    borderStyle: moduleTheme?.borderStyle,
  });

  // ── Selection state ───────────────────────────────────────────────────────
  const selAccent = modAccent ?? tokens.accent;
  const selGlow   = modGlow   ?? tokens.accentGlow;

  const selectedStyle: React.CSSProperties = selected ? {
    outline:      `2px solid ${selAccent}`,
    outlineOffset:'3px',
    boxShadow:   `0 0 0 2px ${selGlow}, ${tokens.shadowLg}`,
  } : {};

  const dragOverStyle: React.CSSProperties = dragOver ? {
    outline:       `2px dashed ${tokens.accent}80`,
    outlineOffset: '4px',
    opacity:        0.55,
  } : {};

  // Custom title display in design overlay
  const displayLabel = moduleTheme?.customTitle ?? meta?.label ?? id;

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
        cursor:     designMode ? (selected ? 'grabbing' : 'grab') : 'default',
        transition: `outline ${design.transition}, box-shadow ${design.transition}, opacity 0.2s ease`,
        opacity:    moduleTheme?.opacity ?? 1,
        ...surfaceCSS,
        ...selectedStyle,
        ...dragOverStyle,
      }}
    >
      {/* Design-mode overlay: size badge + grip (top-right) */}
      <div
        className={`absolute top-2 right-2 z-10 flex items-center gap-1 transition-all duration-150 ${
          designMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{ pointerEvents: designMode ? 'auto' : 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {designMode && (
          <span
            style={{
              ...META,
              padding:         '2px 6px',
              borderRadius:    '4px',
              backgroundColor: selected ? tokens.accentSubtle : tokens.cardBg,
              color:           selected ? tokens.accent : tokens.textGhost,
              border:         `1px solid ${selected ? tokens.accent + '40' : tokens.cardBorder}`,
            }}
          >
            {SIZE_LABEL[size]}
          </span>
        )}
        <div
          style={{
            padding:         '3px',
            borderRadius:    '5px',
            backgroundColor: tokens.cardBg,
            border:         `1px solid ${tokens.cardBorder}`,
            cursor:          designMode ? 'grab' : 'default',
          }}
        >
          <GripVertical className="w-3 h-3" style={{ color: tokens.textGhost }} />
        </div>
      </div>

      {/* Design-mode label (bottom-left) */}
      {designMode && (
        <div
          className="absolute bottom-2 left-3 z-10 flex items-center gap-1 pointer-events-none"
          style={{ opacity: selected ? 1 : 0.5 }}
        >
          <span style={{ ...META, color: selected ? selAccent : tokens.textGhost }}>
            {meta?.icon && `${meta.icon} `}{displayLabel}
          </span>
          {/* Module accent dot if override active */}
          {modAccent && (
            <span
              style={{
                display:         'inline-block',
                width:           '5px',
                height:          '5px',
                borderRadius:    '50%',
                backgroundColor: modAccent,
                boxShadow:       modGlow ? `0 0 4px ${modGlow}` : 'none',
                marginLeft:      '2px',
              }}
            />
          )}
        </div>
      )}

      {/* Content — non-interactive in design mode */}
      <div
        style={{
          pointerEvents: designMode ? 'none' : 'auto',
          userSelect:    designMode ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
