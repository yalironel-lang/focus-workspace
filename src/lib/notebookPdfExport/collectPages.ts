/**
 * Read-only page ordering for PDF export — sections.pageIds is authoritative.
 * Never reads TipTap DOM; never mutates content.
 */

import type { NotebookContentWithPages, NotebookPage } from '../notebookPages/types';

export type ExportPageSlice = {
  page: NotebookPage;
  /** Index among exported pages (0-based). */
  index: number;
  /** Display title for PDF heading. */
  title: string;
};

/** Ordered pages for export. Active page id does not affect order or membership. */
export function collectNotebookPagesForExport(
  content: Pick<NotebookContentWithPages, 'pages' | 'sections' | 'body' | 'bodyCodecVersion'>,
): NotebookPage[] {
  const pages = content.pages ?? [];
  if (pages.length === 0) {
    // Legacy single-body notebook — synthesize one document page for export only (not persisted).
    return [
      {
        id: '__legacy-body__',
        sectionId: '__legacy__',
        kind: 'document',
        title: 'Page 1',
        documentBody: content.body ?? '',
        ...(content.bodyCodecVersion !== undefined
          ? { documentBodyCodecVersion: content.bodyCodecVersion }
          : {}),
      },
    ];
  }

  const byId = new Map(pages.map(p => [p.id, p]));
  const ordered: NotebookPage[] = [];
  const seen = new Set<string>();
  for (const section of content.sections ?? []) {
    for (const id of section.pageIds) {
      const page = byId.get(id);
      if (!page || seen.has(page.id)) continue;
      ordered.push(page);
      seen.add(page.id);
    }
  }
  for (const page of pages) {
    if (!seen.has(page.id)) {
      ordered.push(page);
      seen.add(page.id);
    }
  }
  return ordered;
}

export function exportPageDisplayTitle(page: NotebookPage, index: number): string {
  const t = page.title?.trim();
  if (t) return t;
  return `Page ${index + 1}`;
}

export function collectExportPageSlices(
  content: Pick<NotebookContentWithPages, 'pages' | 'sections' | 'body' | 'bodyCodecVersion'>,
): ExportPageSlice[] {
  return collectNotebookPagesForExport(content).map((page, index) => ({
    page,
    index,
    title: exportPageDisplayTitle(page, index),
  }));
}
