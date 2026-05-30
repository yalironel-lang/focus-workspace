/**
 * Minimal notebook pose for Free Space re-entry: scroll + active block.
 */

export interface NotebookPose {
  scrollTop: number;
  blockId: string | null;
  savedAt: number;
}

const POSE_KEY_PREFIX = 'fw_nb_pose_v1';
const SECTION_WRITE_KEY_PREFIX = 'fw_fs_last_write_v1';

function poseKey(sectionId: string, boardId: string, objectId: string): string {
  const board = boardId || 'main';
  return `${POSE_KEY_PREFIX}_${sectionId}_${board}_${objectId}`;
}

export function saveNotebookPose(
  sectionId: string,
  boardId: string,
  objectId: string,
  pose: Pick<NotebookPose, 'scrollTop' | 'blockId'>,
): void {
  if (!sectionId || !objectId || typeof window === 'undefined') return;
  const payload: NotebookPose = {
    scrollTop: Math.max(0, pose.scrollTop),
    blockId: pose.blockId,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(poseKey(sectionId, boardId, objectId), JSON.stringify(payload));
    touchFreeSpaceWriteActivity(sectionId);
  } catch {
    /* quota */
  }
}

export function loadNotebookPose(
  sectionId: string,
  boardId: string,
  objectId: string,
): NotebookPose | null {
  if (!sectionId || !objectId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(poseKey(sectionId, boardId, objectId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<NotebookPose>;
    if (!p || typeof p !== 'object') return null;
    return {
      scrollTop: typeof p.scrollTop === 'number' && Number.isFinite(p.scrollTop) ? p.scrollTop : 0,
      blockId: typeof p.blockId === 'string' ? p.blockId : null,
      savedAt: typeof p.savedAt === 'number' && Number.isFinite(p.savedAt) ? p.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function touchFreeSpaceWriteActivity(sectionId: string): void {
  if (!sectionId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${SECTION_WRITE_KEY_PREFIX}_${sectionId}`, String(Date.now()));
  } catch {
    /* quota */
  }
}

export function loadFreeSpaceLastWriteAt(sectionId: string): number | null {
  if (!sectionId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${SECTION_WRITE_KEY_PREFIX}_${sectionId}`);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
