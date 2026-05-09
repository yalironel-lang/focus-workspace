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

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Wand2, Move, X } from 'lucide-react';

const GUIDE_KEY     = 'fw_free_canvas_guide_seen_v1';
const ACTIVITY_KEY  = 'fw_obj_activity_v2';

// Freshness: 1.0 when recently used, fades to 0.72 after 3+ days of no touch
function computeFreshness(lastActive: number): number {
  const hoursAgo = (Date.now() - lastActive) / 3_600_000;
  if (hoursAgo < 1)   return 1.0;
  if (hoursAgo < 24)  return 1.0 - (hoursAgo / 24) * 0.12;   // 1.0 → 0.88
  if (hoursAgo < 72)  return 0.88 - ((hoursAgo - 24) / 48) * 0.16; // 0.88 → 0.72
  return 0.72;
}
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
  // velocity tracking (canvas pan and block move)
  lastX?:     number;
  lastY?:     number;
  lastT?:     number;
  // last applied block world position — starting point for block inertia
  currentBlockX?: number;
  currentBlockY?: number;
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
  /** True when a focus session is active — environment shifts */
  activeSession?: boolean;
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
  tokens, zoom, snapToGrid, visible,
  onZoomIn, onZoomOut, onReset, onCenter, onToggleSnap, onAutoOrganize,
}: {
  tokens: AtmosphereTokens;
  zoom: number;
  snapToGrid: boolean;
  visible: boolean;
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
        transform:            `translateX(-50%) translateY(${visible ? '0' : '6px'})`,
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
        opacity:              visible ? 1 : 0,
        pointerEvents:        visible ? 'auto' : 'none',
        transition:           'opacity 0.25s ease, transform 0.25s ease',
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
        style={btn}
        title="Auto-organize"
        onClick={onAutoOrganize}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentSubtle; (e.currentTarget as HTMLButtonElement).style.color = tokens.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textGhost; }}
      >
        <Wand2 style={{ width: '13px', height: '13px' }} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FreeformCanvas({
  tokens, modules, blocks, tools, positions,
  canvasState, designMode, selectedId, activeSession = false,
  onSetPos, onSelect,
  onRemoveModule, onRemoveBlock, onRemoveTool, onDuplicateBlock,
  onOpenAdd, renderModuleContent, getLabel,
}: Props) {
  const viewportRef  = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<DragState | null>(null);
  const [draggingId,      setDraggingId]      = useState<string | null>(null);
  // Controls bar is ambient — only surfaces near the bottom edge
  const [controlsNear,   setControlsNear]    = useState(false);

  // ── Momentum / inertia refs ───────────────────────────────────────────────
  const velRef  = useRef({ vx: 0, vy: 0 });  // velocity in px/ms
  const rafRef  = useRef(0);                   // animation frame handle

  // ── Object aging ─────────────────────────────────────────────────────────
  // Loaded synchronously so return ritual can run on first render.
  const activityRef = useRef<Record<string, number>>(
    (() => {
      try {
        const raw = localStorage.getItem(ACTIVITY_KEY);
        return raw ? (JSON.parse(raw) as Record<string, number>) : {};
      } catch { return {}; }
    })()
  );

  // ── Return ritual ─────────────────────────────────────────────────────────
  // On mount: softly re-illuminate the most recently touched object for 1.8s.
  // No text. No modal. Just a quiet "welcome back, here's where you left off."
  const [returnId, setReturnId] = useState<string | null>(() => {
    const entries = Object.entries(activityRef.current);
    if (entries.length === 0) return null;
    const [id, ts] = entries.reduce((a, b) => b[1] > a[1] ? b : a);
    const hoursAgo = (Date.now() - ts) / 3_600_000;
    return hoursAgo < 72 ? id : null; // only highlight if touched within 3 days
  });

  useEffect(() => {
    if (!returnId) return;
    const timer = setTimeout(() => setReturnId(null), 1800);
    return () => clearTimeout(timer);
  }, [returnId]);

  const [showGuide, setShowGuide] = useState<boolean>(() => {
    try { return !localStorage.getItem(GUIDE_KEY); } catch { return false; }
  });

  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* quota */ }
  }, []);

  const { zoom, panX, panY, snapToGrid, gridSize, setViewport, setPan, resetView, centerView, toggleSnap } = canvasState;

  // Live pan values — updated each render so the RAF momentum loop can read
  // current values without stale closures
  const liveViewRef = useRef({ panX, panY });
  liveViewRef.current = { panX, panY };

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

  // ── Proximity clustering ──────────────────────────────────────────────────
  // Detect groups of objects that live close together and render a shared
  // ghost backdrop — a visual signal that these things belong in the same region.

  const PROXIMITY = 80; // world-space px — how close centers must be to cluster

  interface ClusterBox { x: number; y: number; w: number; h: number }

  const clusters = useMemo((): ClusterBox[] => {
    if (allItems.length < 2) return [];

    // Compute bounding box center for each item
    const centers = allItems.map(({ id }) => {
      const p = positions[id];
      if (!p) return null;
      const bw = p.w > 0 ? p.w : 340;
      const bh = p.h > 0 ? p.h : 220;
      return { id, cx: p.x + bw / 2, cy: p.y + bh / 2, x: p.x, y: p.y, bw, bh };
    }).filter(Boolean) as Array<{ id: string; cx: number; cy: number; x: number; y: number; bw: number; bh: number }>;

    // Union-Find grouping by proximity
    const parent: Record<string, string> = {};
    centers.forEach(c => { parent[c.id] = c.id; });
    const find = (id: string): string => {
      if (parent[id] !== id) parent[id] = find(parent[id]);
      return parent[id];
    };
    const union = (a: string, b: string) => { parent[find(a)] = find(b); };

    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        const a = centers[i], b = centers[j];
        const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy);
        if (dist < PROXIMITY + (a.bw + b.bw) / 2) union(a.id, b.id);
      }
    }

    // Collect groups with 2+ members
    const groups: Record<string, typeof centers> = {};
    centers.forEach(c => {
      const root = find(c.id);
      if (!groups[root]) groups[root] = [];
      groups[root].push(c);
    });

    // Build bounding boxes with padding
    return Object.values(groups)
      .filter(g => g.length >= 2)
      .map(g => {
        const PAD = 28;
        const minX = Math.min(...g.map(c => c.x)) - PAD;
        const minY = Math.min(...g.map(c => c.y)) - PAD;
        const maxX = Math.max(...g.map(c => c.x + c.bw)) + PAD;
        const maxY = Math.max(...g.map(c => c.y + c.bh)) + PAD;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      });
  }, [allItems, positions]);

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
    // Cancel any running momentum (canvas or block) so a fresh drag starts clean
    cancelAnimationFrame(rafRef.current);
    velRef.current = { vx: 0, vy: 0 };
    // Record touch for object aging — this block is live now
    activityRef.current[blockId] = Date.now();
    try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activityRef.current)); } catch { /* quota */ }
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
    // Cancel any running momentum so the new drag starts fresh
    cancelAnimationFrame(rafRef.current);
    velRef.current = { vx: 0, vy: 0 };
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
        // Track instantaneous velocity for momentum
        const now = performance.now();
        if (drag.lastT != null && drag.lastX != null && drag.lastY != null) {
          const dt = now - drag.lastT;
          if (dt > 0 && dt < 40) { // ignore large gaps (e.g. tab switch)
            velRef.current.vx = (e.clientX - drag.lastX) / dt;
            velRef.current.vy = (e.clientY - drag.lastY) / dt;
          }
        }
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.lastT = now;
      } else if (drag.type === 'block-move' && drag.blockId != null) {
        const newX = snap((drag.startBlockX ?? 0) + dx / zoom);
        const newY = snap((drag.startBlockY ?? 0) + dy / zoom);
        onSetPos(drag.blockId, { x: newX, y: newY });
        // Track position + velocity for block inertia
        const now = performance.now();
        if (drag.lastT != null && drag.lastX != null && drag.lastY != null) {
          const dt = now - drag.lastT;
          if (dt > 0 && dt < 40) {
            velRef.current.vx = (e.clientX - drag.lastX) / dt;
            velRef.current.vy = (e.clientY - drag.lastY) / dt;
          }
        }
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.lastT = now;
        drag.currentBlockX = newX;
        drag.currentBlockY = newY;
      } else if (drag.type === 'block-resize' && drag.blockId != null) {
        const newW = Math.max(200, snap((drag.startBlockW ?? 340) + dx / zoom));
        const newH = Math.max(80,  snap((drag.startBlockH ?? 200) + dy / zoom));
        onSetPos(drag.blockId, { w: newW, h: newH });
      }
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);

      // Launch momentum only for canvas pan, not for block moves
      if (drag?.type === 'canvas') {
        const { vx, vy } = velRef.current;
        // Only bother if there's meaningful velocity (> 0.3 px/ms)
        if (Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) {
          let px = liveViewRef.current.panX;
          let py = liveViewRef.current.panY;
          // Scale velocity: px/ms → ~px/frame assuming 60fps
          let fx = vx * 14;
          let fy = vy * 14;
          const DECAY = 0.88;
          const STOP  = 0.35;

          cancelAnimationFrame(rafRef.current);
          const step = () => {
            fx *= DECAY;
            fy *= DECAY;
            if (Math.abs(fx) < STOP && Math.abs(fy) < STOP) return;
            px += fx;
            py += fy;
            setPan(px, py);
            rafRef.current = requestAnimationFrame(step);
          };
          rafRef.current = requestAnimationFrame(step);
        }
        velRef.current = { vx: 0, vy: 0 };
      } else if (drag?.type === 'block-move' && drag.blockId) {
        const { vx, vy } = velRef.current;
        // Block inertia: threshold lower than canvas — even small flicks feel responsive
        if (Math.abs(vx) > 0.12 || Math.abs(vy) > 0.12) {
          const blockId   = drag.blockId;
          let bx = drag.currentBlockX ?? (drag.startBlockX ?? 0);
          let by = drag.currentBlockY ?? (drag.startBlockY ?? 0);
          // Convert screen velocity (px/ms) to world velocity (px/frame)
          // Divide by zoom: fast pan at 50% zoom should move block same screen distance
          let fx = (vx * 10) / zoom;
          let fy = (vy * 10) / zoom;
          const DECAY = 0.72;   // blocks decelerate faster than canvas — heavier feel
          const STOP  = 0.15;

          cancelAnimationFrame(rafRef.current);
          const step = () => {
            fx *= DECAY;
            fy *= DECAY;
            if (Math.abs(fx) < STOP && Math.abs(fy) < STOP) return;
            bx = snap(bx + fx);
            by = snap(by + fy);
            onSetPos(blockId, { x: bx, y: by });
            rafRef.current = requestAnimationFrame(step);
          };
          rafRef.current = requestAnimationFrame(step);
        }
        velRef.current = { vx: 0, vy: 0 };
      }
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
      onMouseMove={e => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        setControlsNear(rect.height - (e.clientY - rect.top) < 96);
      }}
      onMouseLeave={() => setControlsNear(false)}
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
        {/* ── Proximity cluster backdrops ─────────────────────── */}
        {clusters.map((box, i) => (
          <div
            key={`cluster-${i}`}
            aria-hidden="true"
            style={{
              position:        'absolute',
              left:             box.x,
              top:              box.y,
              width:            box.w,
              height:           box.h,
              borderRadius:    '22px',
              backgroundColor: `${tokens.accent}05`,
              border:          `1px solid ${tokens.accent}0a`,
              pointerEvents:   'none',
              zIndex:          0,
              transition:      'all 0.6s cubic-bezier(0.32,0.72,0,1)',
            }}
          />
        ))}

        {/* ── Spatial inbox — capture block lives here first ─── */}
        {(() => {
          const captureItem = allItems.find(i => i.id === 'capture' || i.id.startsWith('capture-'));
          if (!captureItem) return null;
          const pos = positions[captureItem.id];
          if (!pos) return null;
          const PAD = 22;
          return (
            <div
              aria-hidden="true"
              style={{
                position:      'absolute',
                left:           pos.x - PAD,
                top:            pos.y - PAD,
                width:          (pos.w > 0 ? pos.w : 340) + PAD * 2,
                height:         240 + PAD * 2,
                borderRadius:  '24px',
                backgroundColor: `${tokens.accent}03`,
                border:         `1px dashed ${tokens.accent}10`,
                pointerEvents:  'none',
                zIndex:         0,
                transition:     'all 0.5s ease',
              }}
            />
          );
        })()}

        {/* ── Focus bubble — ambient glow during a live session ── */}
        {activeSession && !designMode && (() => {
          const focusItem = allItems.find(i => i.id === 'focus-mode' || i.id.startsWith('focus-mode'));
          if (!focusItem) return null;
          const pos = positions[focusItem.id];
          if (!pos) return null;
          const bw = pos.w > 0 ? pos.w : 340;
          const cx = pos.x + bw / 2;
          const cy = pos.y + 160;
          const R  = Math.max(bw, 320);
          return (
            <div
              aria-hidden="true"
              style={{
                position:      'absolute',
                left:           cx - R,
                top:            cy - R * 0.75,
                width:          R * 2,
                height:         R * 1.5,
                borderRadius:  '50%',
                background:    `radial-gradient(ellipse, ${tokens.accent}0d 0%, transparent 65%)`,
                filter:        'blur(24px)',
                pointerEvents: 'none',
                zIndex:        0,
                animation:     'canvasBreath 7s ease-in-out infinite',
              }}
            />
          );
        })()}

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

          // When another block is being dragged, non-dragging blocks fade back
          // — creates a "spotlight" effect and a sense of spatial depth
          const isOtherDragging = !!(draggingId && draggingId !== item.id);

          // Object aging — freshness fades blocks that haven't been touched in days
          const lastActive = activityRef.current[item.id];
          const freshness = lastActive ? computeFreshness(lastActive) : 1.0;

          // Focus session — non-focus items step back further on the canvas
          const FOCUS_IDS = new Set(['focus-mode', 'capture', 'deep-work-timer']);
          const baseId = item.id.replace(/-copy.*$/, '').replace(/-\d+$/, '');
          const isFocusItem = FOCUS_IDS.has(baseId);
          const sessionDim = activeSession && !designMode && !isFocusItem;

          // Return ritual — most recently touched block gets a brief 1.8s welcome-back glow
          const isReturning = returnId === item.id;

          const baseOpacity = isOtherDragging ? 0.45
            : sessionDim               ? Math.min(freshness, 0.5)
            : freshness;

          return (
            <div
              key={item.id}
              style={{
                opacity:    baseOpacity,
                transition: isOtherDragging ? 'opacity 0.15s ease' : 'opacity 0.8s ease',
                // Return ritual — a soft pulse that says "here's where you left off"
                ...(isReturning ? {
                  filter: `drop-shadow(0 0 20px ${tokens.accent}30)`,
                } : {}),
              }}
            >
              <FreeformBlock
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
            </div>
          );
        })}

        {/* ── Empty state — alive, breathing, spatial ──────────── */}
        {allItems.length === 0 && (
          <div style={{
            position:      'absolute',
            left:          '50%',
            top:           '42%',
            transform:     'translate(-50%, -50%)',
            textAlign:     'center',
            pointerEvents: 'none',
            userSelect:    'none',
          }}>
            {/* Ambient glow orb behind text */}
            <div style={{
              position:        'absolute',
              left:            '50%',
              top:             '50%',
              transform:       'translate(-50%, -50%)',
              width:           '180px',
              height:          '80px',
              borderRadius:    '50%',
              backgroundColor: tokens.accent,
              opacity:         0.04,
              filter:          'blur(32px)',
              animation:       'canvasBreath 5s ease-in-out infinite',
            }} />
            <p style={{
              fontFamily:    "'Plus Jakarta Sans', sans-serif",
              fontSize:      '20px',
              fontWeight:    700,
              color:         tokens.textSecondary,
              margin:        0,
              letterSpacing: '-0.02em',
              animation:     'fadeIn 0.8s ease both',
            }}>
              Your thinking space.
            </p>
            <p style={{
              fontSize:   '13px',
              color:      tokens.textGhost,
              margin:     '10px 0 0',
              lineHeight: 1.5,
              animation:  'fadeIn 0.8s 0.3s ease both',
            }}>
              Press{' '}
              <kbd style={{
                fontFamily:      'monospace',
                padding:         '1px 6px',
                borderRadius:    '5px',
                border:          `1px solid ${tokens.cardBorder}`,
                fontSize:        '12px',
                color:           tokens.textMuted,
                backgroundColor: tokens.wellBg,
              }}>⌘K</kbd>
              {' '}to add something.
            </p>
          </div>
        )}

      </div>

      {/* ── Atmospheric vignette — depth at the periphery ────────────── */}
      <div
        aria-hidden="true"
        style={{
          position:    'absolute',
          inset:       0,
          pointerEvents: 'none',
          zIndex:      1,
          background:  `radial-gradient(ellipse at 50% 40%, transparent 55%, ${tokens.pageBg}60 100%)`,
          transition:  'background 0.4s ease',
        }}
      />

      {/* ── Canvas controls ────────────────────────────────────── */}
      <CanvasControls
        tokens={tokens}
        zoom={zoom}
        snapToGrid={snapToGrid}
        visible={controlsNear || draggingId !== null}
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
                Your space
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
