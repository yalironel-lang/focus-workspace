/**
 * Canonical paths + Storage API for private `user-content` bucket.
 *
 * Path: {userId}/{sectionId}/{objectId}/{assetType}/{assetId}
 *
 * Infrastructure only — no feature (handwriting/PDF/…) wiring in PR A.
 */

import { isSupabaseConfigured, supabase } from './supabase';

export const USER_CONTENT_BUCKET = 'user-content' as const;

export const USER_CONTENT_ASSET_TYPES = [
  'handwriting',
  'notebook-image',
  'pdf',
  'spatial-image',
] as const;

export type UserContentAssetType = (typeof USER_CONTENT_ASSET_TYPES)[number];

export type BuildUserContentPathInput = {
  userId: string;
  sectionId: string;
  objectId: string;
  assetType: UserContentAssetType;
  assetId: string;
};

const PATH_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function isSafePathSegment(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  if (value !== value.trim()) return false;
  if (value === '.' || value === '..') return false;
  if (value.includes('/') || value.includes('\\')) return false;
  return PATH_SEGMENT_RE.test(value);
}

export function isUserContentAssetType(value: unknown): value is UserContentAssetType {
  return (
    typeof value === 'string' &&
    (USER_CONTENT_ASSET_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Deterministic Storage object path. Throws on invalid/unsafe components.
 */
export function buildUserContentPath(input: BuildUserContentPathInput): string {
  const { userId, sectionId, objectId, assetType, assetId } = input;
  if (!isSafePathSegment(userId)) throw new Error('invalid_user_id');
  if (!isSafePathSegment(sectionId)) throw new Error('invalid_section_id');
  if (!isSafePathSegment(objectId)) throw new Error('invalid_object_id');
  if (!isUserContentAssetType(assetType)) throw new Error('invalid_asset_type');
  if (!isSafePathSegment(assetId)) throw new Error('invalid_asset_id');

  return `${userId}/${sectionId}/${objectId}/${assetType}/${assetId}`;
}

export type UserContentStorageErrorReason =
  | 'not_configured'
  | 'invalid_path'
  | 'upload_failed'
  | 'download_failed'
  | 'remove_failed'
  | 'not_found';

export type UserContentStorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: UserContentStorageErrorReason; message?: string };

function fail<T>(
  reason: UserContentStorageErrorReason,
  message?: string,
): UserContentStorageResult<T> {
  return message !== undefined ? { ok: false, reason, message } : { ok: false, reason };
}

function assertPath(path: string): UserContentStorageResult<string> {
  if (typeof path !== 'string' || path.length === 0 || path !== path.trim()) {
    return fail('invalid_path');
  }
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    return fail('invalid_path');
  }
  const parts = path.split('/');
  if (parts.length !== 5) return fail('invalid_path');
  if (!parts.every(isSafePathSegment)) return fail('invalid_path');
  if (!isUserContentAssetType(parts[3])) return fail('invalid_path');
  return { ok: true, value: path };
}

export type UploadUserContentAssetInput = {
  storagePath: string;
  body: Blob;
  contentType?: string;
  /** Default true — overwrite same path. */
  upsert?: boolean;
};

export async function uploadUserContentAsset(
  input: UploadUserContentAssetInput,
): Promise<UserContentStorageResult<{ path: string }>> {
  if (!isSupabaseConfigured) return fail('not_configured');
  const pathCheck = assertPath(input.storagePath);
  if (!pathCheck.ok) return pathCheck;
  if (!(input.body instanceof Blob)) {
    return fail('upload_failed', 'body must be a Blob');
  }

  const { error } = await supabase.storage.from(USER_CONTENT_BUCKET).upload(pathCheck.value, input.body, {
    contentType: input.contentType ?? input.body.type ?? 'application/octet-stream',
    upsert: input.upsert !== false,
  });

  if (error) return fail('upload_failed', error.message);
  return { ok: true, value: { path: pathCheck.value } };
}

export async function downloadUserContentAsset(
  storagePath: string,
): Promise<UserContentStorageResult<Blob>> {
  if (!isSupabaseConfigured) return fail('not_configured');
  const pathCheck = assertPath(storagePath);
  if (!pathCheck.ok) return pathCheck;

  const { data, error } = await supabase.storage
    .from(USER_CONTENT_BUCKET)
    .download(pathCheck.value);

  if (error) {
    const msg = error.message ?? '';
    if (/not found|404/i.test(msg)) return fail('not_found', msg);
    return fail('download_failed', msg);
  }
  if (!data) return fail('not_found');
  return { ok: true, value: data };
}

/**
 * Remove object. Treats missing objects as success (idempotent).
 */
export async function removeUserContentAsset(
  storagePath: string,
): Promise<UserContentStorageResult<{ removed: boolean }>> {
  if (!isSupabaseConfigured) return fail('not_configured');
  const pathCheck = assertPath(storagePath);
  if (!pathCheck.ok) return pathCheck;

  const { error } = await supabase.storage.from(USER_CONTENT_BUCKET).remove([pathCheck.value]);
  if (error) {
    const msg = error.message ?? '';
    if (/not found|404/i.test(msg)) return { ok: true, value: { removed: false } };
    return fail('remove_failed', msg);
  }
  return { ok: true, value: { removed: true } };
}
