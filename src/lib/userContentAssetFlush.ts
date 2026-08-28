/**
 * Process one user_content_asset pending op: resolve local bytes → Storage.
 * Invoked from flushPendingFreeSpaceCreates dispatcher (shared drain).
 */

import type { CacheNamespace } from './focusCacheNamespace';
import { fwPersistWarn } from './freeSpacePersistence';
import type { PendingOperation } from './focusCache/types';
import {
  USER_CONTENT_ASSET_ENTITY_TYPE,
  parseUserContentAssetDescriptor,
} from './userContentAssetDescriptor';
import { resolveLocalUserContentAsset } from './userContentAssetResolver';
import {
  removeUserContentAsset,
  uploadUserContentAsset,
} from './userContentStorage';

export type ProcessUserContentAssetResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'malformed'
        | 'unsupported'
        | 'resolver_miss'
        | 'upload_failed'
        | 'remove_failed'
        | 'not_configured';
      message?: string;
    };

export function isUserContentAssetWrite(op: PendingOperation): boolean {
  return (
    op.entityType === USER_CONTENT_ASSET_ENTITY_TYPE &&
    (op.operationType === 'create' ||
      op.operationType === 'update' ||
      op.operationType === 'delete')
  );
}

export async function processUserContentAssetOp(
  _namespace: CacheNamespace,
  op: PendingOperation,
): Promise<ProcessUserContentAssetResult> {
  if (!isUserContentAssetWrite(op)) {
    return { ok: false, reason: 'unsupported' };
  }

  const descriptor = parseUserContentAssetDescriptor(op.payload);
  if (!descriptor) {
    fwPersistWarn(`user-content flush malformed payload: opId=${op.id}`);
    return { ok: false, reason: 'malformed' };
  }

  if (descriptor.assetOp === 'delete' || op.operationType === 'delete') {
    const removed = await removeUserContentAsset(descriptor.storagePath);
    if (!removed.ok) {
      fwPersistWarn(
        `user-content flush delete failed: reason=${removed.reason}` +
          (removed.message ? ` message=${removed.message}` : ''),
      );
      return {
        ok: false,
        reason: removed.reason === 'not_configured' ? 'not_configured' : 'remove_failed',
        message: removed.message,
      };
    }
    return { ok: true };
  }

  const blob = await resolveLocalUserContentAsset(descriptor);
  if (!blob) {
    fwPersistWarn(
      `user-content flush resolver miss: store=${descriptor.localRef.store} key=${descriptor.localRef.key}`,
    );
    return { ok: false, reason: 'resolver_miss' };
  }

  const uploaded = await uploadUserContentAsset({
    storagePath: descriptor.storagePath,
    body: blob,
    contentType: descriptor.contentType,
    upsert: true,
  });

  if (!uploaded.ok) {
    fwPersistWarn(
      `user-content flush upload failed: reason=${uploaded.reason}` +
        (uploaded.message ? ` message=${uploaded.message}` : ''),
    );
    return {
      ok: false,
      reason: uploaded.reason === 'not_configured' ? 'not_configured' : 'upload_failed',
      message: uploaded.message,
    };
  }

  return { ok: true };
}
