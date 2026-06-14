/** Reality Validation — single-question iPad study surface (not full Exam Sheet). */

/** IDB block key for RV ink sidecar (one question per PDF object). */
export const RV_INK_BLOCK_KEY = 'rv-ink';

export function isRvStudySurfaceEnabled(): boolean {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;
  const raw = env?.VITE_RV_STUDY_SURFACE;
  return raw === 'true' || raw === '1';
}
