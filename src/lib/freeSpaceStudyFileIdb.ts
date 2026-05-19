/**
 * Local blob storage for study files (PDF + office). Reuses the PDF IndexedDB store.
 */

import { isAcceptablePdfFile } from './freeSpacePdfIdb';
import { detectStudyFileKindFromName, type StudyFileKind } from './studyFiles';

export {
  savePdfBlob as saveStudyFileBlob,
  loadPdfBlob as loadStudyFileBlob,
  deletePdfBlob as deleteStudyFileBlob,
  copyPdfBlob as copyStudyFileBlob,
} from './freeSpacePdfIdb';

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'xlsm', 'csv']);

export function isAcceptableOfficeStudyFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : '';
  if (!OFFICE_EXTENSIONS.has(ext)) return false;
  const t = file.type.toLowerCase();
  if (t.startsWith('image/') || t.startsWith('video/') || t.startsWith('audio/')) return false;
  return true;
}

export function isAcceptableCanvasStudyFile(file: File): boolean {
  return isAcceptablePdfFile(file) || isAcceptableOfficeStudyFile(file);
}

export function detectDroppedStudyFileKind(file: File): StudyFileKind {
  if (isAcceptablePdfFile(file)) return 'pdf';
  return detectStudyFileKindFromName(file.name, file.type);
}
