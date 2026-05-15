export function resumeDismissedKey(sectionId: string): string {
  return `fw_section_${sectionId}_resume_dismissed_v1`;
}

export function isResumeDismissed(sectionId: string): boolean {
  try {
    return localStorage.getItem(resumeDismissedKey(sectionId)) === '1';
  } catch {
    return false;
  }
}

export function markResumeDismissed(sectionId: string): void {
  try {
    localStorage.setItem(resumeDismissedKey(sectionId), '1');
  } catch {
    /* ignore */
  }
}
