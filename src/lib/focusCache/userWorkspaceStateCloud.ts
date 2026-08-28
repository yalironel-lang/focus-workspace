/**
 * Cloud repository for user_workspace_state rows (Desk, Math Zone JSON blobs).
 */

import { supabase } from '../supabase';
import type { Json } from '../database.types';
import type { UserWorkspaceStateScope } from './userWorkspaceStateTypes';

export type WorkspaceStateCloudRow = {
  user_id: string;
  scope: UserWorkspaceStateScope;
  workspace_id: string;
  state: Record<string, unknown>;
  updated_at_ms: number;
};

export type WorkspaceStateCloudResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_payload' | 'cloud_read_failed' | 'cloud_write_failed'; message?: string };

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeWorkspaceStateRow(raw: unknown): WorkspaceStateCloudRow | null {
  if (!isPlainObject(raw)) return null;
  const scope = raw.scope;
  if (scope !== 'desk' && scope !== 'math_zone') return null;
  if (!isExactNonEmptyId(raw.workspace_id)) return null;
  const updatedAtMs = raw.updated_at_ms;
  if (typeof updatedAtMs !== 'number' || !Number.isFinite(updatedAtMs)) return null;
  const state = isPlainObject(raw.state) ? raw.state : {};
  return {
    user_id: typeof raw.user_id === 'string' ? raw.user_id : '',
    scope,
    workspace_id: raw.workspace_id,
    state,
    updated_at_ms: Math.floor(updatedAtMs),
  };
}

export async function fetchWorkspaceState(input: {
  userId: string;
  scope: UserWorkspaceStateScope;
  workspaceId: string;
}): Promise<
  | { ok: true; row: WorkspaceStateCloudRow | null }
  | { ok: false; reason: 'invalid_payload' | 'cloud_read_failed'; message?: string }
> {
  if (!isExactNonEmptyId(input.userId) || !isExactNonEmptyId(input.workspaceId)) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { data, error } = await supabase
    .from('user_workspace_state')
    .select('user_id, scope, workspace_id, state, updated_at_ms')
    .eq('user_id', input.userId)
    .eq('scope', input.scope)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'cloud_read_failed', message: error.message };
  }
  if (!data) return { ok: true, row: null };
  const row = normalizeWorkspaceStateRow(data);
  return { ok: true, row: row ?? null };
}

export async function upsertWorkspaceState(input: {
  userId: string;
  scope: UserWorkspaceStateScope;
  workspaceId: string;
  state: Record<string, unknown>;
  updatedAt: number;
}): Promise<WorkspaceStateCloudResult> {
  if (
    !isExactNonEmptyId(input.userId) ||
    !isExactNonEmptyId(input.workspaceId) ||
    !isPlainObject(input.state) ||
    typeof input.updatedAt !== 'number' ||
    !Number.isFinite(input.updatedAt)
  ) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const { error } = await supabase.from('user_workspace_state').upsert(
    {
      user_id: input.userId,
      scope: input.scope,
      workspace_id: input.workspaceId,
      state: input.state as Json,
      updated_at_ms: Math.floor(input.updatedAt),
    },
    { onConflict: 'user_id,scope,workspace_id' },
  );

  if (error) {
    return { ok: false, reason: 'cloud_write_failed', message: error.message };
  }
  return { ok: true };
}
