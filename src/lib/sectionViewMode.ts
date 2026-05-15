const VIEW_MODE_KEY = 'fw_section_view_mode_v1';

export type SectionViewMode = 'work-surface' | 'free-space';

export function loadSectionViewMode(sectionId: string): SectionViewMode {
  if (!sectionId || typeof window === 'undefined') return 'work-surface';
  try {
    const raw = sessionStorage.getItem(VIEW_MODE_KEY);
    if (!raw) return 'work-surface';
    const map = JSON.parse(raw) as Record<string, string>;
    return map[sectionId] === 'free-space' ? 'free-space' : 'work-surface';
  } catch {
    return 'work-surface';
  }
}

export function saveSectionViewMode(sectionId: string, mode: SectionViewMode): void {
  if (!sectionId || typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(VIEW_MODE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[sectionId] = mode;
    sessionStorage.setItem(VIEW_MODE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}
