import { DEFAULT_SUBSPACE_ID, SUBSPACE_PRESETS, type ProjectSubspace } from './types';

function storageKey(sectionId: string): string {
  return `fw_section_${sectionId}_subspaces_v1`;
}

function read(sectionId: string): ProjectSubspace[] | null {
  try {
    const raw = localStorage.getItem(storageKey(sectionId));
    if (!raw) return null;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.filter(
      (x): x is ProjectSubspace =>
        !!x &&
        typeof x === 'object' &&
        typeof (x as ProjectSubspace).id === 'string' &&
        typeof (x as ProjectSubspace).label === 'string',
    );
  } catch {
    return null;
  }
}

function write(sectionId: string, subspaces: ProjectSubspace[]): void {
  try {
    localStorage.setItem(storageKey(sectionId), JSON.stringify(subspaces));
  } catch {
    /* quota */
  }
}

export function defaultSubspacesForSection(_sectionId: string): ProjectSubspace[] {
  const now = new Date().toISOString();
  return SUBSPACE_PRESETS.map((p, i) => ({
    id: p.slug === 'main' ? DEFAULT_SUBSPACE_ID : p.slug,
    label: p.label,
    slug: p.slug,
    isDefault: i === 0,
    createdAt: now,
  }));
}

/** Ensures subspace records exist; only Main is active in UI for now. */
export function getProjectSubspaces(sectionId: string): ProjectSubspace[] {
  if (!sectionId) return [];
  const existing = read(sectionId);
  if (existing && existing.length > 0) {
    const hasMain = existing.some(s => s.isDefault || s.id === DEFAULT_SUBSPACE_ID);
    if (hasMain) return existing;
  }
  const defaults = defaultSubspacesForSection(sectionId);
  write(sectionId, defaults);
  return defaults;
}

export function getDefaultSubspace(sectionId: string): ProjectSubspace {
  const all = getProjectSubspaces(sectionId);
  return all.find(s => s.isDefault || s.id === DEFAULT_SUBSPACE_ID) ?? all[0]!;
}
