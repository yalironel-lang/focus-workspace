import { pageDisplayTitle, sectionDisplayTitle } from './operations';
import type { NotebookContentWithPages, NotebookPage, NotebookSection } from './types';

export interface NotebookPreviewMeta {
  sectionTitle: string;
  pageTitle: string;
  pageIndexInSection: number;
  pagesInSection: number;
  totalPages: number;
  totalSections: number;
  snippet: string;
}

function findActiveSection(content: NotebookContentWithPages): NotebookSection | null {
  const sections = content.sections ?? [];
  if (sections.length === 0) return null;
  return sections.find(s => s.id === content.activeSectionId) ?? sections[0] ?? null;
}

function findActivePage(content: NotebookContentWithPages): NotebookPage | null {
  const pages = content.pages ?? [];
  if (pages.length === 0) return null;
  return pages.find(p => p.id === content.activePageId) ?? null;
}

export function getNotebookPreviewMeta(content: NotebookContentWithPages): NotebookPreviewMeta {
  const sections = content.sections ?? [];
  const pages = content.pages ?? [];
  const activeSection = findActiveSection(content);
  const activePage = findActivePage(content);
  const sectionIndex = activeSection
    ? Math.max(0, sections.findIndex(s => s.id === activeSection.id))
    : 0;
  const pageIds = activeSection?.pageIds ?? [];
  const pageIndexInSection =
    activePage && pageIds.length > 0
      ? Math.max(1, pageIds.indexOf(activePage.id) + 1)
      : 1;
  const raw = (content.body ?? '').replace(/\r\n/g, '\n');
  const snippet = raw
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 140);

  return {
    sectionTitle: activeSection
      ? sectionDisplayTitle(activeSection, sectionIndex + 1)
      : 'Notes',
    pageTitle: activePage ? pageDisplayTitle(activePage, pageIndexInSection) : 'Page 1',
    pageIndexInSection,
    pagesInSection: pageIds.length || 1,
    totalPages: pages.length || 1,
    totalSections: sections.length || 1,
    snippet,
  };
}

export function getNotebookWorkspaceBreadcrumb(content: NotebookContentWithPages): string {
  const meta = getNotebookPreviewMeta(content);
  return `${meta.sectionTitle} › ${meta.pageTitle}`;
}
