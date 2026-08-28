/**
 * Device-local notebook navigation state (active section/page).
 * Avoids cloud LWW fights from passive page switches across devices.
 */

export type NotebookActivePageState = {
  activeSectionId: string;
  activePageId: string;
  savedAt: number;
};

const KEY_PREFIX = 'fw_nb_active_page_v1';

function storageKey(sectionId: string, boardId: string, objectId: string): string {
  const board = boardId || 'main';
  return `${KEY_PREFIX}_${sectionId}_${board}_${objectId}`;
}

export function saveNotebookActivePage(
  sectionId: string,
  boardId: string,
  objectId: string,
  activeSectionId: string,
  activePageId: string,
): void {
  if (!sectionId || !objectId || !activeSectionId || !activePageId) return;
  if (typeof window === 'undefined') return;
  const payload: NotebookActivePageState = {
    activeSectionId,
    activePageId,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(storageKey(sectionId, boardId, objectId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function loadNotebookActivePage(
  sectionId: string,
  boardId: string,
  objectId: string,
): NotebookActivePageState | null {
  if (!sectionId || !objectId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(sectionId, boardId, objectId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<NotebookActivePageState>;
    if (!p || typeof p !== 'object') return null;
    if (typeof p.activeSectionId !== 'string' || !p.activeSectionId) return null;
    if (typeof p.activePageId !== 'string' || !p.activePageId) return null;
    return {
      activeSectionId: p.activeSectionId,
      activePageId: p.activePageId,
      savedAt: typeof p.savedAt === 'number' && Number.isFinite(p.savedAt) ? p.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearNotebookActivePage(
  sectionId: string,
  boardId: string,
  objectId: string,
): void {
  if (!sectionId || !objectId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(sectionId, boardId, objectId));
  } catch {
    /* ignore */
  }
}
