import { describe, expect, it } from 'vitest';
import { formatMissionControlTime } from './formatMissionControlTime';

describe('formatMissionControlTime', () => {
  const now = 1_700_000_000_000;

  it('prefers lastOpenedAt as Opened', () => {
    expect(
      formatMissionControlTime(
        { lastOpenedAt: now - 60_000, updatedAt: now - 120_000, createdAt: now - 86_400_000 },
        now,
      ),
    ).toBe('Opened 1m ago');
  });

  it('uses Updated when no lastOpenedAt', () => {
    expect(
      formatMissionControlTime(
        { lastOpenedAt: null, updatedAt: now - 60_000, createdAt: now - 86_400_000 },
        now,
      ),
    ).toBe('Updated 1m ago');
  });

  it('uses Created when only createdAt', () => {
    expect(
      formatMissionControlTime(
        { lastOpenedAt: null, updatedAt: null, createdAt: now - 60_000 },
        now,
      ),
    ).toBe('Created 1m ago');
  });

  it('returns null when no timestamps', () => {
    expect(
      formatMissionControlTime({ lastOpenedAt: null, updatedAt: null, createdAt: null }, now),
    ).toBeNull();
  });

  it('never labels updated as Opened', () => {
    const label = formatMissionControlTime(
      { lastOpenedAt: null, updatedAt: now - 3_600_000, createdAt: null },
      now,
    );
    expect(label).toMatch(/^Updated /);
    expect(label).not.toMatch(/Opened/);
  });
});
