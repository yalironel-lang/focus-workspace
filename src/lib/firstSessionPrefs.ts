/** First-session sequencing — local only, no tutorials. */

const FIRST_ENTRY_KEY = 'fw_first_workspace_entry_done_v1';
const ADVANCED_NAV_KEY = 'fw_library_advanced_nav_v1';

export function isFirstWorkspaceEntryPending(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(FIRST_ENTRY_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markFirstWorkspaceEntryDone(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FIRST_ENTRY_KEY, '1');
  } catch {
    /* quota */
  }
}

export function isAdvancedLibraryNavUnlocked(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (localStorage.getItem(FIRST_ENTRY_KEY) === '1') return true;
    return localStorage.getItem(ADVANCED_NAV_KEY) === '1';
  } catch {
    return true;
  }
}

export function unlockAdvancedLibraryNav(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ADVANCED_NAV_KEY, '1');
  } catch {
    /* quota */
  }
}
