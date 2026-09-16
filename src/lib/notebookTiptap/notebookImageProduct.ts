/**
 * M7.2B — TipTap storage bridge for product image actions (Replace).
 * Holds live callbacks from NotebookTiptapCandidateEditor; no UI of its own.
 */

import { Extension } from '@tiptap/core';
import type { NotebookImageProductStorage } from './candidateImageInsert';

export const NotebookImageProduct = Extension.create({
  name: 'notebookImageProduct',

  addStorage() {
    return {
      pageKey: '',
      replaceImageFile: undefined,
    } satisfies NotebookImageProductStorage;
  },
});
