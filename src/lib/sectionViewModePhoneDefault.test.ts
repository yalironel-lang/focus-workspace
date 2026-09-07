import { describe, expect, it } from 'vitest';
import { resolveSectionViewModeOnOpen } from './mathSurfaceRouter';

describe('resolveSectionViewModeOnOpen preferWorkSurface', () => {
  it('returns work-surface when preferWorkSurface and no forceFreeSpace', () => {
    // No localStorage record → preferWorkSurface wins over free-space default paths
    expect(
      resolveSectionViewModeOnOpen('section-phone-test', { preferWorkSurface: true }),
    ).toBe('work-surface');
  });

  it('forceFreeSpace still wins when explicitly requested', () => {
    expect(
      resolveSectionViewModeOnOpen('section-phone-test', {
        preferWorkSurface: true,
        forceFreeSpace: true,
      }),
    ).toBe('free-space');
  });
});
