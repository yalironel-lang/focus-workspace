import { describe, expect, it } from 'vitest';
import {
  parseUserContentAssetDescriptor,
  userContentAssetDescriptorToJson,
  userContentAssetEntityId,
  USER_CONTENT_ASSET_ENTITY_TYPE,
  type UserContentAssetDescriptor,
} from './userContentAssetDescriptor';
import type { JsonValue } from './focusCache/types';

const valid: UserContentAssetDescriptor = {
  version: 1,
  assetOp: 'upload',
  userId: 'user-1',
  sectionId: 'sec-1',
  objectId: 'obj-1',
  assetType: 'pdf',
  assetId: 'original',
  storagePath: 'user-1/sec-1/obj-1/pdf/original',
  localRef: { store: 'fixture', key: 'k1' },
  updatedAt: 1_700_000_000_000,
  contentType: 'application/pdf',
  byteLength: 12,
};

describe('UserContentAssetDescriptor', () => {
  it('round-trips JSON and stays JSON-serializable', () => {
    const json = userContentAssetDescriptorToJson(valid);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    const parsed = parseUserContentAssetDescriptor(json);
    expect(parsed).toEqual(valid);
  });

  it('rejects path mismatch and bad ops', () => {
    expect(
      parseUserContentAssetDescriptor({
        ...userContentAssetDescriptorToJson(valid),
        storagePath: 'user-1/sec-1/obj-1/pdf/other',
      } as JsonValue),
    ).toBeNull();
    expect(
      parseUserContentAssetDescriptor({
        ...userContentAssetDescriptorToJson(valid),
        assetOp: 'sync',
      } as JsonValue),
    ).toBeNull();
  });

  it('entity id and entity type are stable', () => {
    expect(USER_CONTENT_ASSET_ENTITY_TYPE).toBe('user_content_asset');
    expect(
      userContentAssetEntityId({
        sectionId: 'sec-1',
        objectId: 'obj-1',
        assetType: 'pdf',
        assetId: 'original',
      }),
    ).toBe('sec-1/obj-1/pdf/original');
  });
});
