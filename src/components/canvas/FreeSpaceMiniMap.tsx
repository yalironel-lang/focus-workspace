/**
 * FreeSpaceMiniMap — ambient spatial orientation for large Free Space layouts.
 * Decoupled from canvas internals: consumes positions, viewport, and block metadata only.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { PositionMap } from '../../hooks/useBlockPositions';
import { coerceFreeSpaceConnectionIds } from '../../hooks/useSectionFreeSpaceObjects';

const W = 168;
const H = 108;
const PAD = 8;
const WORLD_CLAMP = 60_000;
const MIN_SPAN = 400;
const BOTTOM = 76;
const RIGHT = 20;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function safeNum(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

function rectFor(id: string, positions: PositionMap): { x: number; y: number; w: number; h: number } {
  const p = positions[id];
  const x = clamp(safeNum(p?.x ?? 40, 40), -WORLD_CLAMP, WORLD_CLAMP);
  const y = clamp(safeNum(p?.y ?? 40, 40), -WORLD_CLAMP, WORLD_CLAMP);
  const w = clamp(safeNum(p?.w ?? 340, 340), 40, WORLD_CLAMP);
  const h = clamp(safeNum(p?.h ?? 220, 220), 40, WORLD_CLAMP);
  return { x, y, w, h };
}

function worldViewport(
  panX: number,
  panY: number,
  zoom: number,
  vw: number,
  vh: number,
): { x: number; y: number; w: number; h: number } {
  const z = Math.max(0.001, zoom);
  return {
    x: -panX / z,
    y: -panY / z,
    w: vw / z,
    h: vh / z,
  };
}

function unionBounds(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  if (!Number.isFinite(minX) || minX >= maxX) {
    return { minX: 0, minY: 0, maxX: 1200, maxY: 800 };
  }
  let spanX = maxX - minX;
  let spanY = maxY - minY;
  if (spanX < MIN_SPAN) {
    const cx = (minX + maxX) / 2;
    minX = cx - MIN_SPAN / 2;
    maxX = cx + MIN_SPAN / 2;
    spanX = MIN_SPAN;
  }
  if (spanY < MIN_SPAN) {
    const cy = (minY + maxY) / 2;
    minY = cy - MIN_SPAN / 2;
    maxY = cy + MIN_SPAN / 2;
    spanY = MIN_SPAN;
  }
  return { minX, minY, maxX, maxY };
}

function clusterForSelection(
  blocks: Array<{ id: string; connections?: string[] }>,
  selectedId: string | null,
): Set<string> {
  if (!selectedId) return new Set();
  const adj = new Map<string, Set<string>>();
  for (const b of blocks) {
    if (!adj.has(b.id)) adj.set(b.id, new Set());
    for (const t of coerceFreeSpaceConnectionIds(b.connections)) {
      adj.get(b.id)!.add(t);
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(t)!.add(b.id);
    }
  }
  const out = new Set<string>();
  const stack = [selectedId];
  while (stack.length) {
    const u = stack.pop()!;
    if (out.has(u)) continue;
    out.add(u);
    for (const v of adj.get(u) ?? []) {
      if (!out.has(v)) stack.push(v);
    }
  }
  return out;
}

export interface FreeSpaceMiniMapProps {
  tokens: AtmosphereTokens;
  blocks: Array<{ id: string; connections?: string[] }>;
  positions: PositionMap;
  zoom: number;
  panX: number;
  panY: number;
  viewportWidth: number;
  viewportHeight: number;
  selectedId: string | null;
  connectionsEnabled: boolean;
  setViewport: (zoom: number, panX: number, panY: number) => void;
  /** Focus Mode: multiplies base minimap opacity curve. */
  presentationOpacityMul?: number;
  /** Focus Mode: scales the minimap panel. */
  presentationScale?: number;
  /** Suspend expensive blur/opacity transitions during canvas drag/pan. */
  calmDuringInteraction?: boolean;
  /** Deep focus: panel recedes until hovered. */
  chromeQuiet?: boolean;
}

function FreeSpaceMiniMapInner({
  tokens,
  blocks,
  positions,
  zoom,
  panX,
  panY,
  viewportWidth,
  viewportHeight,
  selectedId,
  connectionsEnabled,
  setViewport,
  presentationOpacityMul = 1,
  presentationScale = 1,
  calmDuringInteraction = false,
  chromeQuiet = false,
}: FreeSpaceMiniMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState(false);
  const dragRef = useRef<
    | {
        kind: 'pan';
        lastMx: number;
        lastMy: number;
        lastPanX: number;
        lastPanY: number;
        scale: number;
      }
    | null
  >(null);

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const { minX, minY, scale, offX, offY, vpWorld, nodeRects } = useMemo(() => {
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
    const nodeRects: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
    for (const b of blocks) {
      const r = rectFor(b.id, positions);
      rects.push(r);
      nodeRects.push({ id: b.id, ...r });
    }
    const vpW = Math.max(1, viewportWidth);
    const vpH = Math.max(1, viewportHeight);
    const vp = worldViewport(panX, panY, zoom, vpW, vpH);
    rects.push(vp);
    const u = unionBounds(rects);
    const spanX = u.maxX - u.minX;
    const spanY = u.maxY - u.minY;
    const sc = Math.min(innerW / spanX, innerH / spanY);
    const ox = PAD + (innerW - spanX * sc) / 2;
    const oy = PAD + (innerH - spanY * sc) / 2;
    return {
      minX: u.minX,
      minY: u.minY,
      scale: sc,
      offX: ox,
      offY: oy,
      vpWorld: vp,
      nodeRects,
    };
  }, [blocks, positions, panX, panY, zoom, viewportWidth, viewportHeight, innerW, innerH]);

  const toSvg = useCallback(
    (wx: number, wy: number) => ({
      x: offX + (wx - minX) * scale,
      y: offY + (wy - minY) * scale,
    }),
    [minX, minY, offX, offY, scale],
  );

  const cluster = useMemo(
    () => clusterForSelection(blocks, selectedId),
    [blocks, selectedId],
  );

  const edges = useMemo(() => {
    if (!connectionsEnabled) return [];
    const seen = new Set<string>();
    const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const b of blocks) {
      const ra = rectFor(b.id, positions);
      const ax = ra.x + ra.w / 2;
      const ay = ra.y + ra.h / 2;
      for (const t of coerceFreeSpaceConnectionIds(b.connections)) {
        const k = b.id < t ? `${b.id}|${t}` : `${t}|${b.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (!blocks.some(x => x.id === t)) continue;
        const rb = rectFor(t, positions);
        out.push({
          x1: ax,
          y1: ay,
          x2: rb.x + rb.w / 2,
          y2: rb.y + rb.h / 2,
        });
      }
    }
    return out;
  }, [blocks, positions, connectionsEnabled]);

  const vpSvg = useMemo(() => {
    const p0 = toSvg(vpWorld.x, vpWorld.y);
    const p1 = toSvg(vpWorld.x + vpWorld.w, vpWorld.y + vpWorld.h);
    const x = Math.min(p0.x, p1.x);
    const y = Math.min(p0.y, p1.y);
    const rw = Math.max(3, Math.abs(p1.x - p0.x));
    const rh = Math.max(3, Math.abs(p1.y - p0.y));
    return { x, y, w: rw, h: rh };
  }, [toSvg, vpWorld]);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): { wx: number; wy: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const loc = pt.matrixTransform(ctm.inverse());
      const wx = minX + (loc.x - offX) / scale;
      const wy = minY + (loc.y - offY) / scale;
      return { wx, wy };
    },
    [minX, minY, offX, offY, scale],
  );

  const hitViewport = useCallback(
    (clientX: number, clientY: number): boolean => {
      const svg = svgRef.current;
      if (!svg) return false;
      const ctm = svg.getScreenCTM();
      if (!ctm) return false;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const loc = pt.matrixTransform(ctm.inverse());
      const slop = 5;
      return (
        loc.x >= vpSvg.x - slop &&
        loc.x <= vpSvg.x + vpSvg.w + slop &&
        loc.y >= vpSvg.y - slop &&
        loc.y <= vpSvg.y + vpSvg.h + slop
      );
    },
    [vpSvg],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const svg = svgRef.current;
      const vw = Math.max(1, viewportWidth);
      const vh = Math.max(1, viewportHeight);
      if (hitViewport(e.clientX, e.clientY)) {
        dragRef.current = {
          kind: 'pan',
          lastMx: e.clientX,
          lastMy: e.clientY,
          lastPanX: panX,
          lastPanY: panY,
          scale,
        };
        try {
          svg?.setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      } else {
        const w = clientToWorld(e.clientX, e.clientY);
        if (w) {
          const panX2 = vw / 2 - w.wx * zoom;
          const panY2 = vh / 2 - w.wy * zoom;
          setViewport(zoom, panX2, panY2);
        }
      }
    },
    [
      hitViewport,
      clientToWorld,
      panX,
      panY,
      scale,
      zoom,
      setViewport,
      viewportWidth,
      viewportHeight,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.kind !== 'pan') return;
      e.stopPropagation();
      const dx = e.clientX - d.lastMx;
      const dy = e.clientY - d.lastMy;
      d.lastMx = e.clientX;
      d.lastMy = e.clientY;
      const dWorldX = dx / d.scale;
      const dWorldY = dy / d.scale;
      const panX2 = d.lastPanX - zoom * dWorldX;
      const panY2 = d.lastPanY - zoom * dWorldY;
      d.lastPanX = panX2;
      d.lastPanY = panY2;
      setViewport(zoom, panX2, panY2);
    },
    [zoom, setViewport],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const amber = tokens.accent;

  return (
    <div
      style={{
        position: 'absolute',
        right: RIGHT,
        bottom: BOTTOM,
        width: W,
        height: H,
        zIndex: 32,
        borderRadius: 14,
        backgroundColor: calmDuringInteraction ? `${tokens.cardBg}fa` : `${tokens.cardBg}ec`,
        border: `1px solid ${tokens.cardBorderHover}`,
        boxShadow: `0 10px 36px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)`,
        backdropFilter: calmDuringInteraction ? 'none' : 'blur(14px) saturate(1.2)',
        WebkitBackdropFilter: calmDuringInteraction ? 'none' : 'blur(14px) saturate(1.2)',
        opacity:
          (chromeQuiet && !hovered ? 0.72 : calmDuringInteraction ? 0.94 : hovered ? 0.96 : 0.9) *
          Math.max(0.2, Math.min(1.35, presentationOpacityMul)),
        transform: `scale(${Math.max(0.72, Math.min(1.2, presentationScale))})`,
        transformOrigin: 'bottom right',
        transition: calmDuringInteraction ? 'none' : 'opacity 0.35s ease, box-shadow 0.4s ease, transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <filter id="fwMiniMapVpGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {edges.map((ln, i) => {
          const a = toSvg(ln.x1, ln.y1);
          const b = toSvg(ln.x2, ln.y2);
          return (
            <line
              key={`e-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={amber}
              strokeOpacity={0.36}
              strokeWidth={1.02}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {nodeRects.map(({ id, x, y, w, h }) => {
          const p0 = toSvg(x, y);
          const p1 = toSvg(x + w, y + h);
          const rx = Math.min(p0.x, p1.x);
          const ry = Math.min(p0.y, p1.y);
          const rw = Math.max(2, Math.abs(p1.x - p0.x));
          const rh = Math.max(2, Math.abs(p1.y - p0.y));
          const sel = id === selectedId;
          const inCluster = cluster.has(id);
          const fill = sel || inCluster ? amber : tokens.textPrimary;
          const fillOp = sel ? 0.54 : inCluster ? 0.4 : 0.22;
          return (
            <rect
              key={id}
              x={rx}
              y={ry}
              width={rw}
              height={rh}
              rx={1.8}
              ry={1.8}
              fill={fill}
              fillOpacity={fillOp}
              stroke={sel ? amber : tokens.textGhost}
              strokeOpacity={sel ? 0.68 : 0.48}
              strokeWidth={sel ? 1 : 0.58}
              vectorEffect="non-scaling-stroke"
              style={
                sel
                  ? {
                      animation: 'fwMinimapPulse 2.4s ease-in-out infinite',
                    }
                  : undefined
              }
            />
          );
        })}

        <rect
          x={vpSvg.x}
          y={vpSvg.y}
          width={vpSvg.w}
          height={vpSvg.h}
          fill="none"
          stroke={amber}
          strokeOpacity={0.72}
          strokeWidth={1.2}
          rx={2}
          ry={2}
          filter="url(#fwMiniMapVpGlow)"
          style={{
            transition:
              'x 0.32s cubic-bezier(0.22, 1, 0.36, 1), y 0.32s cubic-bezier(0.22, 1, 0.36, 1), width 0.32s cubic-bezier(0.22, 1, 0.36, 1), height 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
        <rect
          x={vpSvg.x}
          y={vpSvg.y}
          width={vpSvg.w}
          height={vpSvg.h}
          fill={amber}
          fillOpacity={0.12}
          stroke="none"
          rx={2}
          ry={2}
          style={{
            transition:
              'x 0.32s cubic-bezier(0.22, 1, 0.36, 1), y 0.32s cubic-bezier(0.22, 1, 0.36, 1), width 0.32s cubic-bezier(0.22, 1, 0.36, 1), height 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: 'none',
          }}
        />
      </svg>
    </div>
  );
}

export const FreeSpaceMiniMap = memo(FreeSpaceMiniMapInner);
