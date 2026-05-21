import type { BlockPos } from '../hooks/useBlockPositions';

/** Pan/zoom so block center sits in viewport (world coords). */
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
