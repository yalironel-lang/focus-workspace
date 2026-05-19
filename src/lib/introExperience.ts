const INTRO_SEEN_KEY = 'fw_cinematic_intro_seen_v1';
const INTRO_DISABLED_KEY = 'fw_cinematic_intro_disabled_v1';

/** Skip intro via `?intro=1` or `?intro=replay` in dev. */
export function introQueryOverride(): 'force' | 'replay' | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = new URLSearchParams(window.location.search).get('intro');
    if (v === '1' || v === 'true' || v === 'replay') return v === 'replay' ? 'replay' : 'force';
  } catch {
    /* ignore */
  }
  return null;
}

export function isIntroExperienceDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (introQueryOverride() === 'force' || introQueryOverride() === 'replay') return false;
  try {
    return localStorage.getItem(INTRO_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function disableIntroExperience(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INTRO_DISABLED_KEY, '1');
  } catch {
    /* quota */
  }
}

export function hasSeenIntroExperience(): boolean {
  if (typeof window === 'undefined') return true;
  const q = introQueryOverride();
  if (q === 'force' || q === 'replay') return false;
  if (isIntroExperienceDisabled()) return true;
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markIntroExperienceSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* quota */
  }
}

export function clearIntroExperienceSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(INTRO_SEEN_KEY);
  } catch {
    /* quota */
  }
}
