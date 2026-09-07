import { describe, expect, it } from 'vitest';
import {
  PHONE_FORM_FACTOR_MAX_SHORT_EDGE_PX,
  isPhonePresentationProfile,
  resolveWorkspacePresentationProfile,
} from './workspacePresentationProfile';

describe('resolveWorkspacePresentationProfile', () => {
  it('classifies narrow + coarse as phone', () => {
    expect(
      resolveWorkspacePresentationProfile({
        viewportWidth: 390,
        viewportHeight: 844,
        coarsePointer: true,
        nativePlatform: false,
      }),
    ).toBe('phone');
  });

  it('classifies landscape phone (short edge narrow) + coarse as phone', () => {
    expect(
      resolveWorkspacePresentationProfile({
        viewportWidth: 844,
        viewportHeight: 390,
        coarsePointer: true,
        nativePlatform: true,
      }),
    ).toBe('phone');
  });

  it('classifies narrow + native (even if fine pointer) as phone', () => {
    expect(
      resolveWorkspacePresentationProfile({
        viewportWidth: 390,
        viewportHeight: 844,
        coarsePointer: false,
        nativePlatform: true,
      }),
    ).toBe('phone');
  });

  it('does not classify iPad-sized touch/native as phone', () => {
    expect(
      resolveWorkspacePresentationProfile({
        viewportWidth: 1024,
        viewportHeight: 768,
        coarsePointer: true,
        nativePlatform: true,
      }),
    ).toBe('tablet');
  });

  it('classifies iPad portrait short edge above threshold as tablet', () => {
    expect(PHONE_FORM_FACTOR_MAX_SHORT_EDGE_PX).toBe(600);
    expect(
      resolveWorkspacePresentationProfile({
        viewportWidth: 820,
        viewportHeight: 1180,
        coarsePointer: true,
        nativePlatform: true,
      }),
    ).toBe('tablet');
  });

  it('classifies wide + fine pointer as desktop', () => {
    expect(
      resolveWorkspacePresentationProfile({
        viewportWidth: 1280,
        viewportHeight: 800,
        coarsePointer: false,
        nativePlatform: false,
      }),
    ).toBe('desktop');
  });

  it('classifies narrow + fine pointer (desktop browser resized) as desktop', () => {
    expect(
      resolveWorkspacePresentationProfile({
        viewportWidth: 390,
        viewportHeight: 800,
        coarsePointer: false,
        nativePlatform: false,
      }),
    ).toBe('desktop');
  });
});

describe('isPhonePresentationProfile', () => {
  it('is true only for phone', () => {
    expect(isPhonePresentationProfile('phone')).toBe(true);
    expect(isPhonePresentationProfile('tablet')).toBe(false);
    expect(isPhonePresentationProfile('desktop')).toBe(false);
  });
});
