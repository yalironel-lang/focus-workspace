import { describe, expect, it } from 'vitest';
import {
  PHONE_LAZY_FREE_SPACE,
  shouldMountFreeSpaceCanvas,
} from './phoneLazyFreeSpace';

describe('shouldMountFreeSpaceCanvas', () => {
  it('phone + Mission Control → canvas absent when lazy on', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'work-surface',
        lazyEnabled: true,
      }),
    ).toBe(false);
  });

  it('phone + free-space → canvas present', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'free-space',
        lazyEnabled: true,
      }),
    ).toBe(true);
  });

  it('phone + math-zone → canvas absent (lazy)', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'math-zone',
        lazyEnabled: true,
      }),
    ).toBe(false);
  });

  it('desktop MC keeps canvas mounted (keep-alive)', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'desktop',
        sectionViewMode: 'work-surface',
        lazyEnabled: true,
      }),
    ).toBe(true);
  });

  it('tablet MC keeps canvas mounted', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'tablet',
        sectionViewMode: 'work-surface',
        lazyEnabled: true,
      }),
    ).toBe(true);
  });

  it('phone MC remounts canvas when lazy disabled (rollback)', () => {
    expect(
      shouldMountFreeSpaceCanvas({
        profile: 'phone',
        sectionViewMode: 'work-surface',
        lazyEnabled: false,
      }),
    ).toBe(true);
  });

  it('default constant is enabled', () => {
    expect(PHONE_LAZY_FREE_SPACE).toBe(true);
  });
});
