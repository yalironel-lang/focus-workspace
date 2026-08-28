import { describe, expect, it } from 'vitest';
import {
  buildUserContentPath,
  isUserContentAssetType,
  USER_CONTENT_BUCKET,
} from './userContentStorage';

describe('buildUserContentPath', () => {
  const base = {
    userId: 'user-abc',
    sectionId: 'section-1',
    objectId: 'obj-1',
    assetType: 'handwriting' as const,
    assetId: 'block-hw-1',
  };

  it('builds deterministic path', () => {
    expect(buildUserContentPath(base)).toBe(
      'user-abc/section-1/obj-1/handwriting/block-hw-1',
    );
    expect(buildUserContentPath(base)).toBe(buildUserContentPath({ ...base }));
  });

  it('supports all PR-A asset types', () => {
    for (const assetType of [
      'handwriting',
      'notebook-image',
      'pdf',
      'spatial-image',
    ] as const) {
      expect(isUserContentAssetType(assetType)).toBe(true);
      expect(buildUserContentPath({ ...base, assetType })).toContain(`/${assetType}/`);
    }
  });

  it('rejects empty / unsafe segments', () => {
    expect(() => buildUserContentPath({ ...base, userId: '' })).toThrow('invalid_user_id');
    expect(() => buildUserContentPath({ ...base, userId: ' a' })).toThrow('invalid_user_id');
    expect(() => buildUserContentPath({ ...base, sectionId: '..' })).toThrow(
      'invalid_section_id',
    );
    expect(() => buildUserContentPath({ ...base, objectId: 'a/b' })).toThrow(
      'invalid_object_id',
    );
    expect(() => buildUserContentPath({ ...base, assetId: 'x\\y' })).toThrow(
      'invalid_asset_id',
    );
    expect(() =>
      buildUserContentPath({
        ...base,
        assetType: 'handwriting/../evil' as 'handwriting',
      }),
    ).toThrow('invalid_asset_type');
  });

  it('exports private bucket name', () => {
    expect(USER_CONTENT_BUCKET).toBe('user-content');
  });
});
