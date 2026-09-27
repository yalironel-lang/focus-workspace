import { afterEach, describe, expect, it, vi } from 'vitest';
import { differenceCalendarDays, parseCalendarDate } from './calendarDate';

afterEach(() => vi.useRealTimers());

describe('parseCalendarDate', () => {
  it.each([
    ['2026-09-27', 2026, 9, 27],
    ['2026-01-01', 2026, 1, 1],
    ['2026-12-31', 2026, 12, 31],
    ['2024-02-29', 2024, 2, 29],
    ['2000-02-29', 2000, 2, 29],
    ['0001-01-01', 1, 1, 1],
    ['9999-12-31', 9999, 12, 31],
  ])('preserves calendar fields for %s', (value, year, month, day) => {
    expect(parseCalendarDate(value)).toEqual({ year, month, day });
  });

  it.each([
    '26-09-27', '2026/09/27', '2026-9-27', '2026-09-7', '', 'arbitrary text',
    ' 2026-09-27', '2026-09-27 ', '2026-09-27\n', '2026-09-27T00:00:00Z',
    '2026-00-01', '2026-13-01', '2026-02-30', '2026-04-31', '2026-01-00',
    '2026-01-32', '2025-02-29', '1900-02-29', '0000-01-01', '10000-01-01',
  ])('rejects %j without normalization', value => {
    expect(parseCalendarDate(value)).toBeNull();
  });

  it('does not reinterpret a date-only string as UTC', () => {
    // Run this same assertion under positive and negative TZ offsets as well.
    expect(parseCalendarDate('2026-09-27')).toEqual({ year: 2026, month: 9, day: 27 });
  });
});

describe('differenceCalendarDays', () => {
  it.each([
    ['2026-09-27', '2026-09-27', 0],
    ['2026-09-28', '2026-09-27', 1],
    ['2026-09-26', '2026-09-27', -1],
    ['2026-10-07', '2026-09-27', 10],
    ['2026-09-17', '2026-09-27', -10],
    ['2026-10-01', '2026-09-30', 1],
    ['2027-01-01', '2026-12-31', 1],
    ['2024-02-29', '2024-02-28', 1],
    ['2024-03-01', '2024-02-29', 1],
    ['2024-03-01', '2024-02-28', 2],
    ['2025-03-01', '2025-02-28', 1],
    ['1900-03-01', '1900-02-28', 1],
    ['2000-03-01', '2000-02-28', 2],
    ['0401-01-01', '0001-01-01', 146097],
    ['9999-12-31', '0001-01-01', 3652058],
  ])('%s minus %s = %i', (target, reference, expected) => {
    expect(differenceCalendarDays(target, reference)).toBe(expected);
    expect(differenceCalendarDays(reference, target)).toBe(expected === 0 ? 0 : -expected);
  });

  it.each([
    ['2026-03-09', '2026-03-08'], // US spring transition
    ['2026-11-02', '2026-11-01'], // US autumn transition
    ['2026-03-30', '2026-03-29'], // European spring transition
    ['2026-10-26', '2026-10-25'], // European autumn transition
  ])('counts one calendar day across DST: %s minus %s', (target, reference) => {
    expect(differenceCalendarDays(target, reference)).toBe(1);
    expect(differenceCalendarDays(reference, target)).toBe(-1);
  });

  it.each([
    ['invalid', '2026-09-27'],
    ['2026-09-27', 'invalid'],
    ['2026-02-30', '2026-09-27'],
    ['2026-09-27', '2025-02-29'],
    ['', ''],
  ])('returns null if either input is invalid: %j, %j', (target, reference) => {
    expect(differenceCalendarDays(target, reference)).toBeNull();
  });

  it('depends only on the injected reference date, not the current clock', () => {
    vi.useFakeTimers();
    for (const clock of ['2000-01-01T00:00:00Z', '2040-12-31T23:59:59Z']) {
      vi.setSystemTime(new Date(clock));
      expect(differenceCalendarDays('2026-09-28', '2026-09-27')).toBe(1);
      expect(parseCalendarDate('2026-09-27')).toEqual({ year: 2026, month: 9, day: 27 });
    }
  });
});
