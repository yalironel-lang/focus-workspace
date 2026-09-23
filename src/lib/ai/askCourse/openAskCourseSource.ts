/**
 * M0.6 / M0.8F — open an authoritative ask_course source in Free Space.
 * PDF: focus + applyPdfPageRestore.
 * Notebook: focus + activate pageId via switchNotebookPage (no page create).
 */

import {
  ensureProjectObjectContent,
  type ProjectObjectContent,
  type ProjectSpaceObject,
} from '../../../hooks/useSectionFreeSpaceObjects';
import type { AskCourseSourceRef } from '../gatewayClient';
import { applyPdfPageRestore } from '../../studySession/sessionRestore';
import { switchNotebookPage } from '../../notebookPages/operations';
import type { NotebookContentWithPages } from '../../notebookPages/types';

export type OpenAskCourseSourceDeps = {
  getObject: (objectId: string) => ProjectSpaceObject | null | undefined;
  /** Existing Free Space focus path (sets free-space mode + viewport). */
  focusObject: (objectId: string) => void;
  updateObjectContent: (objectId: string, content: ProjectObjectContent) => void;
};

export type OpenAskCourseSourceResult =
  | 'opened'
  | 'not_found'
  | 'not_pdf'
  | 'not_notebook';

/** Short student-facing copy for open failures — never leak ids/paths/codes. */
export function userFacingOpenAskCourseSourceMessage(
  result: OpenAskCourseSourceResult,
): string | null {
  switch (result) {
    case 'opened':
      return null;
    case 'not_pdf':
      return 'PDF is no longer available.';
    case 'not_notebook':
      return 'Notebook page could not be found.';
    case 'not_found':
    default:
      return 'Source could not be opened.';
  }
}

function isNotebookPageSource(
  source: AskCourseSourceRef,
): source is Extract<AskCourseSourceRef, { sourceKind: 'notebook_page' }> {
  return (source as { sourceKind?: string }).sourceKind === 'notebook_page';
}

/**
 * Focus the Free Space object for an authoritative source.
 * Fails safely when the object/page is missing.
 */
export function openAskCourseSource(
  source: AskCourseSourceRef,
  deps: OpenAskCourseSourceDeps,
): OpenAskCourseSourceResult {
  if (isNotebookPageSource(source)) {
    return openNotebookSource(source, deps);
  }

  const pdfSource = source as Extract<AskCourseSourceRef, { sourceKind: 'free_space_pdf' }> & {
    sourceObjectId?: string;
    pageNumber?: number;
  };
  const objectId = pdfSource.sourceObjectId;
  if (!objectId) return 'not_found';

  const obj = deps.getObject(objectId);
  if (!obj) return 'not_found';

  const content = ensureProjectObjectContent(obj.type, obj.content);
  if (content.type !== 'pdf') return 'not_pdf';

  try {
    const pagePatch = applyPdfPageRestore(obj, pdfSource.pageNumber ?? 1);
    if (pagePatch) {
      deps.updateObjectContent(objectId, pagePatch);
    }
    deps.focusObject(objectId);
    return 'opened';
  } catch {
    return 'not_found';
  }
}

function openNotebookSource(
  source: Extract<AskCourseSourceRef, { sourceKind: 'notebook_page' }>,
  deps: OpenAskCourseSourceDeps,
): OpenAskCourseSourceResult {
  const objectId = source.notebookObjectId;
  const pageId = source.pageId;
  if (!objectId || !pageId) return 'not_found';

  const obj = deps.getObject(objectId);
  if (!obj) return 'not_found';

  const content = ensureProjectObjectContent(obj.type, obj.content);
  if (content.type !== 'notebook') return 'not_notebook';

  const notebook = content as NotebookContentWithPages;
  const page = (notebook.pages ?? []).find(p => p.id === pageId);
  if (!page) return 'not_found';

  try {
    const next = switchNotebookPage(
      notebook,
      pageId,
      notebook.body ?? '',
      notebook.bodyCodecVersion,
    );
    // If switch could not activate the page, refuse rather than mutate blindly.
    if (next.activePageId !== pageId) return 'not_found';
    deps.updateObjectContent(objectId, next as ProjectObjectContent);
    deps.focusObject(objectId);
    return 'opened';
  } catch {
    return 'not_found';
  }
}
