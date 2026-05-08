import { useRef } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleSize, SIZE_LABEL } from '../../hooks/useWorkspaceLayout';
import { getMeta } from '../../modules/registry';
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
  isDragging:   boolean;
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

// Corner handle positions
const CORNERS = [
  { top: '-4px', left: '-4px' },
  { top: '-4px', right: '-4px' },
  { bottom: '-4px', left: '-4px' },
  { bottom: '-4px', right: '-4px' },
] as const;

export function WorkspaceModule({
  id, size, designMode, selected, dragOver, isDragging,
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
  let modAccent: string | undefined;
  let modGlow:   string | undefined;

  if (moduleTheme?.accentPreset && moduleTheme.accentPreset !== 'custom') {
    const e = ACCENT_PALETTE[moduleTheme.accentPreset];
    modAccent = e.color;
    modGlow   = e.glow;
  } else if (moduleTheme?.accentCustom) {
    modAccent = moduleTheme.accentCustom;
    modGlow   = `${moduleTheme.accentCustom}80`;
  }

  const effectiveSurface: SurfaceStyle = moduleTheme?.surfaceStyle ?? design.surfaceStyle;

  const surfaceCSS = computeSurface(effectiveSurface, tokens, design, {
    accent:      modAccent,
    accentGlow:  modGlow,
    glowEnabled: moduleTheme?.glowEnabled,
    borderStyle: moduleTheme?.borderStyle,
  });

  const selAccent = modAccent ?? tokens.accent;
  const selGlow   = modGlow   ?? tokens.accentGlow;

  const displayLabel = moduleTheme?.customTitle ?? meta?.label ?? id;

  // When being dragged, ghost it
  const dragSelf: React.CSSProperties = isDragging
    ? { opacity: 0.35, transform: 'scale(0.97)' }
    : {};

  return (
    <div
      ref={ref}
      className={`relative group ${selected && designMode ? 'module-selected-pulse' : ''}`}
      draggable={designMode}
      onDragStart={() => designMode && onDragStart(id)}
      onDragOver={e  => designMode && onDragOver(e, id)}
      onDrop={e      => designMode && onDrop(e, id)}
      onDragEnd={() => designMode && onDragEnd()}
      onClick={handleClick}
      style={{
        cursor:          designMode ? (selected ? 'grabbing' : 'grab') : 'default',
        transition:      `transform ${design.transition}, opacity 0.2s ease`,
        opacity:         moduleTheme?.opacity ?? 1,
        transform:       selected && designMode ? 'scale(1.004)' : 'scale(1)',
        outline:         selected && designMode ? `2.5px solid ${selAccent}` : 'none',
        outlineOffset:   selected && designMode ? '4px' : '0',
        ...surfaceCSS,
        ...dragSelf,
      }}
    >
      {/* ── Drop-zone overlay when another module is dragged over this one ─── */}
      {dragOver && designMode && (
        <div
          className="drop-zone-pulse absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          style={{
            borderRadius:    surfaceCSS.borderRadius as string ?? `${design.radius}px`,
            border:         `2px dashed ${tokens.accent}`,
            backgroundColor: `${tokens.accentSubtle}`,
          }}
        >
          <span
            style={{
              ...META,
              fontSize:        '10px',
              color:           tokens.accent,
              backgroundColor: tokens.pageBg,
              padding:         '4px 10px',
              borderRadius:    '8px',
              border:         `1px solid ${tokens.accent}40`,
            }}
          >
            Drop here
          </span>
        </div>
      )}

      {/* ── Design-mode: drag handle + size badge (top-right) ─── */}
      {designMode && (
        <div
          className={`absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 transition-all duration-150 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Size badge */}
          <span
            style={{
              ...META,
              padding:         '2px 7px',
              borderRadius:    '5px',
              backgroundColor: selected ? tokens.accentSubtle : `${tokens.cardBg}e0`,
              color:           selected ? selAccent : tokens.textGhost,
              border:         `1px solid ${selected ? selAccent + '50' : tokens.cardBorder}`,
              backdropFilter:  'blur(8px)',
            }}
          >
            {SIZE_LABEL[size]}
          </span>

          {/* Drag handle — 3×2 dot grid */}
          <div
            title="Drag to reorder"
            style={{
              padding:         '5px 4px',
              borderRadius:    '7px',
              backgroundColor: selected ? tokens.accentSubtle : `${tokens.cardBg}e0`,
              border:         `1px solid ${selected ? selAccent + '50' : tokens.cardBorder}`,
              backdropFilter:  'blur(8px)',
              cursor:          'grab',
              display:         'grid',
              gridTemplateColumns: 'repeat(2, 4px)',
              gap:             '2.5px',
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width:           '3px',
                  height:          '3px',
                  borderRadius:    '50%',
                  backgroundColor: selected ? selAccent : tokens.textGhost,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Corner handles when selected ──────────────────────────────────── */}
      {designMode && selected && CORNERS.map((pos, i) => (
        <div
          key={i}
          style={{
            position:        'absolute',
            zIndex:          20,
            width:           '8px',
            height:          '8px',
            borderRadius:    '2px',
            backgroundColor: selAccent,
            boxShadow:      `0 0 6px ${selGlow}`,
            pointerEvents:   'none',
            ...pos,
          }}
        />
      ))}

      {/* ── Module label (bottom-left) in design mode ──────────────────── */}
      {designMode && (
        <div
          className="absolute bottom-2.5 left-3 z-10 flex items-center gap-1.5 pointer-events-none"
          style={{ opacity: selected ? 1 : 0.45, transition: 'opacity 0.15s ease' }}
        >
          {meta?.icon && (
            <span style={{ fontSize: '11px', lineHeight: 1 }}>{meta.icon}</span>
          )}
          <span style={{ ...META, color: selected ? selAccent : tokens.textGhost }}>
            {displayLabel}
          </span>
          {/* Per-module accent indicator */}
          {modAccent && (
            <span
              style={{
                display:         'inline-block',
                width:           '5px',
                height:          '5px',
                borderRadius:    '50%',
                backgroundColor: modAccent,
                boxShadow:       modGlow ? `0 0 4px ${modGlow}` : 'none',
              }}
            />
          )}
        </div>
      )}

      {/* ── Module content ─────────────────────────────────────────────── */}
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
