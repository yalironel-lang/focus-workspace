import { PAGE_INK_BLOCK_KEY } from '../handwritingTypes';
import type { NotebookPage } from './types';

/** IDB block key for a write page — unique per page, never shared. */
export function inkPageKeyForNotebookPage(
  page: Pick<NotebookPage, 'id' | 'kind' | 'inkPageKey'>,
): string {
  if (page.kind !== 'write') return '';
  const key = page.inkPageKey?.trim();
  if (key) return key;
  return page.id;
}

/** Collect all write-page ink keys from notebook content (includes legacy shared key). */
export function collectNotebookPageInkKeys(
  pages: NotebookPage[] | undefined,
): string[] {
  const keys = (pages ?? [])
    .filter(p => p.kind === 'write')
    .map(p => inkPageKeyForNotebookPage(p));
  return [...new Set([...keys, PAGE_INK_BLOCK_KEY])];
}

export function isLegacySharedPageInkKey(key: string): boolean {
  return key === PAGE_INK_BLOCK_KEY;
}
