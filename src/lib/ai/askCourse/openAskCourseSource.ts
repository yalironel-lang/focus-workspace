/**
 * M0.6 — open an authoritative ask_course source in Free Space PDF.
 * Reuses focus + applyPdfPageRestore; never Shelf PDFViewerModal.
 */

import {
  ensureProjectObjectContent,
  type ProjectObjectContent,
  type ProjectSpaceObject,
} from '../../../hooks/useSectionFreeSpaceObjects';
import type { AskCourseSourceRef } from '../gatewayClient';
import { applyPdfPageRestore } from '../../studySession/sessionRestore';

export type OpenAskCourseSourceDeps = {
  getObject: (objectId: string) => ProjectSpaceObject | null | undefined;
  /** Existing Free Space focus path (sets free-space mode + viewport). */
  focusObject: (objectId: string) => void;
  updateObjectContent: (objectId: string, content: ProjectObjectContent) => void;
};

export type OpenAskCourseSourceResult = 'opened' | 'not_found' | 'not_pdf';

/**
 * Focus the Free Space PDF for an authoritative source and land on pageNumber.
 * Fails safely when the object is missing or not a PDF.
 */
export function openAskCourseSource(
  source: AskCourseSourceRef,
  deps: OpenAskCourseSourceDeps,
): OpenAskCourseSourceResult {
  const objectId = source.sourceObjectId;
  if (!objectId) return 'not_found';

  const obj = deps.getObject(objectId);
  if (!obj) return 'not_found';

  const content = ensureProjectObjectContent(obj.type, obj.content);
  if (content.type !== 'pdf') return 'not_pdf';

  try {
    const pagePatch = applyPdfPageRestore(obj, source.pageNumber);
    if (pagePatch) {
      deps.updateObjectContent(objectId, pagePatch);
    }
    deps.focusObject(objectId);
    return 'opened';
  } catch {
    return 'not_found';
  }
}
