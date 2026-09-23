/**
 * M1.1C — collect Free Space materials that can become Course Knowledge.
 */

import {
  ensureProjectObjectContent,
  type ProjectSpaceObject,
} from '../../../hooks/useSectionFreeSpaceObjects';
import type { NotebookContentWithPages } from '../../notebookPages/types';
import type { EligibleKnowledgeMaterialRef } from './courseKnowledgeReadiness';

export function collectEligibleKnowledgeMaterials(
  objects: readonly ProjectSpaceObject[],
): EligibleKnowledgeMaterialRef[] {
  const out: EligibleKnowledgeMaterialRef[] = [];
  for (const obj of objects) {
    if (obj.type === 'pdf') {
      out.push({ kind: 'free_space_pdf', sourceObjectId: obj.id });
      continue;
    }
    if (obj.type !== 'notebook') continue;
    const content = ensureProjectObjectContent('notebook', obj.content);
    if (content.type !== 'notebook') continue;
    const notebook = content as NotebookContentWithPages;
    const pages = notebook.pages ?? [];
    for (const page of pages) {
      if (!page?.id) continue;
      out.push({
        kind: 'notebook_page',
        notebookObjectId: obj.id,
        pageId: page.id,
      });
    }
  }
  return out;
}
