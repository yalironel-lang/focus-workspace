/**
 * Raw / filtered retrieval hits for ask_course (server-only).
 */

export type AskCourseSourceKind = 'free_space_pdf' | 'notebook_page';

export type KnowledgeSearchHit = {
  sourceKind: AskCourseSourceKind;
  /** PDF FSO id, or NotebookPage.id for notebook_page. */
  sourceObjectId: string;
  /** Parent notebook FSO id — required for notebook_page. */
  notebookObjectId: string | null;
  fileName: string | null;
  pageNumber: number;
  chunkIndex: number;
  text: string;
  similarity: number;
  /** Live titles resolved after search (notebook only). */
  notebookTitle?: string | null;
  pageTitle?: string | null;
};

export type CitedCourseSource =
  | {
      index: number;
      sourceKind: 'free_space_pdf';
      sourceObjectId: string;
      fileName: string | null;
      pageNumber: number;
    }
  | {
      index: number;
      sourceKind: 'notebook_page';
      notebookObjectId: string;
      pageId: string;
      notebookTitle: string | null;
      pageTitle: string | null;
    };

export type PromptCourseChunk = {
  citationIndex: number;
  sourceKind: AskCourseSourceKind;
  sourceObjectId: string;
  notebookObjectId: string | null;
  fileName: string | null;
  pageNumber: number;
  text: string;
  notebookTitle?: string | null;
  pageTitle?: string | null;
};

/** Stable per-source key for ASK_COURSE_MAX_CHUNKS_PER_SOURCE. */
export function askCourseSourceDiversityKey(hit: {
  sourceKind: AskCourseSourceKind;
  sourceObjectId: string;
  notebookObjectId?: string | null;
}): string {
  if (hit.sourceKind === 'notebook_page') {
    return `notebook_page::${hit.notebookObjectId ?? ''}::${hit.sourceObjectId}`;
  }
  return `free_space_pdf::${hit.sourceObjectId}`;
}
