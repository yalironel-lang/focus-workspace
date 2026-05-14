const ARRIVAL_SEEN_KEY = 'fw_arrival_seen_v1';

export function hasSeenArrivalExperience(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(ARRIVAL_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markArrivalExperienceSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ARRIVAL_SEEN_KEY, '1');
  } catch {
    /* quota */
  }
}

export function clearArrivalExperienceSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ARRIVAL_SEEN_KEY);
  } catch {
    /* quota */
  }
}
