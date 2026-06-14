import { migrateLegacyNotebook, serializePageToBody } from './hydrate';
import {
  NOTEBOOK_SCHEMA_VERSION_V1,
  type NotebookContentWithPages,
  type NotebookPage,
  type NotebookSection,
} from './types';

let idSeq = 0;

export function newNotebookSectionId(): string {
  idSeq += 1;
  return `sec-${Date.now()}-${idSeq}`;
}

export function newNotebookPageId(): string {
  idSeq += 1;
  return `page-${Date.now()}-${idSeq}`;
}

function defaultPageTitle(index: number): string {
  return `Page ${index}`;
}

function defaultSectionTitle(index: number): string {
  return index === 1 ? 'Notes' : `Section ${index}`;
}

export function pageDisplayTitle(page: NotebookPage, indexInSection: number): string {
  return page.title?.trim() || defaultPageTitle(indexInSection);
}

export function sectionDisplayTitle(section: NotebookSection, index: number): string {
  return section.title.trim() || defaultSectionTitle(index);
}

/** Persist in-memory editor body onto the active document page (Phase 2 page switch). */
export function saveNotebookPageBody<T extends NotebookContentWithPages>(
  content: T,
  currentBody: string,
): T {
  const migrated = migrateLegacyNotebook(content);
  const activePageId = migrated.activePageId;
  if (!activePageId) {
    return { ...migrated, body: currentBody, schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1 } as T;
  }
  const pages = (migrated.pages ?? []).map(p => {
    if (p.id !== activePageId) return p;
    if (p.kind === 'document') return { ...p, documentBody: currentBody };
    return p;
  });
  return {
    ...migrated,
    pages,
    body: currentBody,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
  } as T;
}

export function switchNotebookPage<T extends NotebookContentWithPages>(
  content: T,
  pageId: string,
  currentBody: string,
): T {
  const saved = saveNotebookPageBody(content, currentBody);
  if (pageId === saved.activePageId) return saved;
  const page = (saved.pages ?? []).find(p => p.id === pageId);
  if (!page) return saved;
  const section = (saved.sections ?? []).find(s => s.id === page.sectionId);
  if (!section) return saved;
  const body = serializePageToBody(page, '');
  return {
    ...saved,
    activeSectionId: section.id,
    activePageId: page.id,
    body,
  } as T;
}

export function setActiveNotebookSection<T extends NotebookContentWithPages>(
  content: T,
  sectionId: string,
  currentBody: string,
): T {
  const saved = saveNotebookPageBody(content, currentBody);
  const section = (saved.sections ?? []).find(s => s.id === sectionId);
  if (!section || section.pageIds.length === 0) return saved;
  if (sectionId === saved.activeSectionId && saved.activePageId) return saved;
  return switchNotebookPage(saved, section.pageIds[0]!, currentBody);
}

export function addNotebookSection<T extends NotebookContentWithPages>(
  content: T,
  currentBody: string,
  title?: string,
): T {
  const saved = saveNotebookPageBody(content, currentBody);
  const sections = saved.sections ?? [];
  const sectionIndex = sections.length + 1;
  const sectionId = newNotebookSectionId();
  const pageId = newNotebookPageId();
  const sectionTitle = title?.trim() || defaultSectionTitle(sectionIndex);
  const page: NotebookPage = {
    id: pageId,
    sectionId,
    kind: 'document',
    title: 'Page 1',
    documentBody: '',
  };
  const section: NotebookSection = {
    id: sectionId,
    title: sectionTitle,
    pageIds: [pageId],
  };
  return {
    ...saved,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
    sections: [...sections, section],
    pages: [...(saved.pages ?? []), page],
    activeSectionId: sectionId,
    activePageId: pageId,
    body: '',
  } as T;
}

export function addNotebookPage<T extends NotebookContentWithPages>(
  content: T,
  sectionId: string,
  currentBody: string,
  title?: string,
): T {
  const saved = saveNotebookPageBody(content, currentBody);
  const section = (saved.sections ?? []).find(s => s.id === sectionId);
  if (!section) return saved;
  const pageIndex = section.pageIds.length + 1;
  const pageId = newNotebookPageId();
  const page: NotebookPage = {
    id: pageId,
    sectionId,
    kind: 'document',
    title: title?.trim() || defaultPageTitle(pageIndex),
    documentBody: '',
  };
  const sections = (saved.sections ?? []).map(s =>
    s.id === sectionId ? { ...s, pageIds: [...s.pageIds, pageId] } : s,
  );
  return {
    ...saved,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
    sections,
    pages: [...(saved.pages ?? []), page],
    activeSectionId: sectionId,
    activePageId: pageId,
    body: '',
  } as T;
}

export function renameNotebookSection<T extends NotebookContentWithPages>(
  content: T,
  sectionId: string,
  title: string,
): T {
  const trimmed = title.trim();
  if (!trimmed) return content;
  const migrated = migrateLegacyNotebook(content);
  const sections = (migrated.sections ?? []).map(s =>
    s.id === sectionId ? { ...s, title: trimmed } : s,
  );
  return { ...migrated, sections, schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1 } as T;
}

export function renameNotebookPage<T extends NotebookContentWithPages>(
  content: T,
  pageId: string,
  title: string,
): T {
  const trimmed = title.trim();
  if (!trimmed) return content;
  const migrated = migrateLegacyNotebook(content);
  const pages = (migrated.pages ?? []).map(p =>
    p.id === pageId ? { ...p, title: trimmed } : p,
  );
  return { ...migrated, pages, schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1 } as T;
}
