/**
 * ∑ Studio / section `math-zone` view — top-level workspace mode (lens over section work).
 * Set `localStorage.fw_math_zone_destination = '0'` to hide the tab (dev/testing only).
 */

const STORAGE_KEY = 'fw_math_zone_destination';

/** When true (default), show ∑ Studio in the shell and allow `math-zone` view mode. */
export function isMathZoneDestinationEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === '0') return false;
  return true;
}
