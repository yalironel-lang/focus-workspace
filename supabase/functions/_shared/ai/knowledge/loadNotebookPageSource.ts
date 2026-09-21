/**
 * M0.8C — Load authoritative Notebook page content from Free Space object JSON.
 * Never accepts client-supplied body/hash. Mirrors migration 013 ownership checks.
 */

export type LoadedNotebookPage = {
  notebookObjectId: string;
  pageId: string;
  pageTitle: string | null;
  pageKind: 'document' | 'write' | string;
  documentBody: string;
  codecVersion: number | undefined;
  notebookTitle: string | null;
};

export type LoadNotebookPageFailureCode =
  | 'not_found'
  | 'auth_mismatch'
  | 'not_notebook'
  | 'notebook_page_not_found'
  | 'invalid_request';

export type LoadNotebookPageResult =
  | { ok: true; page: LoadedNotebookPage }
  | { ok: false; code: LoadNotebookPageFailureCode };

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Pure loader from an already-fetched FSO row.
 * `object` is free_space_objects.object (ProjectSpaceObject JSON).
 */
export function loadNotebookPageFromFsoObject(input: {
  userId: string;
  sectionId: string;
  notebookObjectId: string;
  pageId: string;
  fso: {
    id: string;
    user_id: string;
    section_id: string;
    object: unknown;
  } | null;
}): LoadNotebookPageResult {
  if (
    !input.userId ||
    !input.sectionId ||
    !input.notebookObjectId.trim() ||
    !input.pageId.trim()
  ) {
    return { ok: false, code: 'invalid_request' };
  }

  if (!input.fso) return { ok: false, code: 'not_found' };

  if (input.fso.id !== input.notebookObjectId) {
    return { ok: false, code: 'not_found' };
  }

  if (input.fso.user_id !== input.userId || input.fso.section_id !== input.sectionId) {
    return { ok: false, code: 'auth_mismatch' };
  }

  if (!isRecord(input.fso.object)) return { ok: false, code: 'not_notebook' };
  const obj = input.fso.object;
  if (obj.type !== 'notebook') return { ok: false, code: 'not_notebook' };

  const content = isRecord(obj.content) ? obj.content : null;
  if (!content || content.type !== 'notebook') return { ok: false, code: 'not_notebook' };

  const pagesRaw = content.pages;
  if (!Array.isArray(pagesRaw)) return { ok: false, code: 'notebook_page_not_found' };

  const page = pagesRaw.find((p) => isRecord(p) && p.id === input.pageId);
  if (!page || !isRecord(page)) return { ok: false, code: 'notebook_page_not_found' };

  const pageKind = typeof page.kind === 'string' ? page.kind : 'document';
  const documentBody = typeof page.documentBody === 'string' ? page.documentBody : '';
  const codecVersion =
    typeof page.documentBodyCodecVersion === 'number'
      ? page.documentBodyCodecVersion
      : undefined;
  const pageTitle =
    typeof page.title === 'string' && page.title.trim().length > 0
      ? page.title.trim()
      : null;
  const notebookTitle =
    typeof obj.title === 'string' && obj.title.trim().length > 0
      ? obj.title.trim()
      : null;

  return {
    ok: true,
    page: {
      notebookObjectId: input.notebookObjectId,
      pageId: input.pageId,
      pageTitle,
      pageKind,
      documentBody,
      codecVersion,
      notebookTitle,
    },
  };
}
