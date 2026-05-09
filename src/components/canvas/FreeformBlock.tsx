/**
 * FreeformBlock — a single draggable, selectable block on the freeform canvas.
 *
 * Renders a styled card at absolute position (x, y) with optional
 * selected state. Drag is initiated by mousedown on the drag-handle bar
 * at the top; the parent canvas handles all mousemove/mouseup tracking.
 *
 * Resize: a small handle at the bottom-right corner.
 */

import { useRef, useState } from 'react';
import { GripHorizontal, X, Copy } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { BlockPos } from '../../hooks/useBlockPositions';

interface Props {
  id:          string;
  pos:         BlockPos;
  label?:      string;
  tokens:      AtmosphereTokens;
  selected:    boolean;
  designMode:  boolean;
  isDragging:  boolean;
  children:    React.ReactNode;
  onBlockMouseDown: (id: string, e: React.MouseEvent, type: 'move' | 'resize') => void;
  onSelect:    (id: string) => void;
  onRemove?:   (id: string) => void;
  onDuplicate?: (id: string) => void;
}

export function FreeformBlock({
  id, pos, label, tokens, selected, designMode, isDragging,
  children, onBlockMouseDown, onSelect, onRemove, onDuplicate,
}: Props) {
  const ref     = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const w = pos.w > 0 ? pos.w : undefined;   // undefined = let content size it
  const h = pos.h > 0 ? pos.h : undefined;

  return (
    <div
      ref={ref}
      data-freeform-block={id}
      onClick={e => { e.stopPropagation(); onSelect(id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position:        'absolute',
        left:            pos.x,
        top:             pos.y,
        width:           w,
        height:          h,
        minWidth:        '200px',
        maxWidth:        '720px',
        borderRadius:    '14px',
        backgroundColor: tokens.cardBg,
        border:          `1px solid ${selected ? tokens.accent + '50' : hovered ? tokens.cardBorderHover : tokens.cardBorder}`,
        boxShadow:       selected
          ? `0 0 0 1px ${tokens.accent}25, 0 12px 40px rgba(0,0,0,0.35), 0 0 24px ${tokens.accentGlow}`
          : hovered
            ? `0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)`
            : `0 2px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.03)`,
        transform:       selected && !isDragging ? 'translateY(-2px)' : 'none',
        transition:      isDragging
          ? 'none'
          : 'border-color 0.2s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.32,0.72,0,1)',
        overflow:        'hidden',
        cursor:          isDragging ? 'grabbing' : 'default',
        userSelect:      isDragging ? 'none' : undefined,
        zIndex:          selected ? 3 : hovered ? 2 : 1,
        willChange:      isDragging ? 'transform' : 'auto',
      }}
    >
      {/* ── Drag handle bar — ghost until hover/select ─────────────── */}
      <div
        onMouseDown={e => { e.stopPropagation(); onBlockMouseDown(id, e, 'move'); }}
        style={{
          height:          '20px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          padding:         '0 8px',
          cursor:          'grab',
          backgroundColor: selected
            ? `${tokens.accent}08`
            : 'transparent',
          borderBottom:    (selected || hovered)
            ? `1px solid ${selected ? tokens.accent + '15' : tokens.divider}`
            : '1px solid transparent',
          flexShrink:      0,
          gap:             '6px',
          userSelect:      'none',
          transition:      'background-color 0.2s ease, border-color 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <GripHorizontal
            style={{
              width:      '11px',
              height:     '11px',
              color:      selected ? tokens.accent : tokens.textGhost,
              flexShrink: 0,
              opacity:    (selected || hovered || isDragging) ? 0.5 : 0,
              transition: 'opacity 0.2s ease',
            }}
          />
          {label && (
            <span style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      '9px',
              fontWeight:    700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              color:         selected ? tokens.accent : tokens.textGhost,
              maxWidth:      '140px',
              overflow:      'hidden',
              textOverflow:  'ellipsis',
              whiteSpace:    'nowrap',
              opacity:       (selected || hovered) ? 0.7 : 0,
              transition:    'opacity 0.2s ease',
            }}>
              {label}
            </span>
          )}
        </div>

        {/* Action buttons — show on hover/select */}
        {(selected || designMode) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {onDuplicate && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onDuplicate(id); }}
                title="Duplicate"
                style={{
                  width: '18px', height: '18px', borderRadius: '5px',
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', color: tokens.textGhost,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}
              >
                <Copy style={{ width: '9px', height: '9px' }} />
              </button>
            )}
            {onRemove && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onRemove(id); }}
                title="Remove"
                style={{
                  width: '18px', height: '18px', borderRadius: '5px',
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', color: tokens.textGhost,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ef444420'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}
              >
                <X style={{ width: '9px', height: '9px' }} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div style={{ padding: '14px', overflow: 'hidden' }}>
        {children}
      </div>

      {/* ── Resize handle (bottom-right) ──────────────────────────── */}
      <div
        onMouseDown={e => { e.stopPropagation(); onBlockMouseDown(id, e, 'resize'); }}
        style={{
          position:  'absolute',
          bottom:    '4px',
          right:     '4px',
          width:     '14px',
          height:    '14px',
          cursor:    'nwse-resize',
          opacity:   selected ? 0.6 : 0,
          transition: 'opacity 0.15s ease',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block' }}>
          <path d="M 14 8 L 14 14 L 8 14" fill="none"
            stroke={tokens.accent} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 14 3 L 14 14 L 3 14" fill="none"
            stroke={tokens.accent} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
        </svg>
      </div>
    </div>
  );
}
