/** Tracks last write activity in section Math Zone (localStorage notebooks). */

const KEY_PREFIX = 'fw_math_zone_last_write_v1';

function storageKey(sectionId: string): string {
  return `${KEY_PREFIX}_${sectionId}`;
}

export function touchMathZoneActivity(sectionId: string): void {
  if (!sectionId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(sectionId), String(Date.now()));
  } catch {
    /* quota */
  }
}

export function loadMathZoneLastWriteAt(sectionId: string): number | null {
  if (!sectionId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(sectionId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
