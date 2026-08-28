/**
 * Pending-operation descriptors for `user_content_asset` jobs.
 * JSON-only — never Blob/File/ArrayBuffer.
 */

import type { JsonValue } from './focusCache/types';
import {
  buildUserContentPath,
  isUserContentAssetType,
  type UserContentAssetType,
} from './userContentStorage';

export const USER_CONTENT_ASSET_ENTITY_TYPE = 'user_content_asset' as const;

export type UserContentAssetOperation = 'upload' | 'delete';

/**
 * Local locator for the bytes that live outside the queue
 * (IDB key / store name). Feature PRs fill this in; PR A only defines shape.
 */
export type UserContentLocalRef = {
  /** Logical store id, e.g. future `handwriting` / `free_space_pdf`. */
  store: string;
  /** Store-specific key string. */
  key: string;
};

export type UserContentAssetDescriptor = {
  version: 1;
  assetOp: UserContentAssetOperation;
  userId: string;
  sectionId: string;
  objectId: string;
  assetType: UserContentAssetType;
  assetId: string;
  storagePath: string;
  localRef: UserContentLocalRef;
  contentType?: string;
  contentHash?: string;
  updatedAt: number;
  byteLength?: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExactNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function isUserContentAssetOperation(
  value: unknown,
): value is UserContentAssetOperation {
  return value === 'upload' || value === 'delete';
}

export function parseUserContentAssetDescriptor(
  payload: JsonValue | null,
): UserContentAssetDescriptor | null {
  if (!isPlainObject(payload)) return null;
  if (payload.version !== 1) return null;
  if (!isUserContentAssetOperation(payload.assetOp)) return null;
  if (!isExactNonEmptyId(payload.userId)) return null;
  if (!isExactNonEmptyId(payload.sectionId)) return null;
  if (!isExactNonEmptyId(payload.objectId)) return null;
  if (!isUserContentAssetType(payload.assetType)) return null;
  if (!isExactNonEmptyId(payload.assetId)) return null;
  if (!isExactNonEmptyId(payload.storagePath)) return null;
  if (!isPlainObject(payload.localRef)) return null;
  if (!isExactNonEmptyId(payload.localRef.store)) return null;
  if (!isExactNonEmptyId(payload.localRef.key)) return null;
  if (typeof payload.updatedAt !== 'number' || !Number.isFinite(payload.updatedAt)) {
    return null;
  }

  const descriptor: UserContentAssetDescriptor = {
    version: 1,
    assetOp: payload.assetOp,
    userId: payload.userId,
    sectionId: payload.sectionId,
    objectId: payload.objectId,
    assetType: payload.assetType,
    assetId: payload.assetId,
    storagePath: payload.storagePath,
    localRef: {
      store: payload.localRef.store,
      key: payload.localRef.key,
    },
    updatedAt: payload.updatedAt,
  };

  if (typeof payload.contentType === 'string' && payload.contentType.length > 0) {
    descriptor.contentType = payload.contentType;
  }
  if (typeof payload.contentHash === 'string' && payload.contentHash.length > 0) {
    descriptor.contentHash = payload.contentHash;
  }
  if (typeof payload.byteLength === 'number' && Number.isFinite(payload.byteLength)) {
    descriptor.byteLength = payload.byteLength;
  }

  // Path must match canonical builder (rejects escape / mismatch).
  try {
    const expected = buildUserContentPath({
      userId: descriptor.userId,
      sectionId: descriptor.sectionId,
      objectId: descriptor.objectId,
      assetType: descriptor.assetType,
      assetId: descriptor.assetId,
    });
    if (expected !== descriptor.storagePath) return null;
  } catch {
    return null;
  }

  return descriptor;
}

export function userContentAssetDescriptorToJson(
  descriptor: UserContentAssetDescriptor,
): JsonValue {
  const json: { [key: string]: JsonValue } = {
    version: descriptor.version,
    assetOp: descriptor.assetOp,
    userId: descriptor.userId,
    sectionId: descriptor.sectionId,
    objectId: descriptor.objectId,
    assetType: descriptor.assetType,
    assetId: descriptor.assetId,
    storagePath: descriptor.storagePath,
    localRef: {
      store: descriptor.localRef.store,
      key: descriptor.localRef.key,
    },
    updatedAt: descriptor.updatedAt,
  };
  if (descriptor.contentType !== undefined) json.contentType = descriptor.contentType;
  if (descriptor.contentHash !== undefined) json.contentHash = descriptor.contentHash;
  if (descriptor.byteLength !== undefined) json.byteLength = descriptor.byteLength;
  return json;
}

/** Stable queue entityId for coalesce of same asset. */
export function userContentAssetEntityId(input: {
  sectionId: string;
  objectId: string;
  assetType: UserContentAssetType;
  assetId: string;
}): string {
  return `${input.sectionId}/${input.objectId}/${input.assetType}/${input.assetId}`;
}
