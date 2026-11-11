import { describe, expect, it } from 'vitest';
import { assessNativePageFallbackEligibility } from './nativePageFallbackAssessment';

describe('assessNativePageFallbackEligibility', () => {
  it('is ineligible when region extract already succeeded', () => {
    expect(
      assessNativePageFallbackEligibility({
        regionTextUseful: true,
        pageKind: 'useful',
        pageText: 'Plenty of page text about the Mean Value Theorem.',
      }),
    ).toEqual({ eligible: false });
  });

  it('is eligible when region failed and page native text is useful', () => {
    const pageText = 'Find f(c) using the Mean Value Theorem on this page.';
    expect(
      assessNativePageFallbackEligibility({
        regionTextUseful: false,
        pageKind: 'useful',
        pageText,
      }),
    ).toEqual({ eligible: true, pageText });
  });

  it('does not offer native fallback on empty or sparse pages', () => {
    expect(
      assessNativePageFallbackEligibility({
        regionTextUseful: false,
        pageKind: 'empty',
        pageText: undefined,
      }).eligible,
    ).toBe(false);
    expect(
      assessNativePageFallbackEligibility({
        regionTextUseful: false,
        pageKind: 'sparse',
        pageText: '.',
      }).eligible,
    ).toBe(false);
  });

  it('rejects useful kind with unusable pageText payload', () => {
    expect(
      assessNativePageFallbackEligibility({
        regionTextUseful: false,
        pageKind: 'useful',
        pageText: ' ',
      }).eligible,
    ).toBe(false);
  });
});
