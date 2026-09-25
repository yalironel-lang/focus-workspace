/**
 * M1.1D/F — kill switch for NEW historical Free Space PDF enrollment only.
 * Does not affect new-upload ingestion, marker recovery, or the OCR worker.
 *
 * V1 default: ON.
 * Emergency kill (build-time): VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL=false|0
 * Session override: localStorage courseKnowledgeHistoricalEnroll=0 (off) / 1 (on)
 */

const LS_KEY = 'courseKnowledgeHistoricalEnroll';

/**
 * Historical Free Space PDF enrollment on Ask-open.
 * Default ON. Explicit env false/0 is the Production emergency kill switch.
 */
export function isCourseKnowledgeHistoricalEnrollEnabled(): boolean {
  const raw = import.meta.env.VITE_COURSE_KNOWLEDGE_HISTORICAL_ENROLL;
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  try {
    if (typeof localStorage !== 'undefined') {
      const ls = localStorage.getItem(LS_KEY);
      if (ls === '0') return false;
      if (ls === '1') return true;
    }
  } catch {
    /* private mode */
  }
  return true;
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
