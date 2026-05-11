/**
 * FreeformBlock — a single draggable, selectable block on the freeform canvas.
 *
 * Renders a styled card at absolute position (x, y) with optional
 * selected state. Drag is initiated by mousedown on the drag-handle bar
 * at the top; the parent canvas handles all mousemove/mouseup tracking.
 *
 * Resize: minimal corner affordance, visible on selection / hover / active resize.
 */

import { useRef, useState } from 'react';
import { GripHorizontal, X, Copy } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { BlockPos } from '../../hooks/useBlockPositions';

export type BlockActiveGesture = 'move' | 'resize' | null;

interface Props {
  id: string;
  pos: BlockPos;
  label?: string;
  tokens: AtmosphereTokens;
  selected: boolean;
  designMode: boolean;
  isDragging: boolean;
  /** When dragging this block, whether the gesture is move or resize (for chrome only). */
  activeGesture?: BlockActiveGesture;
  /** Free Space: notebook is in deep edit — subtle anchor lift and calmer chrome on this card only. */
  deepFocusAnchor?: boolean;
  children: React.ReactNode;
  onBlockMouseDown: (id: string, e: React.MouseEvent, type: 'move' | 'resize') => void;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

const chromeEase = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const liftEase = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function FreeformBlock({
  id,
  pos,
  label,
  tokens,
  selected,
  designMode,
  isDragging,
  activeGesture = null,
  deepFocusAnchor = false,
  children,
  onBlockMouseDown,
  onSelect,
  onRemove,
  onDuplicate,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const w = pos.w > 0 ? pos.w : undefined;
  const h = pos.h > 0 ? pos.h : undefined;

  const engaged = selected || hovered || isDragging;
  const recede = !engaged;
  const showResize = selected || hovered || (isDragging && activeGesture === 'resize');

  const headerHot = hovered || selected || isDragging;
  const showActions = (selected || designMode) && (onDuplicate || onRemove);
  const actionOpacity = headerHot ? 1 : designMode ? 0.28 : 0;

  const anchorNudge = deepFocusAnchor && !isDragging ? ' translateY(-1px)' : '';

  let transform = `translate3d(0,0,0) scale(1)${anchorNudge}`;
  if (isDragging && activeGesture === 'resize') transform = `translate3d(0,-3px,0) scale(1.004)${anchorNudge}`;
  else if (isDragging) transform = `translate3d(0,-5px,0) scale(1.01) rotate(0.28deg)${anchorNudge}`;
  else if (selected) transform = `translate3d(0,-4px,0) scale(1.003)${anchorNudge}`;
  else if (hovered) transform = `translate3d(0,-2px,0) scale(1.0018)${anchorNudge}`;
  else if (recede) transform = `translate3d(0,1px,0) scale(0.996)${anchorNudge}`;

  let filter = 'none';
  if (isDragging) filter = 'brightness(1.04) saturate(1.05)';
  else if (selected) filter = 'brightness(1.025) saturate(1.03)';
  else if (hovered) filter = 'brightness(1.012) saturate(1.02)';
  else if (recede) filter = 'brightness(0.97) saturate(0.96)';
  if (deepFocusAnchor && !isDragging) {
    filter = filter === 'none'
      ? 'brightness(1.018) saturate(1.03)'
      : `saturate(1.03) ${filter}`;
  }

  const innerRim = 'inset 0 1px 0 rgba(255,255,255,0.045)';
  const innerHighlight = selected
    ? `, inset 0 0 0 1px ${tokens.accent}14`
    : hovered
      ? ', inset 0 0 0 1px rgba(255,255,255,0.06)'
      : '';
  let boxShadow = `${innerRim}, 0 1px 2px rgba(0,0,0,0.16), 0 10px 28px rgba(0,0,0,0.14)`;
  if (isDragging && activeGesture === 'resize') {
    boxShadow = `${innerRim}${innerHighlight}, 0 4px 6px rgba(0,0,0,0.18), 0 22px 48px rgba(0,0,0,0.38), 0 0 40px ${tokens.accentGlow}33`;
  } else if (isDragging) {
    boxShadow = `${innerRim}${innerHighlight}, 0 6px 10px rgba(0,0,0,0.22), 0 28px 56px rgba(0,0,0,0.42), 0 0 52px ${tokens.accentGlow}40`;
  } else if (selected) {
    boxShadow = `${innerRim}${innerHighlight}, 0 4px 8px rgba(0,0,0,0.2), 0 18px 44px rgba(0,0,0,0.32), 0 0 36px ${tokens.accentGlow}38`;
  } else if (hovered) {
    boxShadow = `${innerRim}, 0 3px 6px rgba(0,0,0,0.16), 0 14px 36px rgba(0,0,0,0.26)`;
  }
  if (deepFocusAnchor && !isDragging) {
    boxShadow = `${boxShadow}, 0 18px 48px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.05)`;
  }

  const borderColor = selected
    ? 'rgba(255,255,255,0.07)'
    : hovered
      ? tokens.cardBorderHover
      : tokens.cardBorder;

  const z = isDragging ? 10 : selected ? 8 : hovered ? 5 : 2;

  return (
    <div
      ref={ref}
      data-freeform-block={id}
      onClick={e => {
        e.stopPropagation();
        onSelect(id);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        minWidth: '200px',
        maxWidth: '720px',
        borderRadius: '16px',
        isolation: 'isolate',
        zIndex: z,
        cursor: isDragging ? (activeGesture === 'resize' ? 'nwse-resize' : 'grabbing') : 'default',
        userSelect: isDragging ? 'none' : undefined,
        willChange: isDragging ? 'transform, box-shadow' : 'auto',
        transform,
        filter,
        boxShadow,
        border: `1px solid ${borderColor}`,
        backgroundColor: tokens.cardBg,
        overflow: 'hidden',
        transition: isDragging
          ? 'filter 0.2s ease, box-shadow 0.2s ease'
          : `transform 0.42s ${liftEase}, box-shadow 0.38s ${chromeEase}, filter 0.38s ${chromeEase}, border-color 0.32s ${chromeEase}`,
      }}
    >
      {/* Soft spatial halo — selected / hover only; passive, no layout thrash */}
      {(selected || hovered) && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '42%',
            width: '118%',
            height: '92%',
            transform: 'translate(-50%, -50%)',
            borderRadius: '22px',
            background: `radial-gradient(ellipse at 50% 35%, ${tokens.accentGlow}22 0%, transparent 62%)`,
            opacity: deepFocusAnchor ? Math.min(selected ? 0.55 : 0.28, 0.22) : selected ? 0.55 : 0.28,
            pointerEvents: 'none',
            zIndex: 0,
            transition: `opacity 0.45s ${chromeEase}`,
            filter: 'blur(10px)',
          }}
        />
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {/* Drag handle — calm chrome */}
        <div
          onMouseDown={e => {
            e.stopPropagation();
            onBlockMouseDown(id, e, 'move');
          }}
          style={{
            height: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            cursor: 'grab',
            flexShrink: 0,
            gap: '8px',
            userSelect: 'none',
            background: headerHot
              ? `linear-gradient(180deg, ${tokens.accent}0d 0%, transparent 100%)`
              : 'transparent',
            borderBottom: headerHot ? `1px solid ${selected ? `${tokens.accent}12` : tokens.divider}` : '1px solid transparent',
            transition: `background 0.35s ${chromeEase}, border-color 0.35s ${chromeEase}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <GripHorizontal
              style={{
                width: '12px',
                height: '12px',
                color: tokens.textGhost,
                flexShrink: 0,
                opacity: headerHot ? 0.42 : 0,
                transition: `opacity 0.32s ${chromeEase}`,
              }}
            />
            {label && (
              <span
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.11em',
                  textTransform: 'uppercase' as const,
                  color: selected ? tokens.textMuted : tokens.textGhost,
                  maxWidth: '160px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  opacity: headerHot ? (selected ? 0.75 : 0.5) : 0,
                  transition: `opacity 0.32s ${chromeEase}`,
                }}
              >
                {label}
              </span>
            )}
          </div>

          {showActions && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                flexShrink: 0,
                opacity: actionOpacity,
                pointerEvents: 'auto',
                transition: `opacity 0.38s ${chromeEase}`,
              }}
            >
              {onDuplicate && (
                <button
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    onDuplicate(id);
                  }}
                  title="Duplicate"
                  style={{
                    width: '26px',
                    height: '22px',
                    borderRadius: '7px',
                    border: '1px solid transparent',
                    background: 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    color: tokens.textGhost,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: `color 0.2s ${chromeEase}, background 0.2s ${chromeEase}, border-color 0.2s ${chromeEase}`,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = 'rgba(255,255,255,0.06)';
                    el.style.color = tokens.textMuted;
                    el.style.borderColor = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = 'rgba(255,255,255,0.03)';
                    el.style.color = tokens.textGhost;
                    el.style.borderColor = 'transparent';
                  }}
                >
                  <Copy style={{ width: '10px', height: '10px', opacity: 0.88 }} />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    onRemove(id);
                  }}
                  title="Remove"
                  style={{
                    width: '26px',
                    height: '22px',
                    borderRadius: '7px',
                    border: '1px solid transparent',
                    background: 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    color: tokens.textGhost,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: `color 0.2s ${chromeEase}, background 0.2s ${chromeEase}, border-color 0.2s ${chromeEase}`,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = 'rgba(248,113,113,0.08)';
                    el.style.color = '#fca5a5';
                    el.style.borderColor = 'rgba(248,113,113,0.12)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.background = 'rgba(255,255,255,0.03)';
                    el.style.color = tokens.textGhost;
                    el.style.borderColor = 'transparent';
                  }}
                >
                  <X style={{ width: '10px', height: '10px', opacity: 0.88 }} />
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 14px 14px', overflow: 'hidden', flex: 1, minHeight: 0 }}>{children}</div>

        {/* Resize affordance — minimal corner, generous hit target */}
        <div
          role="presentation"
          onMouseDown={e => {
            e.stopPropagation();
            onBlockMouseDown(id, e, 'resize');
          }}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '36px',
            height: '36px',
            cursor: 'nwse-resize',
            zIndex: 4,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: '8px 10px 10px 8px',
            opacity: showResize ? 1 : 0,
            pointerEvents: showResize ? 'auto' : 'none',
            transition: `opacity 0.28s ${chromeEase}`,
          }}
        >
          <div
            style={{
              width: '11px',
              height: '11px',
              borderRadius: '3px',
              boxShadow: `0 0 12px ${tokens.accentGlow}55, inset 0 0 0 1px ${tokens.accent}35`,
              background: `linear-gradient(135deg, ${tokens.accent}40 0%, transparent 55%)`,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                right: '1px',
                bottom: '1px',
                width: '7px',
                height: '7px',
                borderRight: `1.5px solid ${tokens.accent}`,
                borderBottom: `1.5px solid ${tokens.accent}`,
                borderRadius: '0 0 2px 0',
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
