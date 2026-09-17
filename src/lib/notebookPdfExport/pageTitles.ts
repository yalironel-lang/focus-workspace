/**
 * Title hierarchy helpers for PDF export — suppress generic/duplicate labels.
 */

import type { NotebookPage } from '../notebookPages/types';

/** True for empty or default “Page N” labels that add no document value. */
export function isGenericNotebookPageTitle(title: string | null | undefined): boolean {
  const t = (title ?? '').trim();
  if (!t) return true;
  return /^page\s+\d+$/i.test(t);
}

/**
 * Emit a page chrome heading only when the user renamed the page to something
 * meaningful (not the default Page 1 / Page 2 pattern).
 */
export function shouldEmitExportPageTitle(page: Pick<NotebookPage, 'title'>): boolean {
  const raw = page.title?.trim();
  if (!raw) return false;
  return !isGenericNotebookPageTitle(raw);
}

/** Meaningful display title, or null when chrome should omit it. */
export function meaningfulExportPageTitle(page: Pick<NotebookPage, 'title'>): string | null {
  if (!shouldEmitExportPageTitle(page)) return null;
  return page.title!.trim();
}
