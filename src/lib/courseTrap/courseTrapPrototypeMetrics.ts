const STORAGE_KEY = 'fw_course_trap_prototype_events_v1';
const MAX_EVENTS = 500;
const TRAP_INDEX_PREFIX = 'fw_course_trap_index_';

/** Impulse Round V0 validation events only. */
export type CourseTrapMetricEvent =
  | 'round_started'
  | 'impulse_answered'
  | 'round_completed'
  | 'again_tapped'
  | 'done_tapped'
  | 'round_dismissed';

export interface CourseTrapMetricRecord {
  at: number;
  event: CourseTrapMetricEvent;
  trapId?: string;
  subject?: string;
  pdfObjectId?: string;
  path?: 'A' | 'B';
  impulseIndex?: number;
  hitTrap?: boolean;
  roundId?: string;
}

function readEvents(): CourseTrapMetricRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CourseTrapMetricRecord[]) : [];
  } catch {
    return [];
  }
}

function writeEvents(events: CourseTrapMetricRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
}

export function logCourseTrapMetric(
  event: CourseTrapMetricEvent,
  meta: Omit<CourseTrapMetricRecord, 'at' | 'event'> = {},
): void {
  const events = readEvents();
  events.push({ at: Date.now(), event, ...meta });
  writeEvents(events);
}

export function getCourseTrapMetricsJson(): string {
  return JSON.stringify(readEvents(), null, 2);
}

export async function exportCourseTrapMetricsToClipboard(): Promise<boolean> {
  const json = getCourseTrapMetricsJson();
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

export function peekCourseTrapIndex(subject: string): number {
  if (typeof localStorage === 'undefined') return 0;
  const key = `${TRAP_INDEX_PREFIX}${subject}`;
  const prev = parseInt(localStorage.getItem(key) ?? '0', 10);
  return Number.isFinite(prev) ? prev % 10 : 0;
}

export function nextCourseTrapIndex(subject: string): number {
  if (typeof localStorage === 'undefined') return 0;
  const key = `${TRAP_INDEX_PREFIX}${subject}`;
  const prev = parseInt(localStorage.getItem(key) ?? '0', 10);
  const next = Number.isFinite(prev) ? prev : 0;
  const index = next % 10;
  localStorage.setItem(key, String(next + 1));
  return index;
}

/** Advance trap cursor by 3 after a full round (Again). */
export function advanceCourseTrapRound(subject: string): void {
  nextCourseTrapIndex(subject);
  nextCourseTrapIndex(subject);
  nextCourseTrapIndex(subject);
}
