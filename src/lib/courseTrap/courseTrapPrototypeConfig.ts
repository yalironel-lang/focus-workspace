/** Phase 0 — Course Trap validation prototype. Not a production system. */

const LS_PROTOTYPE = 'fw_course_trap_prototype';
const LS_AUTO_SURFACE = 'fw_course_trap_auto_surface';

/**
 * Impulse Round / Course Trap prototype.
 * V1-H3: default OFF for ordinary users. Opt-in: localStorage fw_course_trap_prototype=1
 */
export function isCourseTrapPrototypeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_PROTOTYPE) === '1';
  } catch {
    return false;
  }
}

/** Phase 1 — do not auto-open trap/impulse overlays when a PDF viewer becomes ready. */
export function isCourseTrapAutoSurfaceEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_AUTO_SURFACE) === '1';
  } catch {
    return false;
  }
}

/** Test seam — set prototype flag (`1` on, `0`/null off). */
export function setCourseTrapPrototypeEnabledForTests(value: '1' | '0' | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value == null) localStorage.removeItem(LS_PROTOTYPE);
    else localStorage.setItem(LS_PROTOTYPE, value);
  } catch {
    /* ignore */
  }
}
