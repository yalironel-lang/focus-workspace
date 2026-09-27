/** Gregorian DATE-only fields, with supported years 0001–9999. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Strict YYYY-MM-DD; returns null for malformed or impossible dates. No coercion. */
export function parseCalendarDate(value: string): CalendarDate | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.length !== 10) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

/** Zero-based day count from 0001-01-01, computed solely from Gregorian fields. */
function ordinal(date: CalendarDate): number {
  const previousYears = date.year - 1;
  let days = 365 * previousYears + Math.floor(previousYears / 4)
    - Math.floor(previousYears / 100) + Math.floor(previousYears / 400);
  for (let month = 1; month < date.month; month += 1) {
    days += daysInMonth(date.year, month);
  }
  return days + date.day - 1;
}

/**
 * target minus reference in calendar days: tomorrow is +1, yesterday is -1.
 * Both inputs must be DATE-only strings; either invalid input returns null.
 * The caller supplies the reference local calendar date (never an implicit clock).
 * No timestamp parsing, timezone conversion, or elapsed-millisecond arithmetic.
 */
export function differenceCalendarDays(target: string, reference: string): number | null {
  const targetDate = parseCalendarDate(target);
  const referenceDate = parseCalendarDate(reference);
  if (!targetDate || !referenceDate) return null;
  return ordinal(targetDate) - ordinal(referenceDate);
}
