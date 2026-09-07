/**
 * Phone Phase C — lazy Free Space canvas mount.
 * Rollback: set PHONE_LAZY_FREE_SPACE to false (or localStorage override).
 */

import type { SectionViewMode } from './sectionViewMode';
import type { WorkspacePresentationProfile } from './workspacePresentationProfile';

/**
 * Default ON. Disable via:
 * - `localStorage.setItem('fw_phone_lazy_free_space', '0')` then reload
 * - or flip this constant for a hard rollback build
 */
export const PHONE_LAZY_FREE_SPACE = true;

const LS_KEY = 'fw_phone_lazy_free_space';

export function isPhoneLazyFreeSpaceEnabled(): boolean {
  if (!PHONE_LAZY_FREE_SPACE) return false;
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export type FreeSpaceCanvasMountInput = {
  profile: WorkspacePresentationProfile;
  sectionViewMode: SectionViewMode;
  lazyEnabled?: boolean;
};

/**
 * Heavy Free Space presentation (FreeformCanvas) should mount when:
 * - not phone, OR lazy disabled → always (keep-alive)
 * - phone + lazy → only while Workspace (free-space) is the active mode
 */
export function shouldMountFreeSpaceCanvas(input: FreeSpaceCanvasMountInput): boolean {
  const lazy =
    input.lazyEnabled ?? true;
  if (input.profile !== 'phone' || !lazy) return true;
  return input.sectionViewMode === 'free-space';
}
