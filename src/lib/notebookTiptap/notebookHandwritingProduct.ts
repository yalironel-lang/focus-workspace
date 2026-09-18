/**
 * M7.3A — TipTap storage bridge for product handwriting (Edit/Draw context).
 */

import { Extension } from '@tiptap/core';
import type { AtmosphereTokens } from '../../hooks/useAtmosphere';

export type NotebookHandwritingProductStorage = {
  pageKey: string;
  objectId: string;
  userId?: string;
  sectionId?: string;
  tokens: AtmosphereTokens | null;
  /** Study-page ink recipe for presentation-aware handwriting. */
  pageInk?: 'dark' | 'light';
  onDismissTextEditing?: () => void;
};

export const NotebookHandwritingProduct = Extension.create({
  name: 'notebookHandwritingProduct',

  addStorage() {
    return {
      pageKey: '',
      objectId: '',
      userId: undefined,
      sectionId: undefined,
      tokens: null,
      pageInk: 'dark',
      onDismissTextEditing: undefined,
    } satisfies NotebookHandwritingProductStorage;
  },
});

declare module '@tiptap/core' {
  interface Storage {
    notebookHandwritingProduct: NotebookHandwritingProductStorage;
  }
}
