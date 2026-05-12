import { memo, useMemo, useCallback, useId } from 'react';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { coerceFreeSpaceConnectionIds } from '../../hooks/useSectionFreeSpaceObjects';
import type { PositionMap } from '../../hooks/useBlockPositions';

const DEFAULT_W = 340;
const DEFAULT_H = 220;

export interface FreeSpaceBlockConn {
  id: string;
  connections?: string[];
}

function blockCenter(id: string, positions: PositionMap): { x: number; y: number } | null {
  const p = positions[id];
  if (!p) return null;
  const w = p.w > 0 ? p.w : DEFAULT_W;
  const h = p.h > 0 ? p.h : DEFAULT_H;
  return { x: p.x + w / 2, y: p.y + h / 2 };
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function cubicPath(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const perpX = (-dy / dist) * Math.min(48, dist * 0.22);
  const perpY = (dx / dist) * Math.min(48, dist * 0.22);
  const cx1 = ax + dx * 0.38 + perpX * 0.55;
  const cy1 = ay + dy * 0.38 + perpY * 0.55;
  const cx2 = bx - dx * 0.38 + perpX * 0.55;
  const cy2 = by - dy * 0.38 + perpY * 0.55;
  return `M ${ax.toFixed(2)} ${ay.toFixed(2)} C ${cx1.toFixed(2)} ${cy1.toFixed(2)} ${cx2.toFixed(2)} ${cy2.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`;
}

export interface FreeSpaceConnectionsLayerProps {
  tokens: AtmosphereTokens;
  blocks: FreeSpaceBlockConn[];
  positions: PositionMap;
  /** Lines touching this id pulse softly */
  animateFocusId?: string | null;
  hoveredEdgeKey: string | null;
  onHoveredEdgeChange: (key: string | null) => void;
}

function FreeSpaceConnectionsLayerInner({
  tokens,
  blocks,
  positions,
  animateFocusId,
  hoveredEdgeKey,
  onHoveredEdgeChange,
}: FreeSpaceConnectionsLayerProps) {
  const fid = useId().replace(/:/g, '');
  const filterId = `fw-conn-glow-${fid}`;

  const edges = useMemo(() => {
    const idSet = new Set(blocks.map(b => b.id));
    const seen = new Set<string>();
    const list: { key: string; from: string; to: string; d: string }[] = [];
    for (const b of blocks) {
      const conns = coerceFreeSpaceConnectionIds(b.connections);
      if (!conns.length) continue;
      for (const toId of conns) {
        if (!idSet.has(toId) || toId === b.id) continue;
        const k = edgeKey(b.id, toId);
        if (seen.has(k)) continue;
        seen.add(k);
        const ca = blockCenter(b.id, positions);
        const cb = blockCenter(toId, positions);
        if (!ca || !cb) continue;
        list.push({ key: k, from: b.id, to: toId, d: cubicPath(ca.x, ca.y, cb.x, cb.y) });
      }
    }
    return list;
  }, [blocks, positions]);

  const onEnter = useCallback(
    (k: string) => () => onHoveredEdgeChange(k),
    [onHoveredEdgeChange],
  );
  const onLeave = useCallback(() => onHoveredEdgeChange(null), [onHoveredEdgeChange]);

  const accent = tokens.accent ?? '#f59e0b';

  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {edges.map(({ key, d, from, to }) => {
        const hovered = hoveredEdgeKey === key;
        const pulse = !!animateFocusId && (animateFocusId === from || animateFocusId === to);
        const stroke = hovered ? `${accent}aa` : `${accent}38`;
        const width = hovered ? 1.35 : 0.85;
        return (
          <g key={key} style={{ pointerEvents: 'auto' }}>
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={20}
              style={{ cursor: 'default', pointerEvents: 'stroke' }}
              onMouseEnter={onEnter(key)}
              onMouseLeave={onLeave}
            />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={width}
              strokeLinecap="round"
              filter={hovered || pulse ? `url(#${filterId})` : undefined}
              style={{
                transition: 'stroke 0.32s ease, stroke-width 0.32s ease, opacity 0.4s ease',
                opacity: pulse && !hovered ? 0.72 : 1,
                animation: pulse ? 'fwConnPulse 2.6s ease-in-out infinite' : undefined,
              }}
            />
            {hovered && (
              <path
                d={d}
                fill="none"
                stroke={`${accent}55`}
                strokeWidth={5}
                strokeLinecap="round"
                opacity={0.4}
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        );
      })}
      <style>{`
        @keyframes fwConnPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.95; }
        }
      `}</style>
    </svg>
  );
}

export const FreeSpaceConnectionsLayer = memo(FreeSpaceConnectionsLayerInner);
