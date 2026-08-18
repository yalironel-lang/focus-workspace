/**
 * PR C: remote PositionMap apply without going through setPos
 * (setPos is the local-user path that stamps geometry and enqueues UPDATE).
 */

import type { BlockPos } from '../hooks/useBlockPositions';

export type FreeSpaceRemotePositionApply = (
  patches: Record<string, BlockPos>,
) => void;

let applicator: FreeSpaceRemotePositionApply | null = null;

export function registerFreeSpaceRemotePositionApply(
  next: FreeSpaceRemotePositionApply | null,
): void {
  applicator = next;
}

export function hasFreeSpaceRemotePositionApplicator(): boolean {
  return applicator != null;
}

export function applyFreeSpaceRemotePositions(
  patches: Record<string, BlockPos> | null | undefined,
): void {
  const keys = patches && typeof patches === 'object' ? Object.keys(patches) : [];
  if (!patches) return;
  if (keys.length === 0) return;
  applicator?.(patches);
}
