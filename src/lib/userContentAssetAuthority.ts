/**
 * Manifest authority + deletion tombstones for user-content assets.
 *
 * Invariant: an asset must be referenced by its owning object manifest AND
 * must not carry a deletion tombstone before upload/migration is allowed.
 *
 * Pending delete in pending_operations also blocks upload (see enqueue).
 */

import { userContentAssetEntityId } from './userContentAssetDescriptor';
import type { UserContentAssetType } from './userContentStorage';

const TOMBSTONE_KEY = 'fw_user_content_asset_deleted_v1';

type TombstoneStore = Record<string, number>;

function loadStore(): TombstoneStore {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TombstoneStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: TombstoneStore): void {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function userContentAssetEntityKey(input: {
  sectionId: string;
  objectId: string;
  assetType: UserContentAssetType;
  assetId: string;
}): string {
  return userContentAssetEntityId(input);
}

export function markUserContentAssetDeleted(entityKey: string): void {
  const store = loadStore();
  store[entityKey] = Date.now();
  saveStore(store);
}

export function clearUserContentAssetDeleted(entityKey: string): void {
  const store = loadStore();
  if (!(entityKey in store)) return;
  delete store[entityKey];
  saveStore(store);
}

export function isUserContentAssetDeleted(entityKey: string): boolean {
  return entityKey in loadStore();
}

export function resetUserContentAssetAuthorityForTests(): void {
  try {
    localStorage.removeItem(TOMBSTONE_KEY);
  } catch {
    /* ignore */
  }
}

/** Upload allowed only when referenced AND not tombstoned. */
export function canUploadUserContentAsset(input: {
  sectionId: string;
  objectId: string;
  assetType: UserContentAssetType;
  assetId: string;
  referenced: boolean;
}): boolean {
  if (!input.referenced) return false;
  const key = userContentAssetEntityKey(input);
  return !isUserContentAssetDeleted(key);
}
