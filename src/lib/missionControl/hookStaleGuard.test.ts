import { describe, expect, it } from 'vitest';
import { shouldApplyMissionControlLoadResult } from '../../hooks/useMissionControlIndex';
import { loadSectionFreeSpaceIndexSource } from './loadSectionFreeSpaceIndexSource';

describe('useMissionControlIndex stale-result guard', () => {
  it('rejects stale async generations after section switch', () => {
    const genA = 1;
    const genB = 2;
    expect(shouldApplyMissionControlLoadResult(genA, genB)).toBe(false);
    expect(shouldApplyMissionControlLoadResult(genB, genB)).toBe(true);
  });
});

describe('loadSectionFreeSpaceIndexSource completeness', () => {
  it('cloud failure / null override → local-only never complete', async () => {
    const result = await loadSectionFreeSpaceIndexSource({
      sectionId: 'section-1',
      userId: null,
      skipPending: true,
      cloudRowsOverride: null,
      boardRowsOverride: [],
    });
    expect(result.completeness).toBe('local-only');
    expect(result.completeness).not.toBe('complete');
  });

  it('offline → local-only', async () => {
    const result = await loadSectionFreeSpaceIndexSource({
      sectionId: 'section-1',
      offline: true,
      skipPending: true,
    });
    expect(result.completeness).toBe('local-only');
  });

  it('successful cloud override → complete', async () => {
    const result = await loadSectionFreeSpaceIndexSource({
      sectionId: 'section-1',
      userId: null,
      skipPending: true,
      cloudRowsOverride: [],
      boardRowsOverride: [],
    });
    expect(result.completeness).toBe('complete');
  });
});
