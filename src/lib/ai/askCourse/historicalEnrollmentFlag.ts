/**
 * M1.1D — kill switch for NEW historical Free Space PDF enrollment only.
 * Does not affect new-upload ingestion, marker recovery, or the OCR worker.
 */

const LS_KEY = 'courseKnowledgeHistoricalEnroll';

/**
 * Default OFF. Enable via `VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL=true` or
 * localStorage `courseKnowledgeHistoricalEnroll=1` (ops / staging).
 */
export function isCourseKnowledgeHistoricalEnrollEnabled(): boolean {
  const raw = import.meta.env.VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  try {
    if (typeof localStorage !== 'undefined') {
      const ls = localStorage.getItem(LS_KEY);
      if (ls === '1') return true;
      if (ls === '0') return false;
    }
  } catch {
    /* private mode */
  }
  return false;
}

/** Test seam. */
export function setCourseKnowledgeHistoricalEnrollLocalStorageForTests(
  value: '1' | '0' | null,
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value == null) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, value);
  } catch {
    /* ignore */
  }
}
