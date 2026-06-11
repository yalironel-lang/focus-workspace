import {
  type CompositionFavoriteId,
  defaultCompositionFavorite,
} from './compositionStructureCatalog';

const FAVORITE_KEY = 'fw_composition_favorite_v1';

const VALID_IDS = new Set<string>([
  'fraction',
  'exponent',
  'root',
  'integral',
  'limit',
  'sum',
  'subscript',
  'grouping',
  'derivative',
  'answer',
]);

export function loadCompositionFavorite(notebookMode: string): CompositionFavoriteId {
  if (typeof localStorage === 'undefined') return defaultCompositionFavorite(notebookMode);
  try {
    const raw = localStorage.getItem(FAVORITE_KEY);
    if (!raw) return defaultCompositionFavorite(notebookMode);
    const parsed = JSON.parse(raw) as { pinned?: string };
    const pinned = parsed.pinned;
    if (pinned && VALID_IDS.has(pinned)) {
      return pinned as CompositionFavoriteId;
    }
  } catch {
    /* ignore */
  }
  return defaultCompositionFavorite(notebookMode);
}

export function saveCompositionFavorite(id: CompositionFavoriteId): void {
  if (typeof localStorage === 'undefined') return;
  if (!VALID_IDS.has(id)) return;
  try {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify({ pinned: id }));
  } catch {
    /* quota */
  }
}
