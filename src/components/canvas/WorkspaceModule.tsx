import { useRef } from 'react';
import { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { ModuleSize } from '../../hooks/useWorkspaceLayout';
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

const LABEL_STYLE: React.CSSProperties = {
  fontFamily:    "'Space Grotesk', sans-serif",
  fontSize:      '9px',
  letterSpacing: '0.13em',
  textTransform: 'uppercase' as const,
  fontWeight:    700,
};

export function WorkspaceModule({
  id, size: _size, designMode, selected, dragOver, isDragging,
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

  // ── Drag visual states ───────────────────────────────────────────────────
  const dragSelf: React.CSSProperties = isDragging
    ? {
        opacity:   0.3,
        transform: 'scale(0.95) rotate(0.8deg)',
        filter:    'saturate(0.4) blur(0.5px)',
      }
    : {};

  // ── Selection state — spatial lift instead of harsh outline ─────────────
  const selectionStyle: React.CSSProperties = selected && designMode
    ? {
        outline:      'none',
        // The CSS class handles the animated glow; add static transform
        transform:    isDragging ? 'scale(0.95) rotate(0.8deg)' : 'translateY(-2px) scale(1.002)',
        zIndex:       3,
        position:     'relative' as const,
      }
    : { outline: 'none' };

  // ── Hover in design mode (not selected) ──────────────────────────────────
  // Applied via inline style on wrapper; CSS class handles transitions

  return (
    <div
      ref={ref}
      className={`relative group transition-all ${
        selected && designMode ? 'module-selected-pulse' : ''
      }`}
      draggable={designMode}
      onDragStart={() => designMode && onDragStart(id)}
      onDragOver={e  => designMode && onDragOver(e, id)}
      onDrop={e      => designMode && onDrop(e, id)}
      onDragEnd={() => designMode && onDragEnd()}
      onClick={handleClick}
      style={{
        cursor:       designMode ? (selected ? 'grabbing' : 'grab') : 'default',
        opacity:      moduleTheme?.opacity ?? 1,
        transition:   `transform 0.25s cubic-bezier(0.32,0.72,0,1),
                       opacity 0.2s ease,
                       box-shadow 0.25s cubic-bezier(0.32,0.72,0,1)`,
        ...surfaceCSS,
        ...selectionStyle,
        ...dragSelf,
      }}
      onMouseEnter={e => {
        if (designMode && !selected && !isDragging) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            `${surfaceCSS.boxShadow ?? ''}, 0 8px 32px rgba(0,0,0,0.4)`;
        }
      }}
      onMouseLeave={e => {
        if (designMode && !selected && !isDragging) {
          (e.currentTarget as HTMLDivElement).style.transform = '';
          (e.currentTarget as HTMLDivElement).style.boxShadow = surfaceCSS.boxShadow as string ?? '';
        }
      }}
    >

      {/* ── Drop-zone overlay ─────────────────────────────────────────────── */}
      {dragOver && designMode && (
        <div
          className="drop-zone-pulse absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none"
          style={{
            borderRadius:    surfaceCSS.borderRadius as string ?? `${design.radius}px`,
            border:         `1.5px dashed ${selAccent}`,
            backgroundColor: `${selAccent}08`,
            backdropFilter:  'blur(4px)',
          }}
        >
          <div
            style={{
              padding:         '5px 12px',
              borderRadius:    '20px',
              backgroundColor: tokens.cardBg,
              border:         `1px solid ${selAccent}40`,
              boxShadow:       `0 0 12px ${selGlow}`,
            }}
          >
            <span style={{
              ...LABEL_STYLE,
              fontSize: '9px',
              color:    selAccent,
            }}>
              Drop here
            </span>
          </div>
        </div>
      )}

      {/* ── Design mode: drag handle ──────────────────────────────────────── */}
      {designMode && (
        <div
          className={`absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5
            transition-all duration-150 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — 3×2 dot grid */}
          <div
            title="Drag to reorder"
            style={{
              padding:             '5px 4px',
              borderRadius:        '8px',
              backgroundColor:     `${tokens.cardBg}f0`,
              border:              `1px solid ${tokens.cardBorder}`,
              backdropFilter:      'blur(12px)',
              cursor:              'grab',
              display:             'grid',
              gridTemplateColumns: 'repeat(2, 4px)',
              gap:                 '3px',
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width:           '3px',
                  height:          '3px',
                  borderRadius:    '50%',
                  backgroundColor: tokens.textMuted,
                  opacity:         0.5,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Module label — bottom, with icon ──────────────────────────────── */}
      {designMode && (
        <div
          className="absolute bottom-2.5 left-3 z-10 flex items-center gap-1.5 pointer-events-none"
          style={{
            opacity:    selected ? 1 : 0.5,
            transition: 'opacity 0.2s ease',
          }}
        >
          {meta?.icon && (
            <span style={{ fontSize: '10px', lineHeight: 1 }}>{meta.icon}</span>
          )}
          <span style={{ ...LABEL_STYLE, color: selected ? selAccent : tokens.textMuted }}>
            {displayLabel}
          </span>

          {/* Per-module accent dot */}
          {modAccent && (
            <span
              style={{
                display:         'inline-block',
                width:           '5px',
                height:          '5px',
                borderRadius:    '50%',
                backgroundColor: modAccent,
                boxShadow:       modGlow ? `0 0 6px ${modGlow}` : 'none',
              }}
            />
          )}
        </div>
      )}

      {/* ── Module content ────────────────────────────────────────────────── */}
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
