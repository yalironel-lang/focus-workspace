/** Phase 0 — Course Trap validation prototype. Not a production system. */

export function isCourseTrapPrototypeEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const v = localStorage.getItem('fw_course_trap_prototype');
  if (v === '0') return false;
  return true;
}

/** Phase 1 — do not auto-open trap/impulse overlays when a PDF viewer becomes ready. */
export function isCourseTrapAutoSurfaceEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('fw_course_trap_auto_surface') === '1';
}
