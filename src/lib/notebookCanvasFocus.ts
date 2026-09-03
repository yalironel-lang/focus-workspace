import type { BlockPos } from '../hooks/useBlockPositions';

/**
 * Must match WORKSPACE_SHELL_TOP_INSET. Floating workspace chrome overlays the
 * top of the absolute-fill FreeformCanvas while the parent only pads in-flow
 * content — framing must use the unobstructed region.
 */
export const FREEFORM_FRAME_TOP_CHROME_INSET = 54;

/**
 * Mission Control Open visual-focus contract (viewport only — no PositionMap writes):
 * - Target fully visible with ~11% safe margin of the usable canvas on each side
 * - Target occupies a strong share of the usable canvas (dominant axis ≥ ~55%)
 * - Zoom may exceed study pan clamp so neighbors do not dominate the landing
 * - Framing uses target bounds alone (never a multi-object bounding box)
 */
export const MC_FRAME_SAFE_MARGIN_FRAC = 0.11;
export const MC_FRAME_MIN_DOMINANT_OCCUPANCY = 0.55;
export const MC_FRAME_ZOOM_MIN = 0.55;
export const MC_FRAME_ZOOM_MAX = 2.4;

export type FreeformCanvasFrameMetrics = {
  /** Full FreeformCanvas client width */
  canvasW: number;
  /** Full FreeformCanvas client height (may extend under floating shell) */
  canvasH: number;
  /** Width used for fit-zoom (usually canvasW) */
  fitW: number;
  /** Height used for fit-zoom (canvas minus top shell overlay) */
  fitH: number;
  /** Canvas-local X where the target center should land */
  centerX: number;
  /** Canvas-local Y where the target center should land */
  centerY: number;
  shellTopInset: number;
};

/** Live FreeformCanvas viewport client size, or null if not mounted / zero. */
export function readFreeformCanvasViewportSize(): { w: number; h: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('[data-fw-canvas-viewport]') as HTMLElement | null;
  if (!el) return null;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
}

/**
 * Framing metrics for the *visible* Free Space canvas.
 * Floating workspace chrome overlays the top of the absolute-fill canvas
 * (parent uses paddingTop: WORKSPACE_SHELL_TOP_INSET while the canvas
 * still paints under it). Fit/center against the unobstructed region.
 */
export function readVisibleFreeformCanvasFrameMetrics(): FreeformCanvasFrameMetrics | null {
  const size = readFreeformCanvasViewportSize();
  if (!size) return null;
  const shellTopInset = Math.min(FREEFORM_FRAME_TOP_CHROME_INSET, Math.max(0, size.h - 80));
  const fitW = size.w;
  const fitH = Math.max(80, size.h - shellTopInset);
  return {
    canvasW: size.w,
    canvasH: size.h,
    fitW,
    fitH,
    centerX: size.w / 2,
    centerY: shellTopInset + fitH / 2,
    shellTopInset,
  };
}

/** Build frame metrics from explicit canvas size (tests / no DOM). */
export function freeformCanvasFrameMetricsFromSize(
  canvasW: number,
  canvasH: number,
  shellTopInset = FREEFORM_FRAME_TOP_CHROME_INSET,
): FreeformCanvasFrameMetrics {
  const inset = Math.min(shellTopInset, Math.max(0, canvasH - 80));
  const fitH = Math.max(80, canvasH - inset);
  return {
    canvasW,
    canvasH,
    fitW: canvasW,
    fitH,
    centerX: canvasW / 2,
    centerY: inset + fitH / 2,
    shellTopInset: inset,
  };
}

/** Pan/zoom so block center sits in viewport (world coords → canvas-local pan). */
export function panViewportToBlock(
  pos: BlockPos,
  viewportW: number,
  viewportH: number,
  zoom = 1,
): { zoom: number; panX: number; panY: number } {
  const z = Math.min(1.15, Math.max(0.82, zoom));
  const cx = pos.x + pos.w / 2;
  const cy = pos.y + pos.h / 2;
  return {
    zoom: z,
    panX: viewportW / 2 - cx * z,
    panY: viewportH / 2 - cy * z,
  };
}

/**
 * Generic fit-frame (study/continue). Fixed world pad + modest zoom clamp.
 * Not used for Mission Control Open isolation.
 */
export function frameViewportToBlockWithMetrics(
  pos: BlockPos,
  metrics: FreeformCanvasFrameMetrics,
): { zoom: number; panX: number; panY: number } {
  const pad = 96;
  const bw = Math.max(1, pos.w);
  const bh = Math.max(1, pos.h);
  const zFit = Math.min(metrics.fitW / (bw + pad), metrics.fitH / (bh + pad));
  const z = Math.min(1.15, Math.max(0.55, zFit));
  const cx = pos.x + pos.w / 2;
  const cy = pos.y + pos.h / 2;
  return {
    zoom: z,
    panX: metrics.centerX - cx * z,
    panY: metrics.centerY - cy * z,
  };
}

/**
 * Mission Control Open: frame the requested target so it is the clear visual focus.
 * Percentage safe-margin of the usable canvas (shell-aware) + isolation floor.
 * Does not read or write neighboring object geometry.
 */
export function frameMissionControlTarget(
  pos: BlockPos,
  metrics: FreeformCanvasFrameMetrics,
): { zoom: number; panX: number; panY: number } {
  const bw = Math.max(1, pos.w);
  const bh = Math.max(1, pos.h);
  const usableW = metrics.fitW * (1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC);
  const usableH = metrics.fitH * (1 - 2 * MC_FRAME_SAFE_MARGIN_FRAC);
  let z = Math.min(usableW / bw, usableH / bh);

  const coverW = (bw * z) / metrics.fitW;
  const coverH = (bh * z) / metrics.fitH;
  const dominant = Math.max(coverW, coverH);
  if (dominant > 0 && dominant < MC_FRAME_MIN_DOMINANT_OCCUPANCY) {
    z *= MC_FRAME_MIN_DOMINANT_OCCUPANCY / dominant;
  }

  z = Math.min(MC_FRAME_ZOOM_MAX, Math.max(MC_FRAME_ZOOM_MIN, z));

  // Re-check fit after isolation bump — never overflow usable canvas.
  const maxFit = Math.min(usableW / bw, usableH / bh);
  if (z > maxFit) z = Math.max(MC_FRAME_ZOOM_MIN, maxFit);

  const cx = pos.x + pos.w / 2;
  const cy = pos.y + pos.h / 2;
  return {
    zoom: z,
    panX: metrics.centerX - cx * z,
    panY: metrics.centerY - cy * z,
  };
}

/** Screen occupancy of a block under a viewport (for tests / contract checks). */
export function missionControlTargetOccupancy(
  pos: BlockPos,
  metrics: FreeformCanvasFrameMetrics,
  view: { zoom: number },
): { coverW: number; coverH: number; dominant: number; marginFracW: number; marginFracH: number } {
  const bw = Math.max(1, pos.w);
  const bh = Math.max(1, pos.h);
  const coverW = (bw * view.zoom) / metrics.fitW;
  const coverH = (bh * view.zoom) / metrics.fitH;
  return {
    coverW,
    coverH,
    dominant: Math.max(coverW, coverH),
    marginFracW: Math.max(0, (1 - coverW) / 2),
    marginFracH: Math.max(0, (1 - coverH) / 2),
  };
}

/**
 * Frame a block so it fills the viewport (with padding).
 * Prefer frameViewportToBlockWithMetrics(readVisibleFreeformCanvasFrameMetrics()).
 */
export function frameViewportToBlock(
  pos: BlockPos,
  viewportW: number,
  viewportH: number,
): { zoom: number; panX: number; panY: number } {
  return frameViewportToBlockWithMetrics(
    pos,
    freeformCanvasFrameMetricsFromSize(viewportW, viewportH, 0),
  );
}

/** Viewport-local position of a world point under a pan/zoom. */
export function worldPointToViewportLocal(
  worldX: number,
  worldY: number,
  view: { zoom: number; panX: number; panY: number },
): { x: number; y: number } {
  return {
    x: view.panX + worldX * view.zoom,
    y: view.panY + worldY * view.zoom,
  };
}
