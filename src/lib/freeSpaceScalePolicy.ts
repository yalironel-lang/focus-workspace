/**
 * Free Space canvas scalability — LOD, viewport priority, semantic quieting.
 * Presentation + suspension only; does not change layout or persistence.
 */

import type { BlockPos, PositionMap } from '../hooks/useBlockPositions';

export type CanvasDensity = 'comfortable' | 'busy' | 'dense';

/** Render fidelity for block interiors (not shell removal). */
export type RenderFidelity = 'full' | 'reduced' | 'chrome' | 'distant';

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasScaleContext {
  zoom: number;
  panX: number;
  panY: number;
  viewportW: number;
  viewportH: number;
  viewportWorld: WorldRect;
  /** Expanded viewport for soft culling (world units). */
  viewportExpanded: WorldRect;
  objectCount: number;
  density: CanvasDensity;
  /** Global quieting when many objects compete for attention. */
  densityQuietMul: number;
  ambientScaleMul: number;
  connectionOpacityMul: number;
  connectionGlowEnabled: boolean;
  continuityGlowEnabled: boolean;
}

export interface BlockRenderPolicy {
  fidelity: RenderFidelity;
  quietMul: number;
  shadowMul: number;
  glowAllowed: boolean;
  suspendHeavyContent: boolean;
  chromeOnly: boolean;
  materialShadowMul: number;
}

export interface BlockPolicyInput {
  id: string;
  kind: 'module' | 'block' | 'tool';
  blockType?: string;
  pos: BlockPos;
  selected: boolean;
  editing: boolean;
  inActiveCluster: boolean;
  relatedToSelection: boolean;
  dragging: boolean;
}

const DEFAULT_BLOCK_W = 340;
const DEFAULT_BLOCK_H = 220;

const HEAVY_TYPES = new Set(['notebook', 'pdf', 'companion', 'graph']);

export const DEFAULT_BLOCK_RENDER_POLICY: BlockRenderPolicy = {
  fidelity: 'full',
  quietMul: 1,
  shadowMul: 1,
  glowAllowed: true,
  suspendHeavyContent: false,
  chromeOnly: false,
  materialShadowMul: 1,
};

export function densityFromCount(count: number): CanvasDensity {
  if (count >= 36) return 'dense';
  if (count >= 18) return 'busy';
  return 'comfortable';
}

export function blockWorldRect(pos: BlockPos): WorldRect {
  return {
    x: pos.x,
    y: pos.y,
    w: pos.w > 0 ? pos.w : DEFAULT_BLOCK_W,
    h: pos.h > 0 ? pos.h : DEFAULT_BLOCK_H,
  };
}

export function worldViewportRect(
  panX: number,
  panY: number,
  zoom: number,
  viewportW: number,
  viewportH: number,
): WorldRect {
  const z = Math.max(0.12, zoom);
  return {
    x: -panX / z,
    y: -panY / z,
    w: viewportW / z,
    h: viewportH / z,
  };
}

export function expandWorldRect(rect: WorldRect, marginRatio: number): WorldRect {
  const mx = rect.w * marginRatio;
  const my = rect.h * marginRatio;
  return {
    x: rect.x - mx,
    y: rect.y - my,
    w: rect.w + mx * 2,
    h: rect.h + my * 2,
  };
}

function rectOverlapArea(a: WorldRect, b: WorldRect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

export function viewportOverlapRatio(block: WorldRect, viewport: WorldRect): number {
  const blockArea = Math.max(1, block.w * block.h);
  return rectOverlapArea(block, viewport) / blockArea;
}

export function distanceFromViewportCenter(block: WorldRect, viewport: WorldRect): number {
  const bcx = block.x + block.w / 2;
  const bcy = block.y + block.h / 2;
  const vcx = viewport.x + viewport.w / 2;
  const vcy = viewport.y + viewport.h / 2;
  return Math.hypot(bcx - vcx, bcy - vcy);
}

export function buildCanvasScaleContext(input: {
  zoom: number;
  panX: number;
  panY: number;
  viewportW: number;
  viewportH: number;
  objectCount: number;
}): CanvasScaleContext {
  const viewportWorld = worldViewportRect(
    input.panX,
    input.panY,
    input.zoom,
    input.viewportW,
    input.viewportH,
  );
  const density = densityFromCount(input.objectCount);
  const densityQuietMul = density === 'dense' ? 0.92 : density === 'busy' ? 0.96 : 1;
  const ambientScaleMul = density === 'dense' ? 0.62 : density === 'busy' ? 0.78 : 1;
  const connectionOpacityMul = density === 'dense' ? 0.72 : density === 'busy' ? 0.86 : 1;
  const connectionGlowEnabled = density !== 'dense';
  const continuityGlowEnabled = input.objectCount <= 28 && density !== 'dense';

  return {
    zoom: input.zoom,
    panX: input.panX,
    panY: input.panY,
    viewportW: input.viewportW,
    viewportH: input.viewportH,
    viewportWorld,
    viewportExpanded: expandWorldRect(viewportWorld, 0.35),
    objectCount: input.objectCount,
    density,
    densityQuietMul,
    ambientScaleMul,
    connectionOpacityMul,
    connectionGlowEnabled,
    continuityGlowEnabled,
  };
}

function isHeavyBlock(blockType?: string): boolean {
  return HEAVY_TYPES.has((blockType ?? '').toLowerCase());
}

export function getBlockRenderPolicy(
  ctx: CanvasScaleContext,
  input: BlockPolicyInput,
): BlockRenderPolicy {
  const rect = blockWorldRect(input.pos);
  const overlap = viewportOverlapRatio(rect, ctx.viewportExpanded);
  const overlapStrict = viewportOverlapRatio(rect, ctx.viewportWorld);
  const dist = distanceFromViewportCenter(rect, ctx.viewportWorld);
  const heavy = input.kind === 'block' && isHeavyBlock(input.blockType);

  const priority =
    input.editing ||
    input.selected ||
    input.dragging ||
    (input.relatedToSelection && overlapStrict > 0.02);

  let fidelity: RenderFidelity = 'full';

  if (priority) {
    fidelity = ctx.zoom < 0.32 && heavy ? 'reduced' : 'full';
  } else if (ctx.zoom < 0.26) {
    fidelity = 'distant';
  } else if (ctx.zoom < 0.4 && overlap < 0.08) {
    fidelity = 'distant';
  } else if (overlap < 0.02) {
    fidelity = dist > Math.max(ctx.viewportWorld.w, ctx.viewportWorld.h) * 0.95 ? 'distant' : 'chrome';
  } else if (overlap < 0.12 || (ctx.density !== 'comfortable' && dist > ctx.viewportWorld.w * 0.55)) {
    fidelity = 'chrome';
  } else if (ctx.density === 'dense' && overlap < 0.35) {
    fidelity = 'reduced';
  } else if (ctx.density === 'busy' && overlap < 0.2 && !input.inActiveCluster) {
    fidelity = 'reduced';
  }

  if (input.inActiveCluster && fidelity === 'distant') fidelity = 'chrome';
  if (input.inActiveCluster && fidelity === 'chrome' && overlapStrict > 0.05) fidelity = 'reduced';

  const quietByFidelity =
    fidelity === 'distant' ? 0.78 : fidelity === 'chrome' ? 0.88 : fidelity === 'reduced' ? 0.94 : 1;
  const clusterMul = input.inActiveCluster ? 1 : ctx.density === 'dense' ? 0.9 : 0.96;
  const quietMul = quietByFidelity * clusterMul * ctx.densityQuietMul;

  const shadowMul =
    fidelity === 'full' ? 1 : fidelity === 'reduced' ? 0.82 : fidelity === 'chrome' ? 0.62 : 0.48;

  const glowAllowed =
    ctx.continuityGlowEnabled && fidelity !== 'distant' && (priority || fidelity === 'full');

  const suspendHeavyContent =
    heavy &&
    !input.editing &&
    (fidelity === 'distant' ||
      fidelity === 'chrome' ||
      (fidelity === 'reduced' && !input.selected) ||
      (ctx.zoom < 0.48 && !priority));

  const chromeOnly =
    heavy && (fidelity === 'distant' || (fidelity === 'chrome' && !input.selected && !input.editing));

  return {
    fidelity,
    quietMul,
    shadowMul,
    glowAllowed,
    suspendHeavyContent,
    chromeOnly,
    materialShadowMul: shadowMul,
  };
}

export function buildBlockRenderPolicies(
  ctx: CanvasScaleContext,
  items: BlockPolicyInput[],
): Map<string, BlockRenderPolicy> {
  const map = new Map<string, BlockRenderPolicy>();
  for (const item of items) {
    map.set(item.id, getBlockRenderPolicy(ctx, item));
  }
  return map;
}

export function shouldRenderConnection(
  ctx: CanvasScaleContext,
  fromId: string,
  toId: string,
  positions: PositionMap,
  focalId: string | null,
): { render: boolean; opacityMul: number; simplified: boolean; glow: boolean } {
  const ca = positions[fromId];
  const cb = positions[toId];
  if (!ca || !cb) return { render: false, opacityMul: 0, simplified: true, glow: false };

  const ra = blockWorldRect(ca);
  const rb = blockWorldRect(cb);
  const active = focalId === fromId || focalId === toId;
  const inView =
    viewportOverlapRatio(ra, ctx.viewportExpanded) > 0 ||
    viewportOverlapRatio(rb, ctx.viewportExpanded) > 0;

  if (active) {
    return { render: true, opacityMul: 1, simplified: false, glow: ctx.connectionGlowEnabled };
  }

  if (!inView && ctx.density === 'dense') {
    return { render: true, opacityMul: 0.18, simplified: true, glow: false };
  }

  if (!inView && ctx.density === 'busy') {
    return { render: true, opacityMul: 0.38, simplified: true, glow: false };
  }

  return {
    render: true,
    opacityMul: inView ? 1 : 0.55,
    simplified: ctx.density !== 'comfortable' && !inView,
    glow: ctx.connectionGlowEnabled && inView,
  };
}
