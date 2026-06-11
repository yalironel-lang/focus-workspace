import type { CompositionStructureId } from './compositionStructureCatalog';

const RECENTS_KEY = 'fw_composition_recents_session';

export function loadCompositionRecents(): CompositionStructureId[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is CompositionStructureId => typeof x === 'string').slice(0, 3);
  } catch {
    return [];
  }
}

export function pushCompositionRecent(id: CompositionStructureId): CompositionStructureId[] {
  const prev = loadCompositionRecents();
  const next = [id, ...prev.filter(x => x !== id)].slice(0, 3);
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  }
  return next;
}
