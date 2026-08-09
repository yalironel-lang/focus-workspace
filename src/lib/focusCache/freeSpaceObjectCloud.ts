/**
 * Cloud repository for Free Space object CREATE upserts.
 * Does not touch the local queue or local Free Space SOT.
 */

import type { Json } from '../database.types';
import { supabase } from '../supabase';

export type FreeSpaceObjectCloudFailureReason =
  | 'invalid_payload'
  | 'cloud_write_failed';

export type FreeSpaceObjectCloudResult =
  | { ok: true }
  | { ok: false; reason: FreeSpaceObjectCloudFailureReason; message?: string };

export type UpsertFreeSpaceObjectCreateInput = {
  userId: string;
  sectionId: string;
  boardId: string;
  /** Local object id (= cloud row id / queue entityId). */
  objectId: string;
  /** JSON-safe ProjectSpaceObject body from the queue payload. */
  object: Json;
};

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

/**
 * Idempotent upsert by text primary key `id` (= entityId).
 */
export async function upsertFreeSpaceObjectFromCreatePayload(
  input: UpsertFreeSpaceObjectCreateInput,
): Promise<FreeSpaceObjectCloudResult> {
  if (
    !isExactNonEmptyId(input.userId) ||
    !isExactNonEmptyId(input.sectionId) ||
    !isExactNonEmptyId(input.objectId)
  ) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (typeof input.boardId !== 'string') {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (input.object === null || typeof input.object !== 'object' || Array.isArray(input.object)) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { error } = await supabase.from('free_space_objects').upsert(
    {
      id: input.objectId,
      user_id: input.userId,
      section_id: input.sectionId,
      board_id: input.boardId,
      object: input.object,
    },
    { onConflict: 'id' },
  );

  if (error) {
    return {
      ok: false,
      reason: 'cloud_write_failed',
      message: error.message,
    };
  }

  return { ok: true };
}
