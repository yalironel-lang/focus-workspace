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
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Wand2 } from 'lucide-react';
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
  if (!lastActive) return { state: 'warm', opacity: 0.92 };
  const hrs = (Date.now() - lastActive) / 3_600_000;
  if (hrs < 2)   return { state: 'active',  opacity: 1.0  };
  if (hrs < 24)  return { state: 'warm',    opacity: 0.96 - (hrs / 24)         * 0.04 };
  if (hrs < 72)  return { state: 'dormant', opacity: 0.90 - ((hrs - 24) / 48)  * 0.06 };
  if (hrs < 168) return { state: 'fading',  opacity: 0.88 - ((hrs - 72) / 96)  * 0.05 };
  return { state: 'deep', opacity: 0.82 };
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
import { FreeSpaceMiniMap } from './FreeSpaceMiniMap';
import { WorkspaceSurfaceErrorBoundary } from '../common/WorkspaceSurfaceErrorBoundary';
import { coerceFreeSpaceConnectionIds } from '../../hooks/useSectionFreeSpaceObjects';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../../hooks/useCanvasMode';
import type { FocusMode } from '../../focusMode/focusModeTypes';
import { focusCanvasAtmosphere } from '../../focusMode/canvasAtmosphere';
import type { FocusStrength, WorkspaceClarity } from '../../lib/workspaceClarity';
import { scaleVignetteEdgeAlpha } from '../../lib/workspaceClarity';
import type { CosmicBackdropConfig } from '../../lib/cosmic/cosmicBackgroundTypes';
import { LivingEnvironmentBackdrop } from './environments/LivingEnvironmentBackdrop';
import {
  NEUTRAL_ENVIRONMENT_REACTIONS,
  getLivingWorld,
  type LivingEnvironmentSnapshot,
} from '../../lib/livingEnvironment';
import { getFocusTier, tierToPresentation, type FreeSpaceBlockLite } from '../../focusMode/objectRelevance';
import { buildSemanticClusterRegions, buildSemanticClusters } from '../../lib/freeSpaceSemanticClusters';
import { resolveFreeSpaceMaterialTier } from '../../lib/freeSpaceMaterials';
import { WorkspaceMicroScene } from '../workspace-guidance/WorkspaceMicroScene';
import { flickerDebugCount } from '../../lib/flickerDebug';
import { setPerformancePressure } from '../../lib/performanceSafeMode';
import {
  buildBlockRenderPolicies,
  buildCanvasScaleContext,
  type BlockPolicyInput,
} from '../../lib/freeSpaceScalePolicy';
import { FreeSpaceRenderPolicyProvider } from './FreeSpaceRenderPolicyContext';

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
  blocks:       FreeSpaceBlockLite[];
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
  /** Fill the positioned parent shell instead of viewport-fixed chrome offset. */
  fillParent?: boolean;
  /** Layered canvas background from theme (grid, ambient, base tone). */
  canvasBackgroundStyle?: React.CSSProperties;
  cosmicBackdrop?: CosmicBackdropConfig;
  /** Living environment snapshot (world + reactions); preferred over raw cosmic when set. */
  livingEnvironment?: LivingEnvironmentSnapshot | null;
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
  /** Premium spatial minimap (Section Free Space only by default). */
  spatialMinimapEnabled?: boolean;
  /** Section Free Space: drop a PDF onto empty canvas → new PDF window at world coordinates. */
  onPdfDroppedOnCanvas?: (file: File, worldX: number, worldY: number) => void;
  /** Cognitive Focus Mode — presentation only; does not move objects or change persistence layout. */
  focusMode?: FocusMode | null;
  /** Workspace continuity: recently used objects keep a faint presence. */
  continuityObjectIds?: string[];
  /** Workspace continuity: last active cluster glows slightly warmer. */
  continuityClusterIds?: string[];
  /** Workspace continuity: recently viewed paths stay a little brighter. */
  continuityEdgeKeys?: string[];
  /** False when Free Space is hidden (other view mounted) — pauses heavy ambient layers. */
  surfaceActive?: boolean;
  /** Global calm rendering (navigation, drag, low memory, hidden tab). */
  calmEffects?: boolean;
  /** Appearance clarity multipliers (fog, ambient, focus dim). */
  workspaceClarity?: WorkspaceClarity;
  focusStrength?: FocusStrength;
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
  const [barFocused, setBarFocused] = useState(false);
  const quietOpacity = chromeQuiet && !barHovered && !barFocused ? 0.68 : 1;
  const btn: React.CSSProperties = {
    width:           '38px',
    height:          '38px',
    borderRadius:    '10px',
    border:          '1px solid transparent',
    backgroundColor: 'transparent',
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    color:           tokens.textMuted,
    transition:      'all 0.12s ease',
    flexShrink:      0,
  };

  const divider = (
    <div style={{ width: '1px', height: '18px', backgroundColor: tokens.divider, margin: '0 2px' }} />
  );

  return (
    <div
      onMouseEnter={() => setBarHovered(true)}
      onMouseLeave={() => setBarHovered(false)}
      onFocusCapture={() => setBarFocused(true)}
      onBlurCapture={() => setBarFocused(false)}
      style={{
        position:             'absolute',
        bottom:               '20px',
        left:                 '50%',
        transform:            `translateX(-50%) translateY(${visible ? '0' : '6px'})`,
        zIndex:               30,
        display:              'flex',
        alignItems:           'center',
        gap:                  '2px',
        padding:              '6px',
        borderRadius:         '16px',
        backgroundColor:      `${tokens.cardBg}ee`,
        border:               `1px solid ${tokens.cardBorder}`,
        backdropFilter:       'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        boxShadow:            chromeQuiet && !barHovered
          ? '0 6px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.03)'
          : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        opacity:              visible ? quietOpacity : 0,
        visibility:           visible ? 'visible' : 'hidden',
        pointerEvents:        visible ? 'auto' : 'none',
        transition:           'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s ease',
      }}
    >
      <button aria-label="Zoom out" style={btn} title="Pull back for more context." onClick={onZoomOut}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}>
        <ZoomOut style={{ width: '15px', height: '15px' }} />
      </button>

      {/* Zoom label */}
      <button
        onClick={onReset}
        title="Return to a balanced view."
        style={{
          ...btn,
          width:      'auto',
          minWidth:   '56px',
          padding:    '0 10px',
          fontFamily: "'Space Grotesk', monospace",
          fontSize:   '11px',
          fontWeight: 700,
          color:      tokens.textMuted,
          letterSpacing: '0.04em',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
      >
        {Math.round(zoom * 100)}%
      </button>

      <button aria-label="Zoom in" style={btn} title="Lean into detail." onClick={onZoomIn}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}>
        <ZoomIn style={{ width: '15px', height: '15px' }} />
      </button>

      {divider}

      <button aria-label="Center workspace" style={btn} title="Bring the current workspace back into view." onClick={onCenter}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}>
        <Maximize2 style={{ width: '14px', height: '14px' }} />
      </button>

      {divider}

      <button
        aria-label={snapToGrid ? 'Disable snap to grid' : 'Enable snap to grid'}
        style={{
          ...btn,
          backgroundColor: snapToGrid ? `${tokens.accent}18` : 'transparent',
          color:           snapToGrid ? tokens.accent : tokens.textMuted,
          border:          snapToGrid ? `1px solid ${tokens.accent}30` : '1px solid transparent',
        }}
        title={snapToGrid ? 'Keep movement aligned for a cleaner rhythm.' : 'Free movement keeps the layout looser.'}
        onClick={onToggleSnap}
        onMouseEnter={e => { if (!snapToGrid) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.cardBorder; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; } }}
        onMouseLeave={e => { if (!snapToGrid) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; } }}
      >
        <Grid3x3 style={{ width: '15px', height: '15px' }} />
      </button>

      {divider}

      <button
        aria-label="Auto arrange workspace"
        style={btn}
        title="Organize the workspace by thinking flow."
        onClick={onAutoOrganize}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.accentSubtle; (e.currentTarget as HTMLButtonElement).style.color = tokens.accent; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = tokens.textMuted; }}
      >
        <Wand2 style={{ width: '15px', height: '15px' }} />
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
  fillParent = false,
  canvasBackgroundStyle,
  cosmicBackdrop,
  livingEnvironment = null,
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
  spatialMinimapEnabled = false,
  onPdfDroppedOnCanvas,
  focusMode = null,
  continuityObjectIds = [],
  continuityClusterIds = [],
  continuityEdgeKeys = [],
  surfaceActive = true,
  calmEffects = false,
  workspaceClarity,
  focusStrength = 'soft',
}: Props) {
  useEffect(() => {
    flickerDebugCount('FreeformCanvas');
  }, []);

  const reduceEffects = calmEffects || !surfaceActive;
  const viewportRef  = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<DragState | null>(null);
  const spaceHeldRef = useRef(false);
  const [draggingId,      setDraggingId]      = useState<string | null>(null);

  useEffect(() => {
    setPerformancePressure('canvas-drag', draggingId !== null);
    return () => setPerformancePressure('canvas-drag', false);
  }, [draggingId]);
  /** Distinct chrome for move vs resize without reading drag refs during pan. */
  const [activeDragKind, setActiveDragKind] = useState<'move' | 'resize' | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Controls bar is ambient — only surfaces near the bottom edge
  const [controlsNear,   setControlsNear]    = useState(false);
  const [addChromeHovered, setAddChromeHovered] = useState(false);
  const [viewportSize, setViewportSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
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

  const fogMul = workspaceClarity?.fogMul ?? 0.55;
  const focusAtm = useMemo(
    () => focusCanvasAtmosphere(focusMode, focusStrength, fogMul),
    [focusMode, focusStrength, fogMul],
  );
  const focusDimScale = workspaceClarity?.focusDimScale ?? 0.42;
  const envReactions = livingEnvironment?.reactions;
  const effectiveCosmic = livingEnvironment?.cosmic ?? cosmicBackdrop;

  const allItemsPreview: { kind: 'module' | 'block' | 'tool'; id: string }[] = useMemo(
    () => [
      ...enabledModules.map(m => ({ kind: 'module' as const, id: m.id })),
      ...blocks.map(b => ({ kind: 'block' as const, id: b.id })),
      ...tools.map(t => ({ kind: 'tool' as const, id: t.id })),
    ],
    [enabledModules, blocks, tools],
  );

  const canvasScaleContext = useMemo(
    () =>
      buildCanvasScaleContext({
        zoom: safeZoom,
        panX: safePanX,
        panY: safePanY,
        viewportW: viewportSize.w,
        viewportH: viewportSize.h,
        objectCount: allItemsPreview.length,
      }),
    [safeZoom, safePanX, safePanY, viewportSize.w, viewportSize.h, allItemsPreview.length],
  );

  const ambientScale =
    (reduceEffects
      ? 0.22
      : focusMode && spatialAmbient
        ? focusAtm.spatialAmbientOpacity
        : workspaceClarity?.ambientMul ?? 1) *
    (envReactions?.spatialAmbientScale ?? 1) *
    canvasScaleContext.ambientScaleMul;
  const continuityObjectSet = useMemo(() => new Set(continuityObjectIds), [continuityObjectIds]);
  const continuityClusterSet = useMemo(() => new Set(continuityClusterIds), [continuityClusterIds]);
  const focusTierById = useMemo(() => {
    if (!focusMode || !spatialAmbient) return null;
    const bl = blocks as FreeSpaceBlockLite[];
    const m = new Map<string, ReturnType<typeof getFocusTier>>();
    for (const b of bl) {
      m.set(b.id, getFocusTier(focusMode, b, bl, selectedId));
    }
    return m;
  }, [focusMode, blocks, selectedId, spatialAmbient]);

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

  const semanticClusterRegions = useMemo(() => {
    if (!spatialAmbient || !freeSpaceConnectionsEnabled || blocks.length < 2) return [];
    const clusters = buildSemanticClusters(blocks);
    return buildSemanticClusterRegions(clusters, positions);
  }, [blocks, positions, spatialAmbient, freeSpaceConnectionsEnabled]);

  const blocksById = useMemo(() => new Map(blocks.map(b => [b.id, b])), [blocks]);

  const activeClusterKey = useMemo(() => {
    const focalId = focusEditingId ?? selectedId;
    if (!focalId) return null;
    const region = semanticClusterRegions.find(r => r.memberIds.includes(focalId));
    return region?.key ?? null;
  }, [focusEditingId, selectedId, semanticClusterRegions]);

  const blockRenderPolicies = useMemo(() => {
    const inputs: BlockPolicyInput[] = allItems.map(item => {
      const pos = positions[item.id] ?? { x: 40, y: 40, w: 340, h: 0 };
      const inActiveCluster =
        !activeClusterKey ||
        semanticClusterRegions.some(
          r => r.key === activeClusterKey && r.memberIds.includes(item.id),
        );
      return {
        id: item.id,
        kind: item.kind,
        blockType: item.kind === 'block' ? blocksById.get(item.id)?.type : undefined,
        pos,
        selected: selectedId === item.id,
        editing: focusEditingId === item.id,
        inActiveCluster,
        relatedToSelection: relatedToSelection?.has(item.id) ?? false,
        dragging: draggingId === item.id,
      };
    });
    return buildBlockRenderPolicies(canvasScaleContext, inputs);
  }, [
    allItems,
    positions,
    activeClusterKey,
    semanticClusterRegions,
    blocksById,
    selectedId,
    focusEditingId,
    relatedToSelection,
    draggingId,
    canvasScaleContext,
  ]);

  useEffect(() => {
    const dense = canvasScaleContext.density !== 'comfortable';
    setPerformancePressure('canvas-density', dense);
    return () => setPerformancePressure('canvas-density', false);
  }, [canvasScaleContext.density]);

  const vignetteFocal = useMemo(() => {
    const focalId = focusEditingId ?? selectedId;
    if (!focalId || viewportSize.w < 1) return { x: 50, y: 42 };
    const p = positions[focalId];
    if (!p) return { x: 50, y: 42 };
    const bw = p.w > 0 ? p.w : 340;
    const bh = p.h > 0 ? p.h : 220;
    const sx = safePanX + (p.x + bw / 2) * safeZoom;
    const sy = safePanY + (p.y + bh / 2) * safeZoom;
    return {
      x: Math.min(76, Math.max(24, (sx / viewportSize.w) * 100)),
      y: Math.min(70, Math.max(30, (sy / viewportSize.h) * 100)),
    };
  }, [focusEditingId, selectedId, positions, safePanX, safePanY, safeZoom, viewportSize]);

  const hasCosmicBg = !!(
    effectiveCosmic &&
    (effectiveCosmic.starDensity > 0.02 ||
      effectiveCosmic.constellationVisibility > 0.02 ||
      effectiveCosmic.nebulaIntensity > 0.02 ||
      effectiveCosmic.milkyWayIntensity > 0.02)
  );

  const ambientDriftPaused =
    reduceEffects ||
    envReactions?.driftPaused ||
    !!(selectedId || focusEditingId || draggingId);

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
        position:   fillParent ? 'absolute' : 'fixed',
        top:        fillParent ? 0 : topOffset,
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
        ...canvasBackgroundStyle,
      }}
      onDragOver={
        onPdfDroppedOnCanvas
          ? e => {
              if (![...e.dataTransfer.types].includes('Files')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          : undefined
      }
      onDrop={
        onPdfDroppedOnCanvas
          ? e => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (!f) return;
              const rect = viewportRef.current?.getBoundingClientRect();
              if (!rect) return;
              const lx = e.clientX - rect.left;
              const ly = e.clientY - rect.top;
              const worldX = (lx - safePanX) / safeZoom;
              const worldY = (ly - safePanY) / safeZoom;
              onPdfDroppedOnCanvas(f, worldX, worldY);
            }
          : undefined
      }
      onMouseDown={onCanvasMouseDown}
      onMouseMove={e => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        setControlsNear(rect.height - (e.clientY - rect.top) < 96);
      }}
      onMouseLeave={() => setControlsNear(false)}
    >
      {surfaceActive && (livingEnvironment || (effectiveCosmic && hasCosmicBg)) ? (
        <LivingEnvironmentBackdrop
          world={livingEnvironment?.world ?? getLivingWorld('custom')}
          cosmic={livingEnvironment?.cosmic ?? effectiveCosmic!}
          reactions={livingEnvironment?.reactions ?? NEUTRAL_ENVIRONMENT_REACTIONS}
          panX={safePanX}
          panY={safePanY}
          zoom={safeZoom}
          calmEffects={calmEffects || draggingId !== null}
          reduceMotion={reduceEffects}
        />
      ) : null}
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
              fill={
                deepFocusAtmosphere
                  ? `${tokens.textGhost}0c`
                  : hasCosmicBg
                    ? `${tokens.textGhost}10`
                    : focusMode && spatialAmbient
                      ? `${tokens.accent}${focusAtm.dotGridAccentAlpha}`
                      : `${tokens.textGhost}${(workspaceClarity?.gridMul ?? 1) > 0.82 ? '22' : '18'}`
              }
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
        <FreeSpaceRenderPolicyProvider
          policies={blockRenderPolicies}
          scaleContext={canvasScaleContext}
        >
        {spatialAmbient && tokens && surfaceActive ? (
          <FreeSpaceSpatialAmbient
            tokens={tokens}
            opacityScale={ambientScale}
            pauseDrift={ambientDriftPaused}
          />
        ) : null}

        {freeSpaceConnectionsEnabled && (
          <FreeSpaceConnectionsLayer
            tokens={tokens}
            blocks={blocks}
            positions={positions}
            animateFocusId={selectedId}
            continuityEdgeKeys={continuityEdgeKeys}
            hoveredEdgeKey={hoveredConnectionEdgeKey}
            onHoveredEdgeChange={setHoveredConnectionEdgeKey}
            lineEmphasisMul={focusMode && spatialAmbient ? focusAtm.connectionLineMul : 1}
            scaleContext={canvasScaleContext}
          />
        )}

        {/* ── Region warmth — the canvas surface develops memory ─── */}
        {warmthRef.current.filter(p => p.age < 30).map((point, i) => {
          const intensity = Math.max(0, (1 - point.age / 30)) * 0.02;
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
                opacity:        0.38,
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
              opacity:        0.1,
              backgroundImage: `
                repeating-linear-gradient(90deg, transparent 0px, transparent 199px, rgba(255,255,255,0.011) 199px, rgba(255,255,255,0.011) 200px),
                repeating-linear-gradient(0deg, transparent 0px, transparent 319px, rgba(255,255,255,0.008) 319px, rgba(255,255,255,0.008) 320px)
              `,
              mixBlendMode:   'overlay',
              transition:     'opacity 0.6s ease',
            }}
          />
        )}

        {/* ── Semantic cluster regions ─────────────────────────── */}
        {semanticClusterRegions.map((region) => {
          if (!clusterFirstSeen.current.has(region.key)) clusterFirstSeen.current.set(region.key, Date.now());
          const seenMs = Date.now() - (clusterFirstSeen.current.get(region.key) ?? Date.now());
          const isStable = seenMs > 5 * 60 * 1000;
          const continuityClusterHit = region.memberIds.some(id => continuityClusterSet.has(id));
          const shapeX =
            region.dominantLane === 'source' ? 1.08 :
            region.dominantLane === 'tool' ? 1.1 :
            1.04;
          const shapeY =
            region.dominantLane === 'review' ? 1.08 :
            region.dominantLane === 'support' ? 1.04 :
            0.98;
          const baseAmbient =
            (0.2 + (region.density - 0.72) * 0.32) *
            (isStable ? 1 : 0.84) *
            (continuityClusterHit ? 1.12 : 1);
          const isActiveCluster = activeClusterKey === region.key;
          const isDistantCluster = !!activeClusterKey && !isActiveCluster;
          const ambientOpacity = Math.min(
            0.4,
            baseAmbient * (isActiveCluster ? 1.18 : isDistantCluster ? 0.52 : 1),
          );
          return (
            <div key={`cluster-${region.key}`} aria-hidden="true">
              <div
                style={{
                  position: 'absolute',
                  left: region.x,
                  top: region.y,
                  width: region.w,
                  height: region.h,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  zIndex: 0,
                  opacity: ambientOpacity,
                  transform: `scale(${shapeX}, ${shapeY})`,
                  transformOrigin: 'center center',
                  filter: `blur(${continuityClusterHit ? (isStable ? 42 : 48) : (isStable ? 46 : 56)}px)`,
                  background: `radial-gradient(ellipse at 50% 48%, rgba(255,255,255,${isActiveCluster ? '0.05' : continuityClusterHit ? (isStable ? '0.032' : '0.024') : (isStable ? '0.026' : '0.018')}) 0%, ${tokens.accent}${isActiveCluster ? '14' : continuityClusterHit ? (isStable ? '12' : '0e') : (isStable ? '0a' : '08')} 22%, transparent 78%)`,
                  transition: 'opacity 0.7s cubic-bezier(0.32,0.72,0,1), transform 0.7s cubic-bezier(0.32,0.72,0,1), filter 0.7s ease',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: region.x + region.w * 0.12,
                  top: region.y + region.h * 0.14,
                  width: region.w * 0.76,
                  height: region.h * 0.7,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  zIndex: 0,
                  opacity: ambientOpacity * (isStable ? 0.78 : 0.62),
                  filter: `blur(${continuityClusterHit ? (isStable ? 26 : 32) : (isStable ? 30 : 36)}px)`,
                  mixBlendMode: 'screen',
                  background: `radial-gradient(ellipse at 46% 42%, rgba(255,255,255,${continuityClusterHit ? (isStable ? '0.042' : '0.03') : (isStable ? '0.036' : '0.026')}) 0%, ${tokens.accent}${continuityClusterHit ? (isStable ? '11' : '0b') : (isStable ? '0b' : '08')} 28%, transparent 78%)`,
                  transition: 'opacity 0.7s cubic-bezier(0.32,0.72,0,1), filter 0.7s ease',
                }}
              />
            </div>
          );
        })}

        {/* Active cluster — gentle local illumination (foreground gravity) */}
        {activeClusterKey && semanticClusterRegions.map(region => {
          if (region.key !== activeClusterKey) return null;
          const cx = region.x + region.w / 2;
          const cy = region.y + region.h / 2;
          return (
            <div
              key="fw-active-cluster-wash"
              aria-hidden
              style={{
                position: 'absolute',
                left: cx,
                top: cy,
                width: Math.max(region.w * 1.35, 480),
                height: Math.max(region.h * 1.25, 360),
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                pointerEvents: 'none',
                zIndex: 0,
                background: `radial-gradient(ellipse 58% 52% at 50% 48%, rgba(255,255,255,0.07) 0%, ${tokens.accent}0a 28%, transparent 74%)`,
                filter: 'blur(56px)',
                opacity: deepFocusAtmosphere ? 0.5 : 0.38,
                transition: 'opacity 0.65s cubic-bezier(0.4,0,0.2,1)',
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
                background:    `radial-gradient(ellipse, ${tokens.accent}08 0%, transparent 65%)`,
                filter:        'blur(18px)',
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

          const inActiveCluster =
            !activeClusterKey ||
            semanticClusterRegions.some(
              r => r.key === activeClusterKey && r.memberIds.includes(item.id),
            );
          const distantFromCluster = !!activeClusterKey && !inActiveCluster && !isFocusItem;

          const baseOpacity = isOtherDragging ? 0.62
            : distantFromCluster && !designMode ? lifecycle.opacity * 0.9
            : sessionDim    ? Math.min(lifecycle.opacity, 0.52)
            : lifecycle.opacity;

          const scalePolicy = blockRenderPolicies.get(item.id);
          const tier = item.kind === 'block' ? focusTierById?.get(item.id) : undefined;
          const fp = tier != null ? tierToPresentation(tier, focusDimScale) : null;
          const combinedOpacity = Math.min(
            1,
            baseOpacity * (fp?.opacityMul ?? 1) * (scalePolicy?.quietMul ?? 1),
          );
          const focusFilterExtra =
            fp?.filterExtra && fp.filterExtra !== 'none' ? fp.filterExtra : '';
          const focusScale = fp?.scale ?? 1;
          const zBoost = fp?.zIndexBoost ?? 0;

          // Asymmetric opacity transition:
          // — Coming alive (active) snaps quickly so freshly-touched thoughts
          //   feel immediately responsive.
          // — Settling back (warm/dormant/fading/deep) is slow and graceful.
          const canvasInteracting = isOtherDragging || draggingId === item.id;
          const opacityTransition = canvasInteracting
            ? 'none'
            : lifecycle.state === 'active'
              ? 'opacity 0.28s cubic-bezier(0.4,0,0.2,1)'
              : (isRevisiting || isReturning)
                ? 'opacity 0.6s cubic-bezier(0.4,0,0.2,1), filter 0.6s cubic-bezier(0.4,0,0.2,1)'
                : 'opacity 0.5s cubic-bezier(0.4,0,0.2,1)';

          // Session focus: strong isolation for focus-session cards.
          // Deep focus: whisper-quiet recession for peers (readable, stable).
          const lodRecess =
            scalePolicy && scalePolicy.fidelity !== 'full'
              ? scalePolicy.fidelity === 'distant'
                ? 'saturate(0.88) brightness(0.94)'
                : scalePolicy.fidelity === 'chrome'
                  ? 'saturate(0.92) brightness(0.96)'
                  : 'saturate(0.96) brightness(0.98)'
              : 'none';

          const sessionFilter = sessionDim
            ? 'saturate(0.58) brightness(0.84)'
            : deepInactive
              ? 'saturate(0.9) brightness(0.96)'
              : distantFromCluster && !designMode
                ? 'saturate(0.92) brightness(0.97)'
                : lodRecess;

          const filterTransition = (sessionDim || deepInactive || isRevisiting || isReturning || focusFilterExtra)
            ? ', filter 1.4s cubic-bezier(0.4,0,0.2,1)'
            : '';

          const transformTransition =
            focusMode && spatialAmbient && item.kind === 'block'
              ? `, transform ${focusAtm.transition}`
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

          let displayFilter: string;
          if (isRevisiting) displayFilter = 'drop-shadow(0 0 10px rgba(245,158,11,0.22))';
          else if (isReturning) displayFilter = `drop-shadow(0 0 12px ${tokens.accent}18)`;
          else {
            const parts: string[] = [];
            if (sessionFilter !== 'none') parts.push(sessionFilter);
            if (focusFilterExtra) parts.push(focusFilterExtra);
            displayFilter = parts.length ? parts.join(' ') : 'none';
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
                    ? `radial-gradient(120% 95% at 50% 36%, ${tokens.accent}06 0%, transparent 74%)`
                    : deepInactive || distantFromCluster
                      ? 'radial-gradient(120% 95% at 50% 36%, rgba(5,10,18,0.1) 0%, transparent 78%)'
                      : 'transparent',
                  border: 'none',
                  boxShadow: focusSurfaceActive
                    ? `0 14px 40px rgba(0,0,0,0.26)`
                    : deepInactive || distantFromCluster
                      ? '0 8px 22px rgba(0,0,0,0.18)'
                      : 'none',
                  transition: 'opacity 0.5s cubic-bezier(0.4,0,0.2,1), background 0.6s cubic-bezier(0.4,0,0.2,1), border-color 0.5s cubic-bezier(0.4,0,0.2,1), box-shadow 0.55s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: pos.x - 18,
                  top: pos.y - 18,
                  width: blockW + 36,
                  height: blockH + 36,
                  borderRadius: '28px',
                  pointerEvents: 'none',
                  zIndex: 0,
                  opacity:
                    canvasInteracting || scalePolicy?.glowAllowed === false
                      ? 0
                      : item.kind === 'block'
                        ? continuityObjectSet.has(item.id)
                          ? 0.78
                          : continuityClusterSet.has(item.id)
                            ? 0.48
                            : 0
                        : 0,
                  filter:
                    canvasInteracting || scalePolicy?.glowAllowed === false ? 'none' : 'blur(22px)',
                  background: `radial-gradient(ellipse at 50% 42%, ${tokens.accent}14 0%, ${tokens.accent}0a 26%, transparent 72%)`,
                  transition: canvasInteracting ? 'none' : 'opacity 0.35s ease',
                }}
              />
              <div
                style={{
                  opacity: combinedOpacity,
                  transition: opacityTransition + filterTransition + transformTransition,
                  transform: focusScale !== 1 ? `scale(${focusScale})` : undefined,
                  transformOrigin: 'center center',
                  filter:
                    canvasInteracting || combinedOpacity < 0.98
                      ? displayFilter === 'none'
                        ? 'none'
                        : displayFilter
                      : item.kind === 'block' && continuityObjectSet.has(item.id) && displayFilter === 'none'
                        ? 'brightness(1.01) saturate(1.02)'
                        : displayFilter,
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
                  presentationZBoost={item.kind === 'block' ? zBoost : 0}
                  materialTier={resolveFreeSpaceMaterialTier(
                    item.kind,
                    item.kind === 'block' ? blocksById.get(item.id)?.type : undefined,
                  )}
                  materialShadowMul={scalePolicy?.materialShadowMul ?? 1}
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
            top:           '43%',
            transform:     'translate(-50%, -50%)',
            textAlign:     'center',
            pointerEvents: 'none',
            userSelect:    'none',
            width:         'min(620px, calc(100vw - 56px))',
          }}>
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <WorkspaceMicroScene tokens={tokens} variant="cluster-return" size="empty" />
            </div>
            <p style={{
              fontFamily:    "'Plus Jakarta Sans', sans-serif",
              fontSize:      '20px',
              fontWeight:    700,
              color:         tokens.textSecondary,
              margin:        0,
              letterSpacing: '-0.02em',
              animation:     'fadeIn 0.8s ease both',
            }}>
              A workspace that stays connected as you think.
            </p>
            <p style={{
              fontSize:   '13px',
              color:      tokens.textGhost,
              margin:     '10px auto 0',
              lineHeight: 1.5,
              animation:  'fadeIn 0.8s 0.3s ease both',
              maxWidth:   440,
            }}>
              Link notes, PDFs, mistakes, and tools. Arrange them visually. Return later with focus and recall still intact.
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 16,
                animation: 'fadeIn 0.8s 0.4s ease both',
              }}
            >
              {[
                'Build connected study spaces',
                'Arrange ideas by thinking flow',
                'Create calm deep-work environments',
                'Review concepts spatially over time',
              ].map((line) => (
                <span
                  key={line}
                  style={{
                    fontSize: 11,
                    color: tokens.textSecondary,
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: `1px solid ${tokens.cardBorder}`,
                    backgroundColor: `${tokens.wellBg}dd`,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  {line}
                </span>
              ))}
            </div>
            <p
              style={{
                fontSize: 12,
                color: tokens.textGhost,
                margin: '16px 0 0',
                lineHeight: 1.45,
                animation: 'fadeIn 0.8s 0.5s ease both',
              }}
            >
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
              {' '}to start, or choose a starter desk when it appears.
            </p>
          </div>
        )}

        </FreeSpaceRenderPolicyProvider>
      </div>

      {/* ── Spatial depth (viewport): ambient vignette → edge fade → window inset ── */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:         0,
          pointerEvents: 'none',
          zIndex:        1,
          background: deepFocusAtmosphere
            ? `radial-gradient(ellipse at ${vignetteFocal.x}% ${vignetteFocal.y}%, transparent 50%, ${tokens.pageBg}52 100%)`
            : activeSession && !designMode
              ? `radial-gradient(ellipse at ${vignetteFocal.x}% ${vignetteFocal.y}%, transparent 38%, ${tokens.pageBg}a6 100%)`
              : focusMode && spatialAmbient
                ? `radial-gradient(ellipse at ${vignetteFocal.x}% ${vignetteFocal.y}%, transparent ${focusAtm.vignetteInnerPct}%, ${tokens.pageBg}${focusAtm.vignetteEdgeAlpha} 100%)`
                : `radial-gradient(ellipse at ${vignetteFocal.x}% ${vignetteFocal.y}%, transparent 56%, ${tokens.pageBg}${scaleVignetteEdgeAlpha('52', fogMul)} 100%)`,
          transition: reduceEffects ? 'none' : 'background 2.2s cubic-bezier(0.4,0,0.2,1)',
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
          opacity: deepFocusAtmosphere
            ? 0.28
            : focusMode && spatialAmbient
              ? focusAtm.edgeFadeOpacity * 0.92
              : 0.4 * fogMul,
          transition: reduceEffects
            ? 'none'
            : focusMode && spatialAmbient
              ? `opacity ${focusAtm.transition}`
              : 'opacity 0.6s ease',
          background: `
            linear-gradient(180deg, ${tokens.pageBg}18 0%, transparent 6%, transparent 94%, ${tokens.pageBg}18 100%),
            linear-gradient(90deg,  ${tokens.pageBg}14 0%, transparent 5%, transparent 95%, ${tokens.pageBg}14 100%)
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
          boxShadow: deepFocusAtmosphere
            ? `inset 0 0 72px rgba(7,11,20,0.14)`
            : focusMode && spatialAmbient
              ? focusAtm.insetShadow
              : `inset 0 0 64px rgba(7,11,20,0.16)`,
          transition: focusMode && spatialAmbient
            ? `box-shadow ${focusAtm.transition}`
            : 'box-shadow 0.8s cubic-bezier(0.4,0,0.2,1)',
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

      {spatialMinimapEnabled && (
        <WorkspaceSurfaceErrorBoundary tokens={tokens} label="Minimap">
          <FreeSpaceMiniMap
            tokens={tokens}
            blocks={blocks}
            positions={positions}
            zoom={safeZoom}
            panX={safePanX}
            panY={safePanY}
            viewportWidth={viewportSize.w}
            viewportHeight={viewportSize.h}
            selectedId={selectedId}
            connectionsEnabled={!!freeSpaceConnectionsEnabled}
            setViewport={setViewport}
            presentationOpacityMul={focusMode && spatialAmbient ? focusAtm.minimapOpacityMul : 1}
            presentationScale={focusMode && spatialAmbient ? focusAtm.minimapScale : 1}
            calmDuringInteraction={draggingId !== null}
            chromeQuiet={deepFocusAtmosphere}
          />
        </WorkspaceSurfaceErrorBoundary>
      )}

      {/* ── Add button (bottom-right) ───────────────────────────── */}
      <button
        onClick={onOpenAdd}
        title="Bring a note, document, or tool into the workspace. ⌘K"
        style={{
          position:        'absolute',
          bottom:          '20px',
          right:           '20px',
          zIndex:          30,
          width:           '48px',
          height:          '48px',
          minWidth:        48,
          minHeight:       48,
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
            ? `0 2px 10px rgba(0,0,0,0.35), 0 0 0 1px ${tokens.accent}22`
            : `0 3px 14px rgba(0,0,0,0.32), 0 0 0 1px ${tokens.accent}28`,
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
