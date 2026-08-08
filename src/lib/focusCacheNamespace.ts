/**
 * Cache namespace contract for future offline / sync / queue infrastructure.
 * Pure scoping only — no IndexedDB, storage, React, or Supabase.
 *
 * Invariant: authenticated Focus user content must not enter local sync/cache
 * infrastructure without an explicit validated { userId, workspaceId }.
 */

export type CacheNamespace = {
  userId: string;
  workspaceId: string;
};

export type CacheNamespaceFailureReason =
  | 'auth_missing'
  | 'workspace_missing'
  | 'invalid_user_id'
  | 'invalid_workspace_id';

export type CacheNamespaceResult =
  | { ok: true; namespace: CacheNamespace }
  | { ok: false; reason: CacheNamespaceFailureReason };

/**
 * True only for non-empty strings with no leading/trailing whitespace.
 * Padded ids are rejected — we never silently trim into a valid id.
 */
function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function userIdFailure(userId: unknown): CacheNamespaceFailureReason | null {
  if (userId == null) return 'auth_missing';
  if (!isExactNonEmptyId(userId)) return 'invalid_user_id';
  return null;
}

function workspaceIdFailure(workspaceId: unknown): CacheNamespaceFailureReason | null {
  if (workspaceId == null) return 'workspace_missing';
  if (!isExactNonEmptyId(workspaceId)) return 'invalid_workspace_id';
  return null;
}

/**
 * Build a CacheNamespace from explicit auth + workspace identifiers.
 * Pure: no route/session lookup, no defaults, no anonymous fallback.
 */
export function resolveCacheNamespace(
  userId: unknown,
  workspaceId: unknown,
): CacheNamespaceResult {
  const userFail = userIdFailure(userId);
  if (userFail) return { ok: false, reason: userFail };

  const workspaceFail = workspaceIdFailure(workspaceId);
  if (workspaceFail) return { ok: false, reason: workspaceFail };

  return {
    ok: true,
    namespace: {
      userId: userId as string,
      workspaceId: workspaceId as string,
    },
  };
}

/**
 * Re-validate a value already shaped like a namespace (e.g. deserialized
 * trust-boundary input). Shares the same id rules as resolveCacheNamespace.
 */
export function assertCacheNamespace(value: unknown): CacheNamespaceResult {
  if (value == null) return { ok: false, reason: 'auth_missing' };
  if (typeof value !== 'object') return { ok: false, reason: 'invalid_user_id' };
  const record = value as Record<string, unknown>;
  return resolveCacheNamespace(record.userId, record.workspaceId);
}
