/**
 * PR B: local-write coordinator for Free Space object geometry.
 *
 * Ownership: PositionMap stays in useSectionBlockPositions. After a local
 * setPos/initPos, SectionPage stamps object.geometry and the object hook
 * enqueues the existing UPDATE path. No pointermove / cloud apply here.
 */

import type { BlockPos } from '../hooks/useBlockPositions';
import { DEFAULT_BLOCK_H, DEFAULT_BLOCK_W } from '../hooks/useBlockPositions';
import { sanitizeBlockPos } from './freeSpacePersistence';

/** Same default as useSectionBlockPositions.makeDefault. */
export function defaultBlockPos(hint?: Partial<BlockPos>): BlockPos {
  return {
    x: 40,
    y: 40,
    w: DEFAULT_BLOCK_W,
    h: DEFAULT_BLOCK_H,
    ...hint,
  };
}

/**
 * The PositionMap value setPos/initPos will persist: merge then sanitizeBlockPos.
 * Use this committed rect for object.geometry so it matches the positions map.
 */
export function committedPosFromSetPosPatch(
  prev: BlockPos | undefined,
  patch: Partial<BlockPos>,
): BlockPos {
  return sanitizeBlockPos({ ...(prev ?? defaultBlockPos()), ...patch });
}

/** initPos writes sanitizeBlockPos(defaultBlockPos(hint)) when the id is new. */
export function committedPosFromInitPosHint(hint?: Partial<BlockPos>): BlockPos {
  return sanitizeBlockPos(defaultBlockPos(hint));
}
