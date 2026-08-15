/**
 * Optional Free Space object geometry stored inside ProjectSpaceObject
 * (`free_space_objects.object` jsonb).
 *
 * PR A is model support only: valid geometry is preserved; invalid geometry is
 * omitted entirely. This module must not import canvas/position hooks (avoids
 * UI ↔ cache cycles). Visual SOT remains PositionMap + liveBlockGeomRef.
 *
 * geometry.updatedAt follows the current client-ms timestamp convention used by
 * object.updatedAt for V1. Not a server timestamp, Lamport clock, or revision.
 */

export type FreeSpaceObjectGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
  updatedAt: number;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Strict all-or-nothing sanitizer.
 *
 * Accepts only a plain object whose x/y/w/h/updatedAt are finite numbers.
 * w/h = 0 is valid (BlockPos auto/default height/width). Negative w/h, non-numbers,
 * missing fields, NaN, Infinity, and non-positive updatedAt omit the whole value.
 * Unknown extra keys are dropped. Never invents default geometry.
 */
export function normalizeFreeSpaceObjectGeometry(
  raw: unknown,
): FreeSpaceObjectGeometry | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const x = o.x;
  const y = o.y;
  const w = o.w;
  const h = o.h;
  const updatedAt = o.updatedAt;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(w) ||
    !isFiniteNumber(h) ||
    !isFiniteNumber(updatedAt)
  ) {
    return undefined;
  }
  if (w < 0 || h < 0) return undefined;
  if (updatedAt <= 0) return undefined;
  return { x, y, w, h, updatedAt };
}
