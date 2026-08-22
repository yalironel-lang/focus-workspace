/**
 * Cloud repository for Free Space object CREATE upserts, DELETE, and PR7 section SELECT.
 * Does not touch the local queue or local Free Space SOT (except callers of pull apply).
 */

import type { Json } from '../database.types';
import { supabase } from '../supabase';

export type FreeSpaceObjectCloudFailureReason =
  | 'invalid_payload'
  | 'cloud_write_failed'
  | 'cloud_read_failed';

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

/** Row shape returned by section SELECT (PR7). */
export type FreeSpaceObjectCloudRow = {
  id: string;
  user_id: string;
  section_id: string;
  board_id: string;
  object: Json;
  created_at: string;
  updated_at: string;
};

export type FetchFreeSpaceObjectsForSectionResult =
  | { ok: true; rows: FreeSpaceObjectCloudRow[] }
  | { ok: false; reason: FreeSpaceObjectCloudFailureReason; message?: string };

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

export type DeleteFreeSpaceObjectInput = {
  userId: string;
  sectionId: string;
  /** Local object id (= cloud row id / queue entityId). */
  objectId: string;
};

/**
 * Scoped existence probe after DELETE when PostgREST reports zero rows removed.
 * Exported for tests.
 */
export async function freeSpaceObjectExistsInCloud(
  input: DeleteFreeSpaceObjectInput,
): Promise<
  | { ok: true; exists: boolean }
  | { ok: false; reason: 'cloud_read_failed'; message?: string }
> {
  const { data, error } = await supabase
    .from('free_space_objects')
    .select('id')
    .eq('id', input.objectId)
    .eq('user_id', input.userId)
    .eq('section_id', input.sectionId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: 'cloud_read_failed',
      message: error.message,
    };
  }

  return { ok: true, exists: data != null };
}

/**
 * DELETE by primary key `id`, scoped to user + section.
 * Idempotent when the row is confirmed absent. Zero-row DELETE without verified
 * absence is failure (retry) — avoids Saved while an orphan row remains.
 */
export async function deleteFreeSpaceObjectFromCloud(
  input: DeleteFreeSpaceObjectInput,
): Promise<FreeSpaceObjectCloudResult> {
  if (
    !isExactNonEmptyId(input.userId) ||
    !isExactNonEmptyId(input.sectionId) ||
    !isExactNonEmptyId(input.objectId)
  ) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { error, count } = await supabase
    .from('free_space_objects')
    .delete({ count: 'exact' })
    .eq('id', input.objectId)
    .eq('user_id', input.userId)
    .eq('section_id', input.sectionId);

  if (error) {
    return {
      ok: false,
      reason: 'cloud_write_failed',
      message: error.message,
    };
  }

  if (count == null || count === 0) {
    const verified = await freeSpaceObjectExistsInCloud(input);
    if (!verified.ok) {
      return {
        ok: false,
        reason: 'cloud_write_failed',
        message: verified.message ?? verified.reason,
      };
    }
    if (verified.exists) {
      return {
        ok: false,
        reason: 'cloud_write_failed',
        message: 'delete_matched_zero_rows',
      };
    }
  }

  return { ok: true };
}

/**
 * PR7: SELECT all free_space_objects rows for a section.
 * Does not write local state. Caller filters to mounted board and applies guards.
 */
export async function fetchFreeSpaceObjectsForSection(
  sectionId: string,
): Promise<FetchFreeSpaceObjectsForSectionResult> {
  if (!isExactNonEmptyId(sectionId)) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { data, error } = await supabase
    .from('free_space_objects')
    .select('id, user_id, section_id, board_id, object, created_at, updated_at')
    .eq('section_id', sectionId);

  if (error) {
    return {
      ok: false,
      reason: 'cloud_read_failed',
      message: error.message,
    };
  }

  const rows: FreeSpaceObjectCloudRow[] = [];
  if (Array.isArray(data)) {
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (!isExactNonEmptyId(r.id)) continue;
      if (typeof r.section_id !== 'string') continue;
      if (typeof r.board_id !== 'string') continue;
      rows.push({
        id: r.id,
        user_id: typeof r.user_id === 'string' ? r.user_id : '',
        section_id: r.section_id,
        board_id: r.board_id,
        object: (r.object ?? null) as Json,
        created_at: typeof r.created_at === 'string' ? r.created_at : '',
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
      });
    }
  }

  return { ok: true, rows };
}

/**
 * Normalize an unknown realtime/SELECT row into FreeSpaceObjectCloudRow.
 * Returns null when required fields are missing/malformed.
 */
export function normalizeFreeSpaceObjectCloudRow(
  raw: unknown,
): FreeSpaceObjectCloudRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isExactNonEmptyId(r.id)) return null;
  if (typeof r.section_id !== 'string' || !r.section_id.trim()) return null;
  if (typeof r.board_id !== 'string') return null;
  return {
    id: r.id,
    user_id: typeof r.user_id === 'string' ? r.user_id : '',
    section_id: r.section_id,
    board_id: r.board_id,
    object: (r.object ?? null) as Json,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
  };
}
