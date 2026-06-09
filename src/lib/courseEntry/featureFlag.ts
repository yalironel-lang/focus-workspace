const LS_KEY = 'courseEntryBehaviorV1';

/**
 * Course-entry Mission Control — entry on Workspace, not a separate dashboard tab.
 * Default off in production. Enable locally via `.env.local` (see `.env.example`).
 */
export function isCourseEntryBehaviorV1Enabled(): boolean {
  const raw = import.meta.env.VITE_COURSE_ENTRY_BEHAVIOR_V1;
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
