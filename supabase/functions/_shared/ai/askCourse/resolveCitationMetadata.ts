/**
 * M0.8F — Resolve live Notebook citation metadata from canonical FSO.
 * Fail closed: drop evidence whose live page can no longer be resolved.
 */

import { loadNotebookPageFromFsoObject } from '../knowledge/loadNotebookPageSource.ts';
import type { KnowledgeSearchHit } from './retrievalTypes.ts';

export type LoadNotebookFsoForCitation = (input: {
  userId: string;
  sectionId: string;
  notebookObjectId: string;
}) => Promise<{
  id: string;
  user_id: string;
  section_id: string;
  object: unknown;
} | null>;

/**
 * Attach authoritative notebook/page titles to notebook hits.
 * PDF hits pass through. Unresolvable notebook hits are dropped.
 *
 * Race: if a page is soft-deleted between index and Ask, that hit is excluded
 * rather than emitting a broken citation.
 */
export async function resolveAskCourseHitMetadata(input: {
  userId: string;
  sectionId: string;
  hits: KnowledgeSearchHit[];
  loadNotebookFso: LoadNotebookFsoForCitation;
}): Promise<KnowledgeSearchHit[]> {
  const fsoCache = new Map<
    string,
    Promise<{
      id: string;
      user_id: string;
      section_id: string;
      object: unknown;
    } | null>
  >();

  const loadCached = (notebookObjectId: string) => {
    let p = fsoCache.get(notebookObjectId);
    if (!p) {
      p = input.loadNotebookFso({
        userId: input.userId,
        sectionId: input.sectionId,
        notebookObjectId,
      });
      fsoCache.set(notebookObjectId, p);
    }
    return p;
  };

  const out: KnowledgeSearchHit[] = [];
  for (const hit of input.hits) {
    if (hit.sourceKind !== 'notebook_page') {
      out.push(hit);
      continue;
    }
    if (!hit.notebookObjectId) continue;
    const fso = await loadCached(hit.notebookObjectId);
    const loaded = loadNotebookPageFromFsoObject({
      userId: input.userId,
      sectionId: input.sectionId,
      notebookObjectId: hit.notebookObjectId,
      pageId: hit.sourceObjectId,
      fso,
    });
    if (!loaded.ok) continue;
    out.push({
      ...hit,
      notebookTitle: loaded.page.notebookTitle,
      pageTitle: loaded.page.pageTitle,
    });
  }
  return out;
}
