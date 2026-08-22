/**
 * Cloud repository for Free Space board/space definitions.
 */

import { supabase } from '../supabase';

export type FreeSpaceBoardCloudFailureReason =
  | 'invalid_payload'
  | 'cloud_write_failed'
  | 'cloud_read_failed';

export type FreeSpaceBoardCloudResult =
  | { ok: true }
  | { ok: false; reason: FreeSpaceBoardCloudFailureReason; message?: string };

export type FreeSpaceBoardCloudRow = {
  id: string;
  user_id: string;
  section_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type FetchFreeSpaceBoardsForSectionResult =
  | { ok: true; rows: FreeSpaceBoardCloudRow[] }
  | { ok: false; reason: FreeSpaceBoardCloudFailureReason; message?: string };

export type UpsertFreeSpaceBoardInput = {
  userId: string;
  sectionId: string;
  boardId: string;
  name: string;
};

export type DeleteFreeSpaceBoardInput = {
  userId: string;
  sectionId: string;
  boardId: string;
};

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function normalizeFreeSpaceBoardCloudRow(raw: unknown): FreeSpaceBoardCloudRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isExactNonEmptyId(r.id)) return null;
  if (typeof r.section_id !== 'string' || !r.section_id.trim()) return null;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  return {
    id: r.id,
    user_id: typeof r.user_id === 'string' ? r.user_id : '',
    section_id: r.section_id,
    name: r.name,
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : '',
  };
}

export async function fetchFreeSpaceBoardsForSection(
  sectionId: string,
): Promise<FetchFreeSpaceBoardsForSectionResult> {
  if (!isExactNonEmptyId(sectionId)) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { data, error } = await supabase
    .from('free_space_boards')
    .select('id, user_id, section_id, name, created_at, updated_at')
    .eq('section_id', sectionId);

  if (error) {
    return { ok: false, reason: 'cloud_read_failed', message: error.message };
  }

  const rows: FreeSpaceBoardCloudRow[] = [];
  if (Array.isArray(data)) {
    for (const raw of data) {
      const row = normalizeFreeSpaceBoardCloudRow(raw);
      if (row) rows.push(row);
    }
  }
  return { ok: true, rows };
}

/** Idempotent upsert by (section_id, id). */
export async function upsertFreeSpaceBoardFromPayload(
  input: UpsertFreeSpaceBoardInput,
): Promise<FreeSpaceBoardCloudResult> {
  if (
    !isExactNonEmptyId(input.userId) ||
    !isExactNonEmptyId(input.sectionId) ||
    !isExactNonEmptyId(input.boardId) ||
    typeof input.name !== 'string' ||
    !input.name.trim()
  ) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { error } = await supabase.from('free_space_boards').upsert(
    {
      section_id: input.sectionId,
      id: input.boardId,
      user_id: input.userId,
      name: input.name.trim(),
    },
    { onConflict: 'section_id,id' },
  );

  if (error) {
    return { ok: false, reason: 'cloud_write_failed', message: error.message };
  }
  return { ok: true };
}

/** Delete all objects for a board before removing the board row (no orphan objects). */
export async function deleteFreeSpaceObjectsForBoardFromCloud(
  input: DeleteFreeSpaceBoardInput,
): Promise<FreeSpaceBoardCloudResult> {
  if (
    !isExactNonEmptyId(input.userId) ||
    !isExactNonEmptyId(input.sectionId) ||
    !isExactNonEmptyId(input.boardId) ||
    input.boardId === 'main'
  ) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { error } = await supabase
    .from('free_space_objects')
    .delete()
    .eq('section_id', input.sectionId)
    .eq('board_id', input.boardId)
    .eq('user_id', input.userId);

  if (error) {
    return { ok: false, reason: 'cloud_write_failed', message: error.message };
  }
  return { ok: true };
}

/** Remove board definition. `main` is never deleted in cloud. */
export async function deleteFreeSpaceBoardFromCloud(
  input: DeleteFreeSpaceBoardInput,
): Promise<FreeSpaceBoardCloudResult> {
  if (
    !isExactNonEmptyId(input.userId) ||
    !isExactNonEmptyId(input.sectionId) ||
    !isExactNonEmptyId(input.boardId)
  ) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (input.boardId === 'main') {
    return { ok: false, reason: 'invalid_payload', message: 'main_immutable' };
  }

  const objects = await deleteFreeSpaceObjectsForBoardFromCloud(input);
  if (!objects.ok) return objects;

  const { error } = await supabase
    .from('free_space_boards')
    .delete()
    .eq('section_id', input.sectionId)
    .eq('id', input.boardId)
    .eq('user_id', input.userId);

  if (error) {
    return { ok: false, reason: 'cloud_write_failed', message: error.message };
  }
  return { ok: true };
}
