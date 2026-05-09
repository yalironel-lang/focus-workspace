/**
 * FreeformCanvas — infinite spatial canvas with pan, zoom, and free-floating blocks.
 *
 * Architecture:
 *   - Outer div: viewport container (overflow:hidden, captures mouse/wheel events)
 *   - Inner "world" div: CSS transform (translate + scale), origin top-left
 *   - Each block: position:absolute inside the world
 *
 * Interactions:
 *   - Pan:    drag empty canvas background
 *   - Zoom:   scroll wheel (zooms toward cursor position)
 *   - Move block:   mousedown on block drag-handle → mousemove → mouseup
 *   - Resize block: mousedown on resize handle → mousemove → mouseup
 *   - Select: click block
 *   - Deselect: click empty canvas
 *
 * Design mode adds the dot-grid background and block controls.
 * Normal (view) mode hides controls and allows content interaction.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Wand2, Move, X } from 'lucide-react';

const GUIDE_KEY = 'fw_free_canvas_guide_seen_v1';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ModuleConfig } from '../../hooks/useWorkspaceLayout';
import type { CustomBlock } from '../../hooks/useCustomBlocks';
import type { CustomTool } from '../../hooks/useCustomTools';
import type { BlockPos, PositionMap } from '../../hooks/useBlockPositions';
import type { CanvasModeState } from '../../hooks/useCanvasMode';
import { FreeformBlock } from './FreeformBlock';
import { CustomToolBlock } from './CustomToolBlock';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../../hooks/useCanvasMode';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DragState {
  type:       'canvas' | 'block-move' | 'block-resize';
  blockId?:   string;
  startMouseX: number;
  startMouseY: number;
  // canvas pan on drag start
  startPanX?:  number;
  startPanY?:  number;
  // block position/size on drag start
  startBlockX?: number;
  startBlockY?: number;
  startBlockW?: number;
  startBlockH?: number;
}

interface Props {
  tokens:       AtmosphereTokens;
  modules:      ModuleConfig[];
  blocks:       CustomBlock[];
  tools:        CustomTool[];
  positions:    PositionMap;
  canvasState:  CanvasModeState;
  designMode:   boolean;
  selectedId:   string | null;
  onSetPos:     (id: string, pos: Partial<BlockPos>) => void;
  onSelect:     (id: string | null) => void;
  onRemoveModule:  (id: string) => void;
  onRemoveBlock:   (id: string) => void;
  onRemoveTool:    (id: string) => void;
  onDuplicateBlock: (id: string) => void;
  onOpenAdd:    () => void;
  /** Render a system module's content by ID */
  renderModuleContent: (id: string) => React.ReactNode | null;
  /** Label for a given module/block ID */
  getLabel:     (id: string) => string;
}

// ── Canvas controls ───────────────────────────────────────────────────────────

function CanvasControls({
  tokens, zoom, snapToGrid,
  onZoomIn, onZoomOut, onReset, onCenter, onToggleSnap, onAutoOrganize,
}: {
  tokens: AtmosphereTokens;
  zoom: number;
  snapToGrid: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onCenter: () => void;
  onToggleSnap: () => void;
  onAutoOrganize: () => void;
}) {
  const btn: React.CSSProperties = {
    width:           '30px',
    height:          '30px',
    borderRadius:    '8px',
    border:          'none',
    backgroundColor: 'transparent',
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    color:           tokens.textGhost,
    transition:      'all 0.12s ease',
    flexShrink:      0,
  };

  const divider = (
    <div style={{ width: '1px', height: '14px', backgroundColor: tokens.divider, margin: '0 2px' }} />
  );

  return (
    <div
      style={{
        position:             'absolute',
        bottom:               '20px',
        left:                 '50%',
        transform:            'translateX(-50%)',
        zIndex:               30,
        display:              'flex',
        alignItems:           'center',
        gap:                  '2px',
        padding:              '4px',
        borderRadius:         '13px',
        backgroundColor:      `${tokens.cardBg}ee`,
        border:               `1px solid ${tokens.cardBorder}`,
        backdropFilter:       'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        boxShadow:            '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <button style={btn} title="Zoom out" onClick={onZoomOut}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}>
        <ZoomOut style={{ width: '13px', height: '13px' }} />
      </button>

      {/* Zoom label */}
      <button
        onClick={onReset}
        title="Reset zoom to 100%"
        style={{
          ...btn,
          width:      'auto',
          padding:    '0 8px',
          fontFamily: "'Space Grotesk', monospace",
          fontSize:   '10px',
          fontWeight: 700,
          color:      tokens.textMuted,
          letterSpacing: '0.04em',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
      >
        {Math.round(zoom * 100)}%
      </button>

      <button style={btn} title="Zoom in" onClick={onZoomIn}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}>
        <ZoomIn style={{ width: '13px', height: '13px' }} />
      </button>

      {divider}

      <button style={btn} title="Center view" onClick={onCenter}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}>
        <Maximize2 style={{ width: '12px', height: '12px' }} />
      </button>

      {divider}

      <button
        style={{
          ...btn,
          backgroundColor: snapToGrid ? `${tokens.accent}18` : 'transparent',
          color:           snapToGrid ? tokens.accent : tokens.textGhost,
          border:          snapToGrid ? `1px solid ${tokens.accent}30` : '1px solid transparent',
        }}
        title={snapToGrid ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
        onClick={onToggleSnap}
        onMouseEnter={e => { if (!snapToGrid) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; } }}
        onMouseLeave={e => { if (!snapToGrid) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; } }}
      >
        <Grid3x3 style={{ width: '13px', height: '13px' }} />
      </button>

      {divider}

      <button
        style={{ ...btn, width: 'auto', padding: '0 8px', gap: '4px',
          fontFamily: "'Space Grotesk', sans-serif", fontSize: '10px', fontWeight: 600,
          color: tokens.textGhost, whiteSpace: 'nowrap' as const }}
        title="Auto-organize blocks"
        onClick={onAutoOrganize}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentSubtle; (e.currentTarget as HTMLButtonElement).style.color = tokens.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}
      >
        <Wand2 style={{ width: '11px', height: '11px' }} />
        Organize
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FreeformCanvas({
  tokens, modules, blocks, tools, positions,
  canvasState, designMode, selectedId,
  onSetPos, onSelect,
  onRemoveModule, onRemoveBlock, onRemoveTool, onDuplicateBlock,
  onOpenAdd, renderModuleContent, getLabel,
}: Props) {
  const viewportRef  = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try { return !localStorage.getItem(GUIDE_KEY); } catch { return false; }
  });

  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* quota */ }
  }, []);

  const { zoom, panX, panY, snapToGrid, gridSize, setViewport, setPan, resetView, centerView, toggleSnap } = canvasState;

  // ── All renderable items ───────────────────────────────────────────────────

  const enabledModules = modules.filter(m => m.enabled).sort((a, b) => a.order - b.order);

  // All item IDs in render order (modules → blocks → tools)
  type CanvasItem =
    | { kind: 'module'; id: string }
    | { kind: 'block';  id: string }
    | { kind: 'tool';   id: string };

  const allItems: CanvasItem[] = [
    ...enabledModules.map(m => ({ kind: 'module' as const, id: m.id })),
    ...blocks.map(b => ({ kind: 'block' as const, id: b.id })),
    ...tools.map(t => ({ kind: 'tool' as const, id: t.id })),
  ];

  // ── Auto-organize ─────────────────────────────────────────────────────────

  const handleAutoOrganize = useCallback(() => {
    const COLS   = 3;
    const COL_W  = 360;
    const ROW_H  = 320;
    const GAP_X  = 24;
    const GAP_Y  = 24;
    allItems.forEach(({ id }, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      onSetPos(id, {
        x: GAP_X + col * (COL_W + GAP_X),
        y: GAP_Y + row * (ROW_H + GAP_Y),
        w: COL_W,
      });
    });
  }, [allItems, onSetPos]);

  // ── Center view ───────────────────────────────────────────────────────────

  const handleCenterView = useCallback(() => {
    if (!viewportRef.current || allItems.length === 0) { resetView(); return; }
    const vw = viewportRef.current.clientWidth;
    const vh = viewportRef.current.clientHeight;
    let maxX = 0, maxY = 0;
    for (const { id } of allItems) {
      const pos = positions[id];
      if (!pos) continue;
      maxX = Math.max(maxX, pos.x + (pos.w || 340));
      maxY = Math.max(maxY, pos.y + 300);
    }
    centerView(maxX, maxY, vw, vh);
  }, [allItems, positions, centerView, resetView]);

  // ── Snap helper ───────────────────────────────────────────────────────────

  const snap = useCallback((v: number): number => {
    if (!snapToGrid) return v;
    return Math.round(v / gridSize) * gridSize;
  }, [snapToGrid, gridSize]);

  // ── Mouse event handlers ──────────────────────────────────────────────────

  const onBlockMouseDown = useCallback((blockId: string, e: React.MouseEvent, type: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(blockId);
    const pos = positions[blockId] ?? { x: 0, y: 0, w: 340, h: 0 };
    dragRef.current = {
      type:        type === 'move' ? 'block-move' : 'block-resize',
      blockId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBlockX: pos.x,
      startBlockY: pos.y,
      startBlockW: pos.w || 340,
      startBlockH: pos.h || 200,
    };
    setDraggingId(blockId);
  }, [positions, onSelect]);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on left-click on empty canvas
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-freeform-block]')) return;
    onSelect(null);
    dragRef.current = {
      type:        'canvas',
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanX:   panX,
      startPanY:   panY,
    };
  }, [onSelect, panX, panY]);

  // Attach global mousemove/mouseup on mount (avoids losing drag on fast moves)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;

      if (drag.type === 'canvas') {
        setPan((drag.startPanX ?? 0) + dx, (drag.startPanY ?? 0) + dy);
      } else if (drag.type === 'block-move' && drag.blockId != null) {
        const newX = snap((drag.startBlockX ?? 0) + dx / zoom);
        const newY = snap((drag.startBlockY ?? 0) + dy / zoom);
        onSetPos(drag.blockId, { x: newX, y: newY });
      } else if (drag.type === 'block-resize' && drag.blockId != null) {
        const newW = Math.max(200, snap((drag.startBlockW ?? 340) + dx / zoom));
        const newH = Math.max(80,  snap((drag.startBlockH ?? 200) + dy / zoom));
        onSetPos(drag.blockId, { w: newW, h: newH });
      }
    };

    const onUp = () => {
      dragRef.current = null;
      setDraggingId(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [zoom, snap, setPan, onSetPos]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect   = el.getBoundingClientRect();
      const curX   = e.clientX - rect.left;
      const curY   = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? (1 + ZOOM_STEP) : (1 - ZOOM_STEP);
      const newZ   = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
      const newPX  = curX - (curX - panX) * (newZ / zoom);
      const newPY  = curY - (curY - panY) * (newZ / zoom);
      setViewport(newZ, newPX, newPY);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, panX, panY, setViewport]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); resetView(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setViewport(Math.min(ZOOM_MAX, zoom + ZOOM_STEP), panX, panY);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        setViewport(Math.max(ZOOM_MIN, zoom - ZOOM_STEP), panX, panY);
      }
      // Space+drag or just check for space to change cursor (cosmetic)
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoom, panX, panY, setViewport, resetView]);

  // ── Dot grid background ───────────────────────────────────────────────────

  const dotSpacing = gridSize * zoom;
  const dotOffX    = ((panX % dotSpacing) + dotSpacing) % dotSpacing;
  const dotOffY    = ((panY % dotSpacing) + dotSpacing) % dotSpacing;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={viewportRef}
      style={{
        position:   'fixed',
        top:        '48px',       // below CommandBar
        left:       0,
        right:      0,
        bottom:     0,
        overflow:   'hidden',
        cursor:     draggingId ? 'grabbing' : 'default',
        userSelect: draggingId ? 'none' : undefined,
        backgroundColor: tokens.pageBg,
      }}
      onMouseDown={onCanvasMouseDown}
    >
      {/* ── Dot grid ───────────────────────────────────────────── */}
      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        width="100%" height="100%"
      >
        <defs>
          <pattern
            id="fw-dot-grid"
            x={dotOffX}
            y={dotOffY}
            width={dotSpacing}
            height={dotSpacing}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={dotSpacing / 2}
              cy={dotSpacing / 2}
              r={zoom > 0.5 ? 1 : 0.5}
              fill={`${tokens.accent}20`}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#fw-dot-grid)" />
      </svg>

      {/* ── World transform ─────────────────────────────────────── */}
      <div
        style={{
          position:       'absolute',
          inset:          0,
          transformOrigin: '0 0',
          transform:      `translate(${panX}px, ${panY}px) scale(${zoom})`,
          willChange:     'transform',
        }}
      >
        {allItems.map(item => {
          const pos = positions[item.id] ?? { x: 40, y: 40, w: 340, h: 0 };

          const handleRemove = () => {
            if (item.kind === 'module') onRemoveModule(item.id);
            else if (item.kind === 'block') onRemoveBlock(item.id);
            else onRemoveTool(item.id);
          };

          const handleDuplicate = item.kind === 'block'
            ? () => onDuplicateBlock(item.id)
            : undefined;

          const content = (() => {
            if (item.kind === 'module') return renderModuleContent(item.id);
            if (item.kind === 'block') {
              // BlockRenderer is rendered by parent; we just need a placeholder here.
              // The parent passes renderModuleContent which handles both modules and blocks.
              return renderModuleContent(item.id);
            }
            if (item.kind === 'tool') {
              const tool = tools.find(t => t.id === item.id);
              if (!tool) return null;
              return <CustomToolBlock tool={tool} tokens={tokens} />;
            }
            return null;
          })();

          if (content === null) return null;

          return (
            <FreeformBlock
              key={item.id}
              id={item.id}
              pos={pos}
              label={getLabel(item.id)}
              tokens={tokens}
              selected={selectedId === item.id}
              designMode={designMode}
              isDragging={draggingId === item.id}
              onBlockMouseDown={onBlockMouseDown}
              onSelect={onSelect}
              onRemove={handleRemove}
              onDuplicate={handleDuplicate}
            >
              {content}
            </FreeformBlock>
          );
        })}

        {/* ── Empty state ────────────────────────────────────── */}
        {allItems.length === 0 && (
          <div style={{
            position: 'absolute', left: '50%', top: '38%',
            transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px', margin: '0 auto 12px',
              backgroundColor: tokens.accentSubtle,
              border: `1px solid ${tokens.accent}25`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Move style={{ width: '20px', height: '20px', color: tokens.accent, opacity: 0.7 }} />
            </div>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '14px', fontWeight: 600, color: tokens.textSecondary, margin: 0 }}>
              Your Free Space is empty
            </p>
            <p style={{ fontSize: '12px', color: tokens.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>
              Press <kbd style={{ fontFamily: 'monospace', padding: '1px 5px', borderRadius: '4px', border: `1px solid ${tokens.cardBorder}`, fontSize: '11px', color: tokens.textSecondary, backgroundColor: tokens.wellBg }}>⌘K</kbd> to add cards, tools, and modules
            </p>
          </div>
        )}

        {/* ── Selection hint (nothing selected, has items) ──── */}
        {allItems.length > 0 && !selectedId && !draggingId && (
          <div style={{
            position: 'absolute', left: '50%', bottom: '80px',
            transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none',
            opacity: 0.5, transition: 'opacity 0.3s ease',
          }}>
            <p style={{ fontSize: '11px', color: tokens.textMuted, margin: 0, whiteSpace: 'nowrap' }}>
              Click a card to select it · Drag its header to move
            </p>
          </div>
        )}
      </div>

      {/* ── Mode badge (top-left) ─────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: '12px', left: '16px', zIndex: 20,
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '3px 8px 3px 6px',
        borderRadius: '8px',
        backgroundColor: `${tokens.accent}14`,
        border: `1px solid ${tokens.accent}28`,
        color: tokens.accent,
        fontSize: '10px', fontWeight: 700,
        fontFamily: "'Space Grotesk', sans-serif",
        letterSpacing: '0.06em',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        <Move style={{ width: '9px', height: '9px' }} />
        FREE SPACE
      </div>

      {/* ── Move indicator (top-center badge) ─────────────────────── */}
      {draggingId && (
        <div style={{
          position:        'absolute',
          top:             '12px',
          left:            '50%',
          transform:       'translateX(-50%)',
          display:         'flex',
          alignItems:      'center',
          gap:             '5px',
          padding:         '4px 10px',
          borderRadius:    '8px',
          backgroundColor: `${tokens.accent}18`,
          border:          `1px solid ${tokens.accent}30`,
          color:           tokens.accent,
          fontSize:        '10px',
          fontWeight:      700,
          fontFamily:      "'Space Grotesk', sans-serif",
          letterSpacing:   '0.06em',
          pointerEvents:   'none',
          zIndex:          50,
        }}>
          <Move style={{ width: '10px', height: '10px' }} />
          Moving
        </div>
      )}

      {/* ── Canvas controls ────────────────────────────────────── */}
      <CanvasControls
        tokens={tokens}
        zoom={zoom}
        snapToGrid={snapToGrid}
        onZoomIn={() => setViewport(Math.min(ZOOM_MAX, zoom + ZOOM_STEP), panX, panY)}
        onZoomOut={() => setViewport(Math.max(ZOOM_MIN, zoom - ZOOM_STEP), panX, panY)}
        onReset={resetView}
        onCenter={handleCenterView}
        onToggleSnap={toggleSnap}
        onAutoOrganize={handleAutoOrganize}
      />

      {/* ── First-time guide overlay ──────────────────────────────── */}
      {showGuide && (
        <div style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 40,
          width: '240px',
          backgroundColor: `${tokens.cardBg}f4`,
          border: `1px solid ${tokens.cardBorder}`,
          borderRadius: `${Math.min(tokens.radius, 14)}px`,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: tokens.shadowMd,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px 8px',
            borderBottom: `1px solid ${tokens.divider}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '6px',
                backgroundColor: tokens.accentSubtle,
                border: `1px solid ${tokens.accent}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Move style={{ width: '10px', height: '10px', color: tokens.accent }} />
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 700, color: tokens.textPrimary,
                fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.01em',
              }}>
                Free Space
              </span>
            </div>
            <button
              onClick={dismissGuide}
              style={{
                width: '20px', height: '20px', borderRadius: '5px', border: 'none',
                backgroundColor: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: tokens.textGhost,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
            >
              <X style={{ width: '11px', height: '11px' }} />
            </button>
          </div>
          {/* Tips */}
          <div style={{ padding: '8px 12px 10px' }}>
            {([
              ['↔', 'Drag background to pan'],
              ['⌘+scroll', 'Zoom in/out'],
              ['⣿', 'Drag card header to move'],
              ['✦', 'Organize button to auto-tidy'],
            ] as const).map(([key, label]) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '4px 0',
              }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: '10px', fontWeight: 600,
                  color: tokens.accent, opacity: 0.85,
                  minWidth: '54px', flexShrink: 0,
                }}>
                  {key}
                </span>
                <span style={{ fontSize: '11px', color: tokens.textSecondary }}>
                  {label}
                </span>
              </div>
            ))}
            <button
              onClick={dismissGuide}
              style={{
                marginTop: '8px', width: '100%',
                padding: '5px 0',
                borderRadius: '7px',
                border: `1px solid ${tokens.accent}30`,
                backgroundColor: tokens.accentSubtle,
                color: tokens.accent,
                fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${tokens.accent}25`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentSubtle; }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Add button (bottom-right) ───────────────────────────── */}
      <button
        onClick={onOpenAdd}
        title="Add to canvas  ⌘K"
        style={{
          position:        'absolute',
          bottom:          '20px',
          right:           '20px',
          zIndex:          30,
          width:           '44px',
          height:          '44px',
          borderRadius:    '50%',
          border:          'none',
          backgroundColor: tokens.accent,
          color:           '#000',
          fontSize:        '22px',
          cursor:          'pointer',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          boxShadow:       `0 4px 20px ${tokens.accentGlow}, 0 0 0 1px ${tokens.accent}40`,
          transition:      'all 0.15s ease',
          fontWeight:      300,
          lineHeight:      1,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
      >
        +
      </button>
    </div>
  );
}
