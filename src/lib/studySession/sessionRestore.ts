import {
  ensureProjectObjectContent,
  type ProjectObjectContent,
  type ProjectSpaceObject,
} from '../../hooks/useSectionFreeSpaceObjects';
import type { StudySessionRecord } from './types';

export interface StudyRestorePayload {
  pdfPage: number | null;
  workBlockId: string | null;
}

export function buildRestorePayload(record: StudySessionRecord | null): StudyRestorePayload {
  if (!record) return { pdfPage: null, workBlockId: null };
  return {
    pdfPage: record.source.page > 0 ? record.source.page : null,
    workBlockId: record.work.lastBlockId,
  };
}

export function applyPdfPageRestore(
  obj: ProjectSpaceObject,
  page: number,
): ProjectObjectContent | null {
  const c = ensureProjectObjectContent('pdf', obj.content);
  if (c.type !== 'pdf') return null;
  const nextPage = Math.max(1, page);
  if (c.page === nextPage) return null;
  return { ...c, page: nextPage, lastOpenedAt: Date.now() };
}
