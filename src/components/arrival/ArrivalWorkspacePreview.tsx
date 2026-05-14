import { BookOpen, FileText, Globe, Link2, Sigma, StickyNote } from 'lucide-react';
import { useMemo } from 'react';
import { FreeSpaceConnectionsLayer } from '../canvas/FreeSpaceConnectionsLayer';
import { FreeSpaceSpatialAmbient } from '../canvas/FreeSpaceSpatialAmbient';
import { WorkspaceMicroScene } from '../workspace-guidance/WorkspaceMicroScene';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { PositionMap } from '../../hooks/useBlockPositions';

interface PreviewCard {
  id: string;
  label: string;
  detail: string;
  kind: 'pdf' | 'notebook' | 'note' | 'companion' | 'problem';
  connections?: string[];
}

const PREVIEW_BLOCKS: PreviewCard[] = [
  {
    id: 'lecture-pdf',
    label: 'Lecture PDF',
    detail: 'Electromagnetic fields',
    kind: 'pdf',
    connections: ['thinking-note', 'problem-stack'],
  },
  {
    id: 'thinking-note',
    label: 'Connected notes',
    detail: 'Definitions, links, open questions',
    kind: 'note',
    connections: ['lecture-pdf', 'reading-notebook', 'companion-panel'],
  },
  {
    id: 'reading-notebook',
    label: 'Study notebook',
    detail: 'Quotes, diagrams, recall prompts',
    kind: 'notebook',
    connections: ['thinking-note'],
  },
  {
    id: 'companion-panel',
    label: 'Companion',
    detail: 'Reference and context stay nearby',
    kind: 'companion',
    connections: ['thinking-note', 'problem-stack'],
  },
  {
    id: 'problem-stack',
    label: 'Problem stack',
    detail: 'Working memory stays visible',
    kind: 'problem',
    connections: ['lecture-pdf', 'companion-panel'],
  },
];

const PREVIEW_POSITIONS: PositionMap = {
  'lecture-pdf': { x: 72, y: 86, w: 220, h: 176 },
  'thinking-note': { x: 300, y: 128, w: 240, h: 160 },
  'reading-notebook': { x: 180, y: 304, w: 204, h: 138 },
  'companion-panel': { x: 560, y: 164, w: 222, h: 154 },
  'problem-stack': { x: 488, y: 334, w: 192, h: 120 },
};

const CONTINUITY_EDGES = ['lecture-pdf|thinking-note', 'companion-panel|thinking-note', 'lecture-pdf|problem-stack'];
const MAP_WIDTH = 180;
const MAP_HEIGHT = 108;
const NOOP = () => {};

function iconFor(kind: PreviewCard['kind']) {
  switch (kind) {
    case 'pdf':
      return FileText;
    case 'notebook':
      return BookOpen;
    case 'companion':
      return Globe;
    case 'problem':
      return Sigma;
    case 'note':
    default:
      return StickyNote;
  }
}

function toneFor(kind: PreviewCard['kind'], tokens: AtmosphereTokens) {
  switch (kind) {
    case 'pdf':
      return {
        glow: `${tokens.accent}1a`,
        border: `${tokens.accent}2a`,
      };
    case 'problem':
      return {
        glow: 'rgba(139,92,246,0.14)',
        border: 'rgba(139,92,246,0.26)',
      };
    case 'companion':
      return {
        glow: 'rgba(56,189,248,0.12)',
        border: 'rgba(56,189,248,0.22)',
      };
    default:
      return {
        glow: 'rgba(255,255,255,0.05)',
        border: 'rgba(255,255,255,0.08)',
      };
  }
}

function ArrivalPreviewMiniMap({
  tokens,
  cards,
  positions,
}: {
  tokens: AtmosphereTokens;
  cards: PreviewCard[];
  positions: PositionMap;
}) {
  const geometry = useMemo(() => {
    const rects = cards.map(card => {
      const pos = positions[card.id];
      return {
        id: card.id,
        x: pos.x,
        y: pos.y,
        w: pos.w,
        h: pos.h,
      };
    });
    const minX = Math.min(...rects.map(rect => rect.x));
    const minY = Math.min(...rects.map(rect => rect.y));
    const maxX = Math.max(...rects.map(rect => rect.x + rect.w));
    const maxY = Math.max(...rects.map(rect => rect.y + rect.h));
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const scale = Math.min((MAP_WIDTH - 16) / spanX, (MAP_HEIGHT - 16) / spanY);
    const offsetX = (MAP_WIDTH - spanX * scale) / 2;
    const offsetY = (MAP_HEIGHT - spanY * scale) / 2;
    return {
      rects: rects.map(rect => ({
        ...rect,
        sx: offsetX + (rect.x - minX) * scale,
        sy: offsetY + (rect.y - minY) * scale,
        sw: Math.max(8, rect.w * scale),
        sh: Math.max(5, rect.h * scale),
      })),
      scale,
      minX,
      minY,
      viewport: {
        x: offsetX + (218 - minX) * scale,
        y: offsetY + (102 - minY) * scale,
        w: 280 * scale,
        h: 188 * scale,
      },
    };
  }, [cards, positions]);

  return (
    <div
      className="pointer-events-none absolute bottom-4 right-4 rounded-2xl px-3 py-2.5"
      style={{
        width: 208,
        background: 'rgba(8,10,16,0.48)',
        border: `1px solid ${tokens.cardBorder}`,
        boxShadow: '0 18px 40px rgba(0,0,0,0.24)',
        backdropFilter: 'blur(20px)',
      }}
      aria-hidden
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.28em]" style={{ color: tokens.textGhost }}>
          Spatial map
        </span>
        <Link2 className="h-3.5 w-3.5" style={{ color: tokens.accent }} strokeWidth={2} />
      </div>
      <svg width="100%" height="108" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
        {cards.flatMap(card => {
          const source = positions[card.id];
          return (card.connections ?? [])
            .filter(targetId => card.id < targetId)
            .map(targetId => {
              const target = positions[targetId];
              if (!source || !target) return null;
              const sx = geometry.rects.find(rect => rect.id === card.id);
              const tx = geometry.rects.find(rect => rect.id === targetId);
              if (!sx || !tx) return null;
              return (
                <line
                  key={`${card.id}-${targetId}`}
                  x1={sx.sx + sx.sw / 2}
                  y1={sx.sy + sx.sh / 2}
                  x2={tx.sx + tx.sw / 2}
                  y2={tx.sy + tx.sh / 2}
                  stroke={CONTINUITY_EDGES.includes(card.id < targetId ? `${card.id}|${targetId}` : `${targetId}|${card.id}`) ? `${tokens.accent}8a` : 'rgba(255,255,255,0.16)'}
                  strokeWidth={1.15}
                  strokeLinecap="round"
                />
              );
            })
            .filter(Boolean);
        })}
        {geometry.rects.map(rect => (
          <rect
            key={rect.id}
            x={rect.sx}
            y={rect.sy}
            width={rect.sw}
            height={rect.sh}
            rx={3.5}
            fill={rect.id === 'thinking-note' ? `${tokens.accent}30` : 'rgba(255,255,255,0.12)'}
            stroke={rect.id === 'thinking-note' ? `${tokens.accent}88` : 'rgba(255,255,255,0.18)'}
            strokeWidth={0.9}
          />
        ))}
        <rect
          x={geometry.viewport.x}
          y={geometry.viewport.y}
          width={geometry.viewport.w}
          height={geometry.viewport.h}
          rx={6}
          fill="rgba(255,255,255,0.02)"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

export function ArrivalWorkspacePreview({ tokens }: { tokens: AtmosphereTokens }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div
      className="pointer-events-none relative h-[360px] w-full overflow-hidden rounded-[28px] border md:h-[420px] xl:h-[470px]"
      style={{
        background: `
          radial-gradient(circle at 20% 18%, ${tokens.accent}14 0%, transparent 30%),
          radial-gradient(circle at 88% 16%, rgba(59,130,246,0.10) 0%, transparent 28%),
          linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 32%, rgba(0,0,0,0.16) 100%)
        `,
        borderColor: tokens.cardBorder,
        boxShadow: '0 28px 90px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
      aria-hidden
    >
      <style>{`
        @keyframes fwArrivalWorldDrift {
          0%, 100% { transform: translate(-46%, -47%) scale(0.96); }
          50% { transform: translate(-48%, -45%) scale(0.985); }
        }
        @keyframes fwArrivalFloatA {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes fwArrivalFloatB {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(6px) translateX(-4px); }
        }
        @keyframes fwArrivalFloatC {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(-5px) translateX(3px); }
        }
        @keyframes fwArrivalGlow {
          0%, 100% { opacity: 0.36; }
          50% { opacity: 0.76; }
        }
      `}</style>

      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(5,8,14,0.08) 0%, rgba(5,8,14,0.28) 100%)',
        }}
      />
      <div className="absolute inset-0 opacity-60">
        <FreeSpaceSpatialAmbient tokens={tokens} opacityScale={0.34} />
      </div>

      <div
        className="absolute inset-0"
        style={{
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.96) 78%, rgba(0,0,0,0.72) 100%)',
          WebkitMaskImage:
            'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.96) 78%, rgba(0,0,0,0.72) 100%)',
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-[520px] w-[860px]"
          style={{
            transform: 'translate(-46%, -47%) scale(0.96)',
            animation: prefersReducedMotion ? undefined : 'fwArrivalWorldDrift 20s ease-in-out infinite',
            transformOrigin: 'center center',
          }}
        >
          <FreeSpaceConnectionsLayer
            tokens={tokens}
            blocks={PREVIEW_BLOCKS}
            positions={PREVIEW_POSITIONS}
            animateFocusId={prefersReducedMotion ? null : 'thinking-note'}
            continuityEdgeKeys={CONTINUITY_EDGES}
            hoveredEdgeKey={null}
            onHoveredEdgeChange={NOOP}
            lineEmphasisMul={0.86}
          />

          {PREVIEW_BLOCKS.map((card, index) => {
            const pos = PREVIEW_POSITIONS[card.id];
            const Icon = iconFor(card.kind);
            const tone = toneFor(card.kind, tokens);
            const animationName = index % 3 === 0 ? 'fwArrivalFloatA' : index % 3 === 1 ? 'fwArrivalFloatB' : 'fwArrivalFloatC';
            return (
              <div
                key={card.id}
                className="absolute rounded-[22px] border px-4 py-3"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: pos.w,
                  minHeight: pos.h,
                  background: `linear-gradient(180deg, rgba(10,12,18,0.72) 0%, rgba(10,12,18,0.58) 100%), ${tone.glow}`,
                  borderColor: tone.border,
                  boxShadow: `0 18px 50px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)`,
                  backdropFilter: 'blur(24px)',
                  animation: prefersReducedMotion ? undefined : `${animationName} ${13 + index * 1.4}s ease-in-out infinite`,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: card.kind === 'note' ? `${tokens.accent}20` : 'rgba(255,255,255,0.06)',
                        color: card.kind === 'note' ? tokens.accent : tokens.textSecondary,
                      }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.1} />
                    </span>
                    <div>
                      <div className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: tokens.textGhost }}>
                        {card.label}
                      </div>
                      <div className="mt-1 text-sm font-medium" style={{ color: tokens.textPrimary }}>
                        {card.detail}
                      </div>
                    </div>
                  </div>
                  {card.id === 'thinking-note' && (
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: tokens.accent,
                        boxShadow: prefersReducedMotion ? undefined : `0 0 18px ${tokens.accent}7a`,
                        animation: prefersReducedMotion ? undefined : 'fwArrivalGlow 6.2s ease-in-out infinite',
                      }}
                    />
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: card.id === 'lecture-pdf' ? '74%' : card.id === 'problem-stack' ? '58%' : '68%',
                      background: 'rgba(255,255,255,0.14)',
                    }}
                  />
                  <div className="flex gap-2">
                    <div className="h-2 flex-1 rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }} />
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: card.kind === 'companion' ? 56 : 40,
                        background: card.kind === 'companion' ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.08)',
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-2 w-[34%] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
                    <div className="h-2 flex-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  </div>
                </div>
              </div>
            );
          })}

          <div
            className="absolute left-[94px] top-[22px] rounded-[20px] border px-3 py-3"
            style={{
              background: 'rgba(8,10,16,0.42)',
              borderColor: 'rgba(255,255,255,0.08)',
              boxShadow: '0 14px 32px rgba(0,0,0,0.24)',
              backdropFilter: 'blur(18px)',
            }}
          >
            <WorkspaceMicroScene tokens={tokens} variant="thinking-map" size="card" />
          </div>
        </div>
      </div>

      <ArrivalPreviewMiniMap tokens={tokens} cards={PREVIEW_BLOCKS} positions={PREVIEW_POSITIONS} />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
        style={{
          background: 'linear-gradient(180deg, rgba(5,8,14,0) 0%, rgba(5,8,14,0.42) 54%, rgba(5,8,14,0.78) 100%)',
        }}
      />
    </div>
  );
}
