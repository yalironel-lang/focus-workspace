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
import { GripHorizontal, X, Copy, Link2 } from 'lucide-react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { BlockPos } from '../../hooks/useBlockPositions';
import {
  freeSpaceMaterialStyle,
  type FreeSpaceMaterialTier,
} from '../../lib/freeSpaceMaterials';

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
  /** Free Space: enter “connect to…” mode from this object */
  onBeginConnect?: (id: string) => void;
  /** Visual emphasis for connection graph (dim / highlight / connect-target hover) */
  connectionChrome?: 'neutral' | 'dim' | 'emphasis' | 'connect-target';
  /** When set, hovering this block (if not source) signals a valid connect target */
  connectModeSourceId?: string | null;
  onConnectHoverTarget?: (targetId: string | null) => void;
  /** Focus Mode: added to stacking order for emphasized cards. */
  presentationZBoost?: number;
  /** Material tier — primary thinking surfaces vs lighter utility chrome. */
  materialTier?: FreeSpaceMaterialTier;
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
  onBeginConnect,
  connectionChrome = 'neutral',
  connectModeSourceId = null,
  onConnectHoverTarget,
  presentationZBoost = 0,
  materialTier = 'utility',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const material = freeSpaceMaterialStyle(materialTier);

  const w = pos.w > 0 ? pos.w : undefined;
  const h = pos.h > 0 ? pos.h : undefined;

  const engaged = selected || hovered || isDragging;
  const recede = !engaged;
  const showResize = selected || hovered || (isDragging && activeGesture === 'resize');

  const headerHot = hovered || selected || isDragging;
  const showActions = (selected || designMode) && (onDuplicate || onRemove);
  const actionOpacity = headerHot || selected ? 1 : designMode ? 0.42 : 0;

  const showConnectAction = !!onBeginConnect && designMode && (headerHot || selected);
  const isConnectTargetHover =
    !!connectModeSourceId && connectModeSourceId !== id && connectionChrome === 'connect-target';

  const anchorNudge = deepFocusAnchor && !isDragging ? ' translateY(-1px)' : '';

  let transform = `translate3d(0,0,0) scale(1)${anchorNudge}`;
  if (isConnectTargetHover) transform = `translate3d(0,-2px,0) scale(1.002)${anchorNudge}`;
  else if (isDragging && activeGesture === 'resize') transform = `translate3d(0,-2px,0) scale(1.002)${anchorNudge}`;
  else if (isDragging) transform = `translate3d(0,-4px,0) scale(1.004) rotate(0.12deg)${anchorNudge}`;
  else if (selected) transform = `translate3d(0,-3px,0) scale(1.0015)${anchorNudge}`;
  else if (hovered) transform = `translate3d(0,-1px,0) scale(1.0008)${anchorNudge}`;
  else if (recede) transform = `translate3d(0,0,0) scale(0.9995)${anchorNudge}`;

  let filter = 'none';
  if (isDragging) filter = 'brightness(1.03) saturate(1.04)';
  else if (selected) filter = 'brightness(1.018) saturate(1.02)';
  else if (hovered) filter = 'brightness(1.01) saturate(1.015)';
  else if (recede) filter = `brightness(${material.idleBrightness}) saturate(0.98)`;
  if (connectionChrome === 'dim') {
    filter = filter === 'none'
      ? 'brightness(0.99) saturate(0.97)'
      : `${filter} brightness(0.992)`;
  } else if (connectionChrome === 'emphasis') {
    filter = filter === 'none'
      ? 'brightness(1.04) saturate(1.04)'
      : `${filter} brightness(1.02)`;
  }
  if (deepFocusAnchor && !isDragging) {
    filter = filter === 'none'
      ? 'brightness(1.018) saturate(1.03)'
      : `saturate(1.03) ${filter}`;
  }

  const sheen = material.surfaceSheen;
  const innerRim = `inset 0 1px 0 rgba(255,255,255,${(0.07 + sheen * 0.4).toFixed(3)})`;
  const outerRim = engaged ? ', 0 0 0 1px rgba(255,255,255,0.032)' : '';
  const innerHighlight = selected
    ? `, inset 0 0 0 1px ${tokens.accent}12`
    : hovered
      ? `, inset 0 0 0 1px rgba(255,255,255,${(0.06 + sheen).toFixed(3)})`
      : '';
  const shadowBase = material.shadowMul;
  let boxShadow = `${innerRim}${outerRim}, ${tokens.shadowMd}`;
  if (isDragging && activeGesture === 'resize') {
    boxShadow = `${innerRim}${innerHighlight}, 0 8px 20px rgba(0,0,0,${(0.2 * shadowBase).toFixed(2)}), ${tokens.shadowLg}`;
  } else if (isDragging) {
    boxShadow = `${innerRim}${innerHighlight}, 0 8px 16px rgba(0,0,0,${(0.2 * shadowBase).toFixed(2)}), 0 22px 48px rgba(0,0,0,${(0.3 * shadowBase).toFixed(2)})`;
  } else if (selected) {
    boxShadow = `${innerRim}${innerHighlight}, 0 6px 14px rgba(0,0,0,${(0.18 * shadowBase).toFixed(2)}), ${tokens.shadowLg}`;
  } else if (hovered) {
    boxShadow = `${innerRim}${outerRim}, 0 6px 14px rgba(0,0,0,${(0.16 * shadowBase).toFixed(2)}), 0 16px 36px rgba(0,0,0,${(0.24 * shadowBase).toFixed(2)})`;
  } else {
    boxShadow = `${innerRim}, 0 4px 12px rgba(0,0,0,${(0.12 * shadowBase).toFixed(2)})`;
  }
  if (deepFocusAnchor && !isDragging) {
    boxShadow = `${boxShadow}, 0 14px 36px rgba(0,0,0,0.26)`;
  }

  const borderColor = isConnectTargetHover
    ? 'rgba(251,191,36,0.32)'
    : selected || hovered
      ? tokens.cardBorderHover
      : material.borderIdleMul < 0.55
        ? tokens.divider
        : tokens.cardBorder;

  const z = (isDragging ? 10 : selected ? 7 : hovered ? 4 : 2) + presentationZBoost;

  return (
    <div
      ref={ref}
      data-freeform-block={id}
      onClick={e => {
        e.stopPropagation();
        onSelect(id);
      }}
      onMouseEnter={() => {
        setHovered(true);
        if (connectModeSourceId && connectModeSourceId !== id) {
          onConnectHoverTarget?.(id);
        }
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (connectModeSourceId && connectModeSourceId !== id) {
          onConnectHoverTarget?.(null);
        }
      }}
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
          ? 'box-shadow 0.2s ease'
          : `transform 0.42s ${liftEase}, box-shadow 0.38s ${chromeEase}, border-color 0.32s ${chromeEase}, filter 0.38s ${chromeEase}`,
      }}
    >
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
            height: '28px',
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
            borderBottom: headerHot && (materialTier === 'primary' || selected)
              ? `1px solid ${selected ? `${tokens.accent}10` : `${tokens.divider}88`}`
              : '1px solid transparent',
            transition: `background 0.35s ${chromeEase}, border-color 0.35s ${chromeEase}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
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
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.11em',
                  textTransform: 'uppercase' as const,
                  color: selected ? tokens.textMuted : tokens.textSecondary,
                  maxWidth: '160px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  opacity: headerHot || selected ? (selected ? 0.82 : 0.62) : 0,
                  transition: `opacity 0.32s ${chromeEase}`,
                }}
              >
                {label}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {showConnectAction && (
              <button
                type="button"
                aria-label="Connect block"
                title="Connect to…"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  onBeginConnect?.(id);
                }}
                style={{
                  width: '30px',
                  height: '28px',
                  borderRadius: '7px',
                  border: '1px solid transparent',
                  background: 'rgba(251,191,36,0.06)',
                  cursor: 'pointer',
                  color: 'rgba(251,191,36,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: headerHot ? 1 : 0,
                  pointerEvents: headerHot ? 'auto' : 'none',
                  transition: `opacity 0.32s ${chromeEase}, color 0.2s ease, background 0.2s ease`,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'rgba(251,191,36,0.12)';
                  el.style.color = 'rgba(253,186,116,0.95)';
                  el.style.borderColor = 'rgba(251,191,36,0.2)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'rgba(251,191,36,0.06)';
                  el.style.color = 'rgba(251,191,36,0.55)';
                  el.style.borderColor = 'transparent';
                }}
              >
                <Link2 style={{ width: '13px', height: '13px' }} strokeWidth={2} />
              </button>
            )}

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
                  aria-label="Duplicate block"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    onDuplicate(id);
                  }}
                  title="Duplicate"
                  style={{
                    width: '30px',
                    height: '28px',
                    borderRadius: '7px',
                    border: '1px solid transparent',
                    background: 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    color: tokens.textSecondary,
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
                    el.style.color = tokens.textSecondary;
                    el.style.borderColor = 'transparent';
                  }}
                >
                  <Copy style={{ width: '12px', height: '12px', opacity: 0.92 }} />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  aria-label="Remove block"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    onRemove(id);
                  }}
                  title="Remove"
                  style={{
                    width: '30px',
                    height: '28px',
                    borderRadius: '7px',
                    border: '1px solid transparent',
                    background: 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                    color: tokens.textSecondary,
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
                    el.style.color = tokens.textSecondary;
                    el.style.borderColor = 'transparent';
                  }}
                >
                  <X style={{ width: '12px', height: '12px', opacity: 0.92 }} />
                </button>
              )}
            </div>
          )}
          </div>
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
              boxShadow: `0 1px 4px rgba(0,0,0,0.2), inset 0 0 0 1px ${tokens.accent}28`,
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
