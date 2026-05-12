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
const WARMTH_KEY    = 'fw_region_warmth_v1';

// ── Movement tuning constants (low-risk quality pass) ────────────────────────
const WHEEL_SENSITIVITY = 0.0012;      // per-pixel wheel scaling for exp zoom
const WHEEL_DEADZONE = 0.8;            // ignore tiny wheel noise (pixel-equivalent)
const MAX_WHEEL_DELTA = 60;            // clamp wheel bursts to avoid jump zoom
const WHEEL_PAN_DEADZONE = 0.5;        // ignore tiny pan wheel noise
const WHEEL_PAN_SPEED = 1.0;           // pan distance multiplier
const ZOOM_SMOOTHING = 9.0;            // higher = faster settle, dt-based per second

const PAN_VELOCITY_CLAMP = 2.8;        // px/ms
const PAN_FRICTION = 8.0;              // per-second exponential damping

const BLOCK_VELOCITY_CLAMP = 2.2;      // px/ms
const BLOCK_FRICTION = 12.0;           // per-second exponential damping

const DRAG_SMOOTHING = 0.28;           // fraction toward target per move event
/** Slightly softer than move — dimension changes read smoother on release. */
const RESIZE_SMOOTHING = 0.36;
const RESIZE_DEADBAND = 3;             // world px before resize commits

// ── Thought lifecycle ─────────────────────────────────────────────────────────
// Objects exist on a spectrum from freshly active to deeply dormant.
// This shapes their visual presence — not their accessibility.
//
// active   < 2h    full presence (1.0)
// warm     2–24h   settling (0.92 → 0.86)
// dormant  1–3d    fading back (0.84 → 0.72)
// fading   3–7d    receding further (0.72 → 0.62)
// deep     7d+     ambient memory (0.60)

type LifecycleState = 'active' | 'warm' | 'dormant' | 'fading' | 'deep';
interface LifecycleResult { state: LifecycleState; opacity: number; }

function computeLifecycle(lastActive: number | undefined): LifecycleResult {
  if (!lastActive) return { state: 'warm', opacity: 0.88 };
  const hrs = (Date.now() - lastActive) / 3_600_000;
  if (hrs < 2)   return { state: 'active',  opacity: 1.0  };
  if (hrs < 24)  return { state: 'warm',    opacity: 0.92 - (hrs / 24)        * 0.06 };
  if (hrs < 72)  return { state: 'dormant', opacity: 0.84 - ((hrs - 24)  / 48) * 0.12 };
  if (hrs < 168) return { state: 'fading',  opacity: 0.72 - ((hrs - 72)  / 96) * 0.10 };
  return { state: 'deep', opacity: 0.60 };
}

// ── Region warmth helpers ─────────────────────────────────────────────────────

interface WarmthPoint { x: number; y: number; age: number; } // age in fractional days
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { ModuleConfig } from '../../hooks/useWorkspaceLayout';
import type { CustomTool } from '../../hooks/useCustomTools';
import type { BlockPos, PositionMap } from '../../hooks/useBlockPositions';
import { FreeformBlock } from './FreeformBlock';
import { CustomToolBlock } from './CustomToolBlock';
import { FreeSpaceSpatialAmbient } from './FreeSpaceSpatialAmbient';
import { FreeSpaceConnectionsLayer } from './FreeSpaceConnectionsLayer';
import { coerceFreeSpaceConnectionIds } from '../../hooks/useSectionFreeSpaceObjects';
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
  currentBlockW?: number;
  currentBlockH?: number;
  // drag thresholds — prevent accidental movements from pure clicks
  panStarted?:  boolean;   // canvas pan: true once cursor has moved ≥ 4px
  moveStarted?: boolean;   // block move: true once cursor has moved ≥ 3px
  resizeStarted?: boolean; // block resize: true once cursor has moved ≥ deadband
}

interface Props {
  tokens:       AtmosphereTokens;
  modules:      ModuleConfig[];
  blocks:       Array<{ id: string; connections?: string[] }>;
  tools:        CustomTool[];
  positions:    PositionMap;
  canvasState:  {
    zoom: number;
    panX: number;
    panY: number;
    snapToGrid: boolean;
    gridSize: number;
    setViewport: (zoom: number, panX: number, panY: number) => void;
    setPan: (x: number, y: number) => void;
    resetView: () => void;
    centerView: (contentW: number, contentH: number, vpW: number, vpH: number) => void;
    toggleSnap: () => void;
  };
  designMode:   boolean;
  selectedId:   string | null;
  /** Id of a Free Space object whose inner editor is actively in edit mode (deep writing focus). */
  focusEditingId?: string | null;
  topOffset?:   number;
  /** True when a focus session is active — environment shifts */
  activeSession?: boolean;
  /** Section Free Space: subtle spatial ambient behind the world (does not affect interactions). */
  spatialAmbient?: boolean;
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
  /** Section Free Space: render connection lines + connect affordances */
  freeSpaceConnectionsEnabled?: boolean;
  /** Source object id while in lightweight “connect to…” mode */
  connectModeSourceId?: string | null;
  connectHoverTargetId?: string | null;
  onConnectHoverTargetChange?: (id: string | null) => void;
  onBeginConnectFromBlock?: (id: string) => void;
  onConnectPairComplete?: (fromId: string, toId: string) => void;
  onCancelConnectMode?: () => void;
}

// ── Canvas controls ───────────────────────────────────────────────────────────

function CanvasControls({
  tokens, zoom, snapToGrid, visible, chromeQuiet = false,
  onZoomIn, onZoomOut, onReset, onCenter, onToggleSnap, onAutoOrganize,
}: {
  tokens: AtmosphereTokens;
  zoom: number;
  snapToGrid: boolean;
  visible: boolean;
  /** Deep writing focus: bar stays usable but visually recedes until hovered. */
  chromeQuiet?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onCenter: () => void;
  onToggleSnap: () => void;
  onAutoOrganize: () => void;
}) {
  const [barHovered, setBarHovered] = useState(false);
  const quietOpacity = chromeQuiet && !barHovered ? 0.68 : 1;
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
      onMouseEnter={() => setBarHovered(true)}
      onMouseLeave={() => setBarHovered(false)}
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
        boxShadow:            chromeQuiet && !barHovered
          ? '0 6px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)'
          : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        opacity:              visible ? quietOpacity : 0,
        pointerEvents:        visible ? 'auto' : 'none',
        transition:           'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s ease',
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
  tokens,
  modules,
  blocks,
  tools,
  positions,
  canvasState,
  designMode,
  selectedId,
  activeSession = false,
  spatialAmbient = false,
  focusEditingId,
  topOffset = 48,
  onSetPos,
  onSelect,
  onRemoveModule,
  onRemoveBlock,
  onRemoveTool,
  onDuplicateBlock,
  onOpenAdd,
  renderModuleContent,
  getLabel,
  freeSpaceConnectionsEnabled = false,
  connectModeSourceId = null,
  connectHoverTargetId = null,
  onConnectHoverTargetChange,
  onBeginConnectFromBlock,
  onConnectPairComplete,
  onCancelConnectMode,
}: Props) {
  const viewportRef  = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<DragState | null>(null);
  const spaceHeldRef = useRef(false);
  const [draggingId,      setDraggingId]      = useState<string | null>(null);
  /** Distinct chrome for move vs resize without reading drag refs during pan. */
  const [activeDragKind, setActiveDragKind] = useState<'move' | 'resize' | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Controls bar is ambient — only surfaces near the bottom edge
  const [controlsNear,   setControlsNear]    = useState(false);
  const [addChromeHovered, setAddChromeHovered] = useState(false);

  // ── Momentum / inertia refs ───────────────────────────────────────────────
  const velRef     = useRef({ vx: 0, vy: 0 });  // velocity in px/ms
  const rafRef     = useRef(0);                   // pan momentum RAF handle
  const zoomRafRef = useRef(0);                   // zoom lerp RAF handle

  // Smooth zoom target — wheel events write here; a RAF loop lerps toward it
  // This gives the cinematic "camera settling" feel instead of instant snaps.
  const targetViewRef = useRef({ zoom: 0, panX: 0, panY: 0 });

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

  // ── Region warmth — inhabited areas accumulate presence over time ────────
  // Tracks up to 5 "warmth points" in world space. Each records where thinking
  // has been concentrated. They render as extremely faint radial glows on the
  // canvas surface — not UI, just environmental texture.
  const warmthRef = useRef<WarmthPoint[]>(
    (() => {
      try {
        const raw = localStorage.getItem(WARMTH_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw) as WarmthPoint[];
        // Prune points older than 30 days — they've fully dissolved
        return data.filter((p: WarmthPoint) => typeof p.age === 'number' && p.age < 30);
      } catch { return []; }
    })()
  );

  // Debounced warmth accumulation: every time positions change, blend current
  // block distribution into stored warmth memory.
  const warmthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const posArray = Object.values(positions);
    if (posArray.length === 0) return;
    if (warmthTimerRef.current) clearTimeout(warmthTimerRef.current);
    warmthTimerRef.current = setTimeout(() => {
      // Compute centroid of the current occupied area
      const cx = posArray.reduce((s, p) => s + p.x + (p.w > 0 ? p.w / 2 : 170), 0) / posArray.length;
      const cy = posArray.reduce((s, p) => s + p.y + 120, 0) / posArray.length;
      const MERGE_DIST = 260;
      const current    = warmthRef.current;
      const nearby     = current.find(p => Math.hypot(p.x - cx, p.y - cy) < MERGE_DIST);
      if (nearby) {
        // Reinforce existing warmth point — slow age by revisiting it
        nearby.age = Math.max(0, nearby.age - 0.4);
      } else if (current.length < 5) {
        current.push({ x: cx, y: cy, age: 0 });
      } else {
        // Recycle oldest point
        const oldest = current.reduce((a, b) => b.age > a.age ? b : a);
        oldest.x = cx; oldest.y = cy; oldest.age = 0;
      }
      // Gently age all warmth points each update cycle
      current.forEach(p => { p.age = Math.min(30, p.age + 0.015); });
      try { localStorage.setItem(WARMTH_KEY, JSON.stringify(current)); } catch { /* quota */ }
    }, 3000);
    return () => { if (warmthTimerRef.current) clearTimeout(warmthTimerRef.current); };
  }, [positions]);

  // ── Revisit state ─────────────────────────────────────────────────────────
  // When a dormant/fading thought is touched again, the space acknowledges it
  // with a brief warm glow — the environment notices the return.
  const [revisitId, setRevisitId] = useState<string | null>(null);

  // ── Cluster stability (session-local) ─────────────────────────────────────
  // Tracks when a cluster centroid was first observed this session.
  // After 5 minutes of stability, the cluster backdrop solidifies slightly —
  // communicating that this grouping has "settled" into the space.
  const clusterFirstSeen = useRef<Map<string, number>>(new Map());

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

  const safeZoom =
    typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0
      ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
      : 1;
  const safePanX =
    typeof panX === 'number' && Number.isFinite(panX)
      ? Math.min(10_000_000, Math.max(-10_000_000, panX))
      : 40;
  const safePanY =
    typeof panY === 'number' && Number.isFinite(panY)
      ? Math.min(10_000_000, Math.max(-10_000_000, panY))
      : 40;
  const safeGridSize =
    typeof gridSize === 'number' && Number.isFinite(gridSize) && gridSize > 0
      ? Math.min(400, Math.max(4, gridSize))
      : 24;

  const usedViewportFallback =
    !Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(panX) || !Number.isFinite(panY);

  // Live viewport — updated each render so RAF loops can read current values
  // without stale closures. Tracks zoom too for the zoom lerp loop.
  const liveViewRef = useRef({ panX, panY, zoom });
  liveViewRef.current = { panX, panY, zoom };

  // Initialize targetView to current viewport on first render
  if (!Number.isFinite(targetViewRef.current.zoom) || targetViewRef.current.zoom === 0) {
    targetViewRef.current = { zoom: safeZoom, panX: safePanX, panY: safePanY };
  }

  // ── All renderable items ───────────────────────────────────────────────────

  const enabledModules = modules.filter(m => m.enabled).sort((a, b) => a.order - b.order);

  // Deep-focus: notebook editor is active on Free Space (viewport + chrome breathe with it).
  const hasDeepFocus = !!focusEditingId;
  const deepFocusAtmosphere = hasDeepFocus && !designMode;

  const [hoveredConnectionEdgeKey, setHoveredConnectionEdgeKey] = useState<string | null>(null);

  const relatedToSelection = useMemo(() => {
    if (!freeSpaceConnectionsEnabled || !selectedId || connectModeSourceId) return null;
    const rel = new Set<string>([selectedId]);
    const sel = blocks.find(b => b.id === selectedId);
    coerceFreeSpaceConnectionIds(sel?.connections).forEach(c => rel.add(c));
    blocks.forEach(b => {
      if (coerceFreeSpaceConnectionIds(b.connections).includes(selectedId)) rel.add(b.id);
    });
    return rel;
  }, [freeSpaceConnectionsEnabled, blocks, selectedId, connectModeSourceId]);

  const lineHoverEndpointIds = useMemo(() => {
    if (!hoveredConnectionEdgeKey) return null;
    const i = hoveredConnectionEdgeKey.indexOf('|');
    if (i < 0) return null;
    const a = hoveredConnectionEdgeKey.slice(0, i);
    const b = hoveredConnectionEdgeKey.slice(i + 1);
    if (!a || !b) return null;
    return new Set<string>([a, b]);
  }, [hoveredConnectionEdgeKey]);

  const handleBlockSelect = useCallback(
    (blockId: string) => {
      if (connectModeSourceId && connectModeSourceId !== blockId) {
        onConnectPairComplete?.(connectModeSourceId, blockId);
        return;
      }
      onSelect(blockId);
    },
    [connectModeSourceId, onConnectPairComplete, onSelect],
  );

  useEffect(() => {
    if (!connectModeSourceId) setHoveredConnectionEdgeKey(null);
  }, [connectModeSourceId]);
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
    return Math.round(v / safeGridSize) * safeGridSize;
  }, [snapToGrid, safeGridSize]);

  // ── Mouse event handlers ──────────────────────────────────────────────────

  const onBlockMouseDown = useCallback((blockId: string, e: React.MouseEvent, type: 'move' | 'resize') => {
    if (spaceHeldRef.current || e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = 0;
      velRef.current = { vx: 0, vy: 0 };
      onSelect(null);
      onCancelConnectMode?.();
      dragRef.current = {
        type: 'canvas',
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPanX: panX,
        startPanY: panY,
        panStarted: true,
      };
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (connectModeSourceId && connectModeSourceId !== blockId && type === 'move' && onConnectPairComplete) {
      onConnectPairComplete(connectModeSourceId, blockId);
      return;
    }
    // Cancel any running momentum or zoom lerp so a fresh drag starts clean
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(zoomRafRef.current);
    zoomRafRef.current = 0;
    velRef.current = { vx: 0, vy: 0 };
    // Detect revisit: was this thought dormant/fading? If so, surface it.
    const prevLifecycle = computeLifecycle(activityRef.current[blockId]);
    if (prevLifecycle.state === 'dormant' || prevLifecycle.state === 'fading' || prevLifecycle.state === 'deep') {
      setRevisitId(blockId);
      setTimeout(() => setRevisitId(r => r === blockId ? null : r), 2500);
    }
    // Record touch — this thought is active again
    activityRef.current[blockId] = Date.now();
    try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activityRef.current)); } catch { /* quota */ }
    handleBlockSelect(blockId);
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
      moveStarted: false,
      resizeStarted: false,
    };
    setDraggingId(blockId);
    setActiveDragKind(type === 'resize' ? 'resize' : 'move');
  }, [
    positions,
    panX,
    panY,
    handleBlockSelect,
    connectModeSourceId,
    onConnectPairComplete,
  ]);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Left-click panning is only for empty canvas. Space+drag and middle-click
    // should pan from anywhere for easier navigation.
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as HTMLElement;
    const forcePan = spaceHeldRef.current || e.button === 1;
    if (!forcePan && target.closest('[data-freeform-block]')) return;
    if (e.button === 1) e.preventDefault();
    // Cancel any running momentum or zoom lerp so the new drag starts fresh
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(zoomRafRef.current);
    zoomRafRef.current = 0;
    velRef.current = { vx: 0, vy: 0 };
    onSelect(null);
    onCancelConnectMode?.();
    dragRef.current = {
      type:        'canvas',
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanX:   panX,
      startPanY:   panY,
      panStarted:  forcePan ? true : false,
    };
  }, [onSelect, onCancelConnectMode, panX, panY]);

  useEffect(() => {
    const isEditingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      return !!el.closest('input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable]');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isEditingTarget(e.target)) return;
      if (!spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (spaceHeldRef.current) {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    const onBlur = () => {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Attach global mousemove/mouseup on mount (avoids losing drag on fast moves)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;

      if (drag.type === 'canvas') {
        // ── Pan threshold: 4px before committing ──────────────────────
        // Prevents accidental micro-pans on pure clicks or taps.
        if (!drag.panStarted) {
          if (Math.hypot(dx, dy) < 4) return;
          drag.panStarted = true;
        }

        const targetPanX = (drag.startPanX ?? 0) + dx;
        const targetPanY = (drag.startPanY ?? 0) + dy;
        const curPanX = liveViewRef.current.panX;
        const curPanY = liveViewRef.current.panY;
        setPan(
          curPanX + (targetPanX - curPanX) * DRAG_SMOOTHING,
          curPanY + (targetPanY - curPanY) * DRAG_SMOOTHING,
        );

        // ── EMA velocity smoothing ────────────────────────────────────
        // Exponential moving average reduces jitter in instantaneous velocity
        // readings, giving momentum a smoother, more predictable character.
        const now = performance.now();
        if (drag.lastT != null && drag.lastX != null && drag.lastY != null) {
          const dt = now - drag.lastT;
          if (dt > 0 && dt < 50) {
            const rawVx = (e.clientX - drag.lastX) / dt;
            const rawVy = (e.clientY - drag.lastY) / dt;
            const α = 0.55; // 55% weight to new sample
            velRef.current.vx = velRef.current.vx * (1 - α) + rawVx * α;
            velRef.current.vy = velRef.current.vy * (1 - α) + rawVy * α;
          }
        }
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.lastT = now;

      } else if (drag.type === 'block-move' && drag.blockId != null) {
        // ── Move threshold: 3px before committing ────────────────────
        // Prevents accidental block shifts on selection clicks.
        if (!drag.moveStarted) {
          if (Math.hypot(dx, dy) < 3) return;
          drag.moveStarted = true;
        }

        const targetX = (drag.startBlockX ?? 0) + dx / zoom;
        const targetY = (drag.startBlockY ?? 0) + dy / zoom;
        const baseX = drag.currentBlockX ?? (drag.startBlockX ?? 0);
        const baseY = drag.currentBlockY ?? (drag.startBlockY ?? 0);
        const newX = baseX + (targetX - baseX) * DRAG_SMOOTHING;
        const newY = baseY + (targetY - baseY) * DRAG_SMOOTHING;
        onSetPos(drag.blockId, { x: newX, y: newY });

        const now = performance.now();
        if (drag.lastT != null && drag.lastX != null && drag.lastY != null) {
          const dt = now - drag.lastT;
          if (dt > 0 && dt < 50) {
            const rawVx = (e.clientX - drag.lastX) / dt;
            const rawVy = (e.clientY - drag.lastY) / dt;
            const α = 0.55;
            velRef.current.vx = velRef.current.vx * (1 - α) + rawVx * α;
            velRef.current.vy = velRef.current.vy * (1 - α) + rawVy * α;
          }
        }
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        drag.lastT = now;
        drag.currentBlockX = newX;
        drag.currentBlockY = newY;

      } else if (drag.type === 'block-resize' && drag.blockId != null) {
        const worldDx = dx / zoom;
        const worldDy = dy / zoom;
        if (!drag.resizeStarted) {
          if (Math.hypot(worldDx, worldDy) < RESIZE_DEADBAND) return;
          drag.resizeStarted = true;
        }
        const targetW = Math.max(200, (drag.startBlockW ?? 340) + worldDx);
        const targetH = Math.max(80,  (drag.startBlockH ?? 200) + worldDy);
        const baseW = drag.currentBlockW ?? (drag.startBlockW ?? 340);
        const baseH = drag.currentBlockH ?? (drag.startBlockH ?? 200);
        const newW = Math.max(200, baseW + (targetW - baseW) * RESIZE_SMOOTHING);
        const newH = Math.max(80,  baseH + (targetH - baseH) * RESIZE_SMOOTHING);
        onSetPos(drag.blockId, { w: newW, h: newH });
        drag.currentBlockW = newW;
        drag.currentBlockH = newH;
      }
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      setActiveDragKind(null);

      // Launch momentum only when the pan threshold was actually crossed
      if (drag?.type === 'canvas' && drag.panStarted) {
        const { vx, vy } = velRef.current;
        const cvx = Math.sign(vx) * Math.min(Math.abs(vx), PAN_VELOCITY_CLAMP);
        const cvy = Math.sign(vy) * Math.min(Math.abs(vy), PAN_VELOCITY_CLAMP);

        if (Math.abs(cvx) > 0.12 || Math.abs(cvy) > 0.12) {
          let px = liveViewRef.current.panX;
          let py = liveViewRef.current.panY;
          let mvx = cvx;
          let mvy = cvy;
          let lastTs = performance.now();

          cancelAnimationFrame(rafRef.current);
          cancelAnimationFrame(zoomRafRef.current);
          zoomRafRef.current = 0;
          const step = (ts: number) => {
            const dtMs = Math.min(40, Math.max(0.5, ts - lastTs));
            const dtSec = dtMs / 1000;
            lastTs = ts;
            const decay = Math.exp(-PAN_FRICTION * dtSec);
            mvx *= decay;
            mvy *= decay;
            if (Math.abs(mvx) < 0.01 && Math.abs(mvy) < 0.01) return;
            px += mvx * dtMs;
            py += mvy * dtMs;
            setPan(px, py);
            rafRef.current = requestAnimationFrame(step);
          };
          rafRef.current = requestAnimationFrame(step);
        }
        velRef.current = { vx: 0, vy: 0 };

      } else if (drag?.type === 'block-move' && drag.blockId && drag.moveStarted) {
        const { vx, vy } = velRef.current;
        const cvx = Math.sign(vx) * Math.min(Math.abs(vx), BLOCK_VELOCITY_CLAMP);
        const cvy = Math.sign(vy) * Math.min(Math.abs(vy), BLOCK_VELOCITY_CLAMP);

        if (Math.abs(cvx) > 0.1 || Math.abs(cvy) > 0.1) {
          const blockId = drag.blockId;
          let bx = drag.currentBlockX ?? (drag.startBlockX ?? 0);
          let by = drag.currentBlockY ?? (drag.startBlockY ?? 0);
          let mvx = cvx / zoom;
          let mvy = cvy / zoom;
          let lastTs = performance.now();

          cancelAnimationFrame(rafRef.current);
          const step = (ts: number) => {
            const dtMs = Math.min(40, Math.max(0.5, ts - lastTs));
            const dtSec = dtMs / 1000;
            lastTs = ts;
            const decay = Math.exp(-BLOCK_FRICTION * dtSec);
            mvx *= decay;
            mvy *= decay;
            if (Math.abs(mvx) < 0.01 && Math.abs(mvy) < 0.01) {
              if (snapToGrid) onSetPos(blockId, { x: snap(bx), y: snap(by) });
              return;
            }
            bx += mvx * dtMs;
            by += mvy * dtMs;
            onSetPos(blockId, { x: bx, y: by });
            rafRef.current = requestAnimationFrame(step);
          };
          rafRef.current = requestAnimationFrame(step);
        } else if (snapToGrid) {
          const bx = drag.currentBlockX ?? (drag.startBlockX ?? 0);
          const by = drag.currentBlockY ?? (drag.startBlockY ?? 0);
          onSetPos(drag.blockId, { x: snap(bx), y: snap(by) });
        }
        velRef.current = { vx: 0, vy: 0 };
      } else if (drag?.type === 'block-resize' && drag.blockId && drag.resizeStarted) {
        const bw = drag.currentBlockW ?? (drag.startBlockW ?? 340);
        const bh = drag.currentBlockH ?? (drag.startBlockH ?? 200);
        if (snapToGrid) onSetPos(drag.blockId, { w: snap(bw), h: snap(bh) });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [zoom, snap, setPan, onSetPos]);

  // ── Smooth zoom interpolation ─────────────────────────────────────────────
  // Wheel events write to targetViewRef; a separate RAF loop smoothly lerps
  // the actual viewport toward the target. This creates the cinematic zoom
  // deceleration of Figma/Linear rather than discrete snapping steps.

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const isZoomIntent = e.ctrlKey || e.metaKey;
      const active = document.activeElement;
      const editingFocus = active instanceof HTMLElement
        && !!active.closest('input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable]');
      if (!isZoomIntent && editingFocus) return;
      e.preventDefault();

      // Cancel pan momentum — zoom and momentum shouldn't fight
      cancelAnimationFrame(rafRef.current);

      const rect = el.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const deltaModeFactor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      const rawDeltaY = e.deltaY * deltaModeFactor;
      const rawDeltaX = e.deltaX * deltaModeFactor;

      if (!isZoomIntent) {
        if (Math.abs(rawDeltaY) < WHEEL_PAN_DEADZONE && Math.abs(rawDeltaX) < WHEEL_PAN_DEADZONE) return;
        const cur = liveViewRef.current;
        const nextPanX = cur.panX - rawDeltaX * WHEEL_PAN_SPEED;
        const nextPanY = cur.panY - rawDeltaY * WHEEL_PAN_SPEED;
        setPan(nextPanX, nextPanY);
        targetViewRef.current = { zoom: cur.zoom, panX: nextPanX, panY: nextPanY };
        return;
      }

      // Each zoom tick refines the TARGET (not the live view).
      // Accumulating toward the target means rapid pinch/wheel zoom
      // compounds into smooth continuous zoom.
      if (Math.abs(rawDeltaY) < WHEEL_DEADZONE) return;
      const wheelDelta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, rawDeltaY));
      const factor = Math.exp(-wheelDelta * WHEEL_SENSITIVITY);
      const prevZ  = targetViewRef.current.zoom;
      const newZ   = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZ * factor));

      // Adjust target pan to keep cursor point fixed in world space
      const prevPX = targetViewRef.current.panX;
      const prevPY = targetViewRef.current.panY;
      const newPX  = curX - (curX - prevPX) * (newZ / prevZ);
      const newPY  = curY - (curY - prevPY) * (newZ / prevZ);
      targetViewRef.current = { zoom: newZ, panX: newPX, panY: newPY };

      // Kick off lerp loop if not already running
      if (!zoomRafRef.current) {
        let lastTs = performance.now();
        const lerpStep = (ts: number) => {
          const dtMs = Math.min(40, Math.max(0.5, ts - lastTs));
          const dtSec = dtMs / 1000;
          lastTs = ts;
          const alpha = 1 - Math.exp(-ZOOM_SMOOTHING * dtSec);
          const tgt = targetViewRef.current;
          const cur = liveViewRef.current;
          const dz  = tgt.zoom - cur.zoom;
          const dpx = tgt.panX - cur.panX;
          const dpy = tgt.panY - cur.panY;

          // Stop when close enough — imperceptible difference
          if (Math.abs(dz) < 0.0008 && Math.abs(dpx) < 0.15 && Math.abs(dpy) < 0.15) {
            setViewport(tgt.zoom, tgt.panX, tgt.panY);
            zoomRafRef.current = 0;
            return;
          }

          setViewport(
            cur.zoom + dz  * alpha,
            cur.panX + dpx * alpha,
            cur.panY + dpy * alpha,
          );
          zoomRafRef.current = requestAnimationFrame(lerpStep);
        };
        zoomRafRef.current = requestAnimationFrame(lerpStep);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(zoomRafRef.current);
      zoomRafRef.current = 0;
    };
    // Stable dependencies only — the lerp loop reads liveViewRef/targetViewRef
    // via refs to avoid stale closures, so zoom/panX/panY are NOT needed here
  }, [setViewport]);

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

  const dotSpacing = safeGridSize * safeZoom;
  const dotOffX    = ((safePanX % dotSpacing) + dotSpacing) % dotSpacing;
  const dotOffY    = ((safePanY % dotSpacing) + dotSpacing) % dotSpacing;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={viewportRef}
      style={{
        position:   'fixed',
        top:        `${topOffset}px`,
        left:       0,
        right:      0,
        bottom:     0,
        overflow:   'hidden',
        cursor:     connectModeSourceId
          ? 'crosshair'
          : draggingId || dragRef.current?.type === 'canvas'
            ? 'grabbing'
            : (spaceHeld ? 'grab' : 'grab'),
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
              r={safeZoom > 0.5 ? 0.8 : 0.4}
              fill={deepFocusAtmosphere ? `${tokens.accent}07` : `${tokens.accent}0c`}
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
          transform:      `translate(${safePanX}px, ${safePanY}px) scale(${safeZoom})`,
          willChange:     'transform',
        }}
      >
        {spatialAmbient && tokens ? <FreeSpaceSpatialAmbient tokens={tokens} /> : null}

        {freeSpaceConnectionsEnabled && (
          <FreeSpaceConnectionsLayer
            tokens={tokens}
            blocks={blocks}
            positions={positions}
            animateFocusId={selectedId}
            hoveredEdgeKey={hoveredConnectionEdgeKey}
            onHoveredEdgeChange={setHoveredConnectionEdgeKey}
          />
        )}

        {/* ── Region warmth — the canvas surface develops memory ─── */}
        {warmthRef.current.filter(p => p.age < 30).map((point, i) => {
          const intensity = Math.max(0, (1 - point.age / 30)) * 0.042;
          const hex = Math.round(intensity * 255).toString(16).padStart(2, '0');
          return (
            <div
              key={`warmth-${i}`}
              aria-hidden="true"
              style={{
                position:      'absolute',
                left:           point.x - 300,
                top:            point.y - 240,
                width:          '600px',
                height:         '480px',
                borderRadius:   '50%',
                background:     `radial-gradient(ellipse, ${tokens.accent}${hex} 0%, transparent 60%)`,
                filter:         'blur(48px)',
                pointerEvents:  'none',
                zIndex:         0,
              }}
            />
          );
        })}

        {/* ── Deep focus: imperceptible anchor light (follows the active block in world space) ── */}
        {deepFocusAtmosphere && focusEditingId && positions[focusEditingId] && (() => {
          const p = positions[focusEditingId]!;
          const bw = p.w > 0 ? p.w : 340;
          const bh = p.h > 0 ? p.h : 220;
          const cx = p.x + bw / 2;
          const cy = p.y + bh / 2;
          const rw = Math.max(bw * 2.15, 520);
          const rh = Math.max(bh * 1.75, 360);
          return (
            <div
              key="fw-deep-focus-wash"
              aria-hidden
              style={{
                position:       'absolute',
                left:           cx,
                top:            cy,
                width:          rw,
                height:         rh,
                transform:      'translate(-50%, -50%)',
                borderRadius:   '50%',
                background:     `radial-gradient(ellipse 52% 50% at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 34%, transparent 72%)`,
                filter:         'blur(52px)',
                opacity:        0.9,
                pointerEvents:  'none',
                zIndex:         0,
                transition:     'opacity 0.55s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          );
        })()}

        {/* ── Deep focus: micro topology (nearly invisible; reinforces depth) ── */}
        {deepFocusAtmosphere && (
          <div
            aria-hidden
            style={{
              position:       'absolute',
              inset:          0,
              pointerEvents:  'none',
              zIndex:         0,
              opacity:        0.22,
              backgroundImage: `
                repeating-linear-gradient(90deg, transparent 0px, transparent 199px, rgba(255,255,255,0.011) 199px, rgba(255,255,255,0.011) 200px),
                repeating-linear-gradient(0deg, transparent 0px, transparent 319px, rgba(255,255,255,0.008) 319px, rgba(255,255,255,0.008) 320px)
              `,
              mixBlendMode:   'overlay',
              transition:     'opacity 0.6s ease',
            }}
          />
        )}

        {/* ── Proximity cluster backdrops ─────────────────────── */}
        {clusters.map((box, i) => {
          // Stability key: centroid rounded to 120px grid
          const ck = `${Math.round((box.x + box.w / 2) / 120)}_${Math.round((box.y + box.h / 2) / 120)}`;
          if (!clusterFirstSeen.current.has(ck)) clusterFirstSeen.current.set(ck, Date.now());
          const seenMs   = Date.now() - (clusterFirstSeen.current.get(ck) ?? Date.now());
          // After 5 quiet minutes this grouping has "settled" — border solidifies
          const isStable = seenMs > 5 * 60 * 1000;
          return (
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
                backgroundColor: `${tokens.accent}${isStable ? '07' : '05'}`,
                border:          `1px ${isStable ? 'solid' : 'dashed'} ${tokens.accent}${isStable ? '10' : '08'}`,
                pointerEvents:   'none',
                zIndex:          0,
                transition:      'all 0.6s cubic-bezier(0.32,0.72,0,1), border-style 1s ease, border-color 1s ease',
              }}
            />
          );
        })}

        {/* ── Spatial inbox — the arrival point for new thoughts ─ */}
        {(() => {
          const captureItem = allItems.find(i => i.id === 'capture' || i.id.startsWith('capture-'));
          if (!captureItem) return null;
          const pos = positions[captureItem.id];
          if (!pos) return null;
          // When the capture area has been dormant, its zone warms to amber —
          // a quiet signal that thoughts are waiting there, not a notification.
          const captureLife = computeLifecycle(activityRef.current[captureItem.id]);
          const hasWaiting  = captureLife.state === 'dormant' || captureLife.state === 'fading';
          const PAD = 22;
          return (
            <div
              aria-hidden="true"
              style={{
                position:        'absolute',
                left:             pos.x - PAD,
                top:              pos.y - PAD,
                width:            (pos.w > 0 ? pos.w : 340) + PAD * 2,
                height:           240 + PAD * 2,
                borderRadius:    '24px',
                backgroundColor:  hasWaiting ? 'rgba(245,158,11,0.025)' : `${tokens.accent}03`,
                border:           `1px dashed ${hasWaiting ? 'rgba(245,158,11,0.12)' : `${tokens.accent}10`}`,
                pointerEvents:    'none',
                zIndex:           0,
                transition:       'background-color 2s ease, border-color 2s ease',
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
          const blockW = pos.w > 0 ? pos.w : 340;
          const blockH = pos.h > 0 ? pos.h : 220;
          const focusSurfaceActive = !hasDeepFocus || focusEditingId === item.id;

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

          // Thought lifecycle — each object exists on a spectrum from active to deep archive
          const lifecycle   = computeLifecycle(activityRef.current[item.id]);

          // Live session: legacy strong dim for non-focus system cards only (not deep-writing focus).
          const FOCUS_IDS   = new Set(['focus-mode', 'capture', 'deep-work-timer']);
          const baseId      = item.id.replace(/-copy.*$/, '').replace(/-\d+$/, '');
          const isFocusItem = FOCUS_IDS.has(baseId);
          const sessionDim  = activeSession && !designMode && !isFocusItem;

          // Deep writing focus: other objects recede only via mild tonal shift (no opacity crush).
          const deepInactive =
            hasDeepFocus && !designMode && focusEditingId !== item.id && !isFocusItem;

          // Return ritual — most recently touched block gets a brief welcome-back glow
          const isReturning  = returnId   === item.id;
          // Revisit — a dormant thought just woken up gets a warm amber signal
          const isRevisiting = revisitId  === item.id;

          const baseOpacity = isOtherDragging ? 0.42
            : sessionDim    ? Math.min(lifecycle.opacity, 0.38)
            : lifecycle.opacity;

          // Asymmetric opacity transition:
          // — Coming alive (active) snaps quickly so freshly-touched thoughts
          //   feel immediately responsive.
          // — Settling back (warm/dormant/fading/deep) is slow and graceful.
          const opacityTransition = isOtherDragging      ? 'opacity 0.18s cubic-bezier(0.4,0,0.2,1)'
            : lifecycle.state === 'active'               ? 'opacity 0.4s cubic-bezier(0.4,0,0.2,1)'
            : (isRevisiting || isReturning)              ? 'opacity 1.4s cubic-bezier(0.4,0,0.2,1), filter 2s cubic-bezier(0.4,0,0.2,1)'
            : 'opacity 1.8s cubic-bezier(0.4,0,0.2,1)';

          // Session focus: strong isolation for focus-session cards.
          // Deep focus: whisper-quiet recession for peers (readable, stable).
          const sessionFilter = sessionDim
            ? 'saturate(0.35) brightness(0.7)'
            : deepInactive
              ? 'saturate(0.9) brightness(0.96)'
              : 'none';

          const filterTransition = (sessionDim || deepInactive || isRevisiting || isReturning)
            ? ', filter 1.4s cubic-bezier(0.4,0,0.2,1)'
            : '';

          let connectionChrome: 'neutral' | 'dim' | 'emphasis' | 'connect-target' = 'neutral';
          if (item.kind === 'block' && freeSpaceConnectionsEnabled) {
            if (connectModeSourceId) {
              if (item.id !== connectModeSourceId && connectHoverTargetId === item.id) {
                connectionChrome = 'connect-target';
              }
            } else if (lineHoverEndpointIds?.has(item.id)) {
              connectionChrome = 'emphasis';
            } else if (relatedToSelection && selectedId && relatedToSelection.size > 1) {
              if (relatedToSelection.has(item.id)) {
                connectionChrome = item.id === selectedId ? 'neutral' : 'emphasis';
              } else {
                connectionChrome = 'dim';
              }
            }
          }

          return (
            <div key={item.id}>
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: pos.x - 10,
                  top: pos.y - 10,
                  width: blockW + 20,
                  height: blockH + 20,
                  borderRadius: '24px',
                  pointerEvents: 'none',
                  zIndex: 1,
                  opacity: hasDeepFocus ? 1 : 0,
                  background: focusSurfaceActive
                    ? `radial-gradient(120% 95% at 50% 36%, ${tokens.accent}10 0%, transparent 68%)`
                    : deepInactive
                      ? 'radial-gradient(120% 95% at 50% 36%, rgba(5,10,18,0.2) 0%, transparent 74%)'
                      : 'radial-gradient(120% 95% at 50% 36%, rgba(3,8,16,0.34) 0%, transparent 70%)',
                  border: focusSurfaceActive
                    ? `1px solid ${tokens.accent}14`
                    : deepInactive
                      ? '1px solid rgba(12,18,28,0.35)'
                      : '1px solid rgba(9,14,24,0.5)',
                  boxShadow: focusSurfaceActive
                    ? `0 22px 52px rgba(0,0,0,0.38), 0 0 28px ${tokens.accentGlow}18, inset 0 1px 0 rgba(255,255,255,0.055)`
                    : deepInactive
                      ? '0 12px 32px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.02)'
                      : '0 16px 42px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.02)',
                  transition: 'opacity 0.5s cubic-bezier(0.4,0,0.2,1), background 0.6s cubic-bezier(0.4,0,0.2,1), border-color 0.5s cubic-bezier(0.4,0,0.2,1), box-shadow 0.55s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
              <div
                style={{
                  opacity:    baseOpacity,
                  transition: opacityTransition + filterTransition,
                  // Revisit — a dormant thought returning to life: warm amber flash
                  // Return ritual — most recent block on open: soft accent pulse
                  filter: isRevisiting
                    ? `drop-shadow(0 0 18px rgba(245,158,11,0.4))`
                    : isReturning
                      ? `drop-shadow(0 0 22px ${tokens.accent}30)`
                      : sessionDim
                        ? sessionFilter
                        : 'none',
                }}
                onClickCapture={() => {
                  // Pure clicks (no drag) must also record activity + trigger revisit.
                  // onBlockMouseDown handles drags; this covers taps and single-clicks
                  // that never fire a mousemove threshold.
                  const prev = computeLifecycle(activityRef.current[item.id]);
                  if (prev.state === 'dormant' || prev.state === 'fading' || prev.state === 'deep') {
                    setRevisitId(item.id);
                    setTimeout(() => setRevisitId(r => r === item.id ? null : r), 2500);
                  }
                  activityRef.current[item.id] = Date.now();
                  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activityRef.current)); } catch { /* quota */ }
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
                  activeGesture={draggingId === item.id ? activeDragKind : null}
                  deepFocusAnchor={deepFocusAtmosphere && focusEditingId === item.id}
                  onBlockMouseDown={onBlockMouseDown}
                  onSelect={handleBlockSelect}
                  onRemove={handleRemove}
                  onDuplicate={handleDuplicate}
                  {...(item.kind === 'block' && freeSpaceConnectionsEnabled
                    ? {
                        onBeginConnect: onBeginConnectFromBlock,
                        connectionChrome,
                        connectModeSourceId,
                        onConnectHoverTarget: onConnectHoverTargetChange,
                      }
                    : {})}
                >
                  {content}
                </FreeformBlock>
              </div>
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

      {/* ── Atmospheric depth system ───────────────────────────────────── */}
      {/* Layer 1: radial vignette — the world fades into darkness at the edges */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:         0,
          pointerEvents: 'none',
          zIndex:        1,
          background: deepFocusAtmosphere
            ? `radial-gradient(ellipse at 50% 44%, transparent 46%, ${tokens.pageBg}7a 100%)`
            : activeSession && !designMode
              ? `radial-gradient(ellipse at 50% 42%, transparent 28%, ${tokens.pageBg}cc 100%)`
              : `radial-gradient(ellipse at 50% 42%, transparent 38%, ${tokens.pageBg}90 100%)`,
          transition:  'background 1.8s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
      {/* Layer 2: edge continuation — linear gradients on all four sides */}
      {/* These make the viewport feel like a window into a larger world */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:         0,
          pointerEvents: 'none',
          zIndex:        1,
          opacity:       deepFocusAtmosphere ? 0.55 : 1,
          transition:    'opacity 0.6s ease',
          background: `
            linear-gradient(180deg, ${tokens.pageBg}28 0%, transparent 5%, transparent 93%, ${tokens.pageBg}28 100%),
            linear-gradient(90deg,  ${tokens.pageBg}20 0%, transparent 4%, transparent 96%, ${tokens.pageBg}20 100%)
          `,
        }}
      />
      {/* Layer 3: inset shadow ring — gives depth-of-window feeling */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:         0,
          pointerEvents: 'none',
          zIndex:        1,
          boxShadow:     deepFocusAtmosphere
            ? `inset 0 0 96px rgba(7,11,20,0.32)`
            : `inset 0 0 80px rgba(7,11,20,0.5)`,
          transition:    'box-shadow 0.8s cubic-bezier(0.4,0,0.2,1)',
        }}
      />

      {/* ── Canvas controls ────────────────────────────────────── */}
      <CanvasControls
        tokens={tokens}
        zoom={zoom}
        snapToGrid={snapToGrid}
        visible={controlsNear || draggingId !== null}
        chromeQuiet={deepFocusAtmosphere}
        onZoomIn={() => setViewport(Math.min(ZOOM_MAX, zoom + ZOOM_STEP), panX, panY)}
        onZoomOut={() => setViewport(Math.max(ZOOM_MIN, zoom - ZOOM_STEP), panX, panY)}
        onReset={resetView}
        onCenter={handleCenterView}
        onToggleSnap={toggleSnap}
        onAutoOrganize={handleAutoOrganize}
      />

      {usedViewportFallback && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            maxWidth: 'min(92vw, 440px)',
            padding: '8px 12px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 600,
            color: tokens.textSecondary,
            backgroundColor: `${tokens.cardBg}f0`,
            border: `1px solid ${tokens.cardBorder}`,
            boxShadow: tokens.shadowMd,
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          Viewport values were invalid and have been clamped for display. Use Reset zoom or reload if pan still looks wrong.
        </div>
      )}

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
          boxShadow:       deepFocusAtmosphere && !addChromeHovered
            ? `0 3px 14px ${tokens.accentGlow}88, 0 0 0 1px ${tokens.accent}30`
            : `0 4px 20px ${tokens.accentGlow}, 0 0 0 1px ${tokens.accent}40`,
          opacity:         deepFocusAtmosphere && !addChromeHovered ? 0.52 : 1,
          transform:       'scale(1)',
          transition:      'opacity 0.35s ease, box-shadow 0.35s ease, transform 0.3s cubic-bezier(0.34,1.2,0.64,1), background-color 0.25s ease',
          fontWeight:      300,
          lineHeight:      1,
        }}
        onMouseEnter={(e) => {
          setAddChromeHovered(true);
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentHover;
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.06)';
        }}
        onMouseLeave={(e) => {
          setAddChromeHovered(false);
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accent;
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
      >
        +
      </button>
    </div>
  );
}
