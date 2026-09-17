import {
  notebookPageBodyProjection,
  replaceNotebookPageBody,
  type NotebookBodyRepresentation,
} from './bodyCodec';
import { migrateLegacyNotebook } from './hydrate';
import {
  NOTEBOOK_SCHEMA_VERSION_V1,
  type NotebookContentWithPages,
  type NotebookPage,
  type NotebookPageKind,
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
  currentCodecVersion?: number,
): T {
  const migrated = migrateLegacyNotebook(content);
  const activePageId = migrated.activePageId;
  if (!activePageId) {
    return {
      ...migrated,
      body: currentBody,
      ...(currentCodecVersion !== undefined
        ? { bodyCodecVersion: currentCodecVersion }
        : content.bodyCodecVersion !== undefined
          ? { bodyCodecVersion: content.bodyCodecVersion }
          : {}),
      schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
    } as T;
  }
  const codecVersion =
    currentCodecVersion !== undefined ? currentCodecVersion : content.bodyCodecVersion;
  const rep: NotebookBodyRepresentation = {
    body: currentBody,
    ...(codecVersion !== undefined ? { codecVersion } : {}),
  };
  const pages = (migrated.pages ?? []).map(p => {
    if (p.id !== activePageId) return p;
    if (p.kind === 'document') return replaceNotebookPageBody(p, rep);
    return p;
  });
  return {
    ...migrated,
    pages,
    body: currentBody,
    ...(codecVersion !== undefined ? { bodyCodecVersion: codecVersion } : {}),
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
  } as T;
}


export function switchNotebookPage<T extends NotebookContentWithPages>(
  content: T,
  pageId: string,
  currentBody: string,
  currentCodecVersion?: number,
): T {
  const saved = saveNotebookPageBody(content, currentBody, currentCodecVersion);
  if (pageId === saved.activePageId) return saved;
  const page = (saved.pages ?? []).find(p => p.id === pageId);
  if (!page) return saved;
  const section = (saved.sections ?? []).find(s => s.id === page.sectionId);
  if (!section) return saved;
  const projection = notebookPageBodyProjection(page);
  return {
    ...saved,
    activeSectionId: section.id,
    activePageId: page.id,
    ...projection,
    bodyCodecVersion: projection.bodyCodecVersion,
  } as T;
}

export function setActiveNotebookSection<T extends NotebookContentWithPages>(
  content: T,
  sectionId: string,
  currentBody: string,
  currentCodecVersion?: number,
): T {
  const saved = saveNotebookPageBody(content, currentBody, currentCodecVersion);
  const section = (saved.sections ?? []).find(s => s.id === sectionId);
  if (!section || section.pageIds.length === 0) return saved;
  if (sectionId === saved.activeSectionId && saved.activePageId) return saved;
  return switchNotebookPage(saved, section.pageIds[0]!, currentBody, currentCodecVersion);
}

export function addNotebookSection<T extends NotebookContentWithPages>(
  content: T,
  currentBody: string,
  title?: string,
  currentCodecVersion?: number,
): T {
  const saved = saveNotebookPageBody(content, currentBody, currentCodecVersion);
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
    bodyCodecVersion: undefined,
  } as T;
}

export function addNotebookPage<T extends NotebookContentWithPages>(
  content: T,
  sectionId: string,
  currentBody: string,
  title?: string,
  kind: NotebookPageKind = 'document',
  currentCodecVersion?: number,
): T {
  const saved = saveNotebookPageBody(content, currentBody, currentCodecVersion);
  const section = (saved.sections ?? []).find(s => s.id === sectionId);
  if (!section) return saved;
  const pageIndex = section.pageIds.length + 1;
  const pageId = newNotebookPageId();
  const page: NotebookPage =
    kind === 'write'
      ? {
          id: pageId,
          sectionId,
          kind: 'write',
          title: title?.trim() || defaultPageTitle(pageIndex),
          inkPageKey: pageId,
        }
      : {
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
    bodyCodecVersion: undefined,
  } as T;
}

export function setNotebookPageLinkedPdf<T extends NotebookContentWithPages>(
  content: T,
  pageId: string,
  pdfObjectId: string | null,
): T {
  const migrated = migrateLegacyNotebook(content);
  const pages = (migrated.pages ?? []).map(p => {
    if (p.id !== pageId || p.kind !== 'write') return p;
    if (!pdfObjectId) {
      const { linkedPdfObjectId: _removed, ...rest } = p;
      return rest as NotebookPage;
    }
    return { ...p, linkedPdfObjectId: pdfObjectId };
  });
  return { ...migrated, pages, schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1 } as T;
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

function resolveActiveAfterDelete(
  content: NotebookContentWithPages,
  deletedPageId: string,
  /** Next-or-previous sibling id computed BEFORE removing the page from pageIds. */
  preferredFallbackId?: string | null,
): Pick<NotebookContentWithPages, 'activeSectionId' | 'activePageId' | 'body' | 'bodyCodecVersion'> {
  const sections = content.sections ?? [];
  const pages = content.pages ?? [];
  if (content.activePageId !== deletedPageId) {
    const active = pages.find(p => p.id === content.activePageId);
    return {
      activeSectionId: content.activeSectionId,
      activePageId: content.activePageId,
      ...(active ? notebookPageBodyProjection(active, content) : { body: content.body }),
      bodyCodecVersion: active
        ? notebookPageBodyProjection(active, content).bodyCodecVersion
        : content.bodyCodecVersion,
    };
  }

  const preferred =
    preferredFallbackId && pages.some(p => p.id === preferredFallbackId)
      ? preferredFallbackId
      : null;
  const section =
    (preferred ? sections.find(s => s.pageIds.includes(preferred)) : null) ??
    sections.find(s => s.pageIds.length > 0) ??
    sections[0];
  const fallbackId = preferred ?? section?.pageIds[0] ?? sections[0]?.pageIds[0];
  const fallbackPage = fallbackId ? pages.find(p => p.id === fallbackId) : null;
  const fallbackSection = fallbackPage
    ? sections.find(s => s.id === fallbackPage.sectionId)
    : section;
  return {
    activeSectionId: fallbackSection?.id,
    activePageId: fallbackPage?.id,
    ...(fallbackPage ? notebookPageBodyProjection(fallbackPage) : { body: '' }),
    bodyCodecVersion: fallbackPage?.documentBodyCodecVersion,
  };
}

/** Remove a page from manifest; returns deleted write-page ink keys for asset cleanup. */
export function deleteNotebookPage<T extends NotebookContentWithPages>(
  content: T,
  pageId: string,
  currentBody: string,
  currentCodecVersion?: number,
): { content: T; deletedInkKeys: string[] } {
  const saved = saveNotebookPageBody(content, currentBody, currentCodecVersion);
  const page = (saved.pages ?? []).find(p => p.id === pageId);
  if (!page) return { content: saved, deletedInkKeys: [] };

  const deletedInkKeys =
    page.kind === 'write' ? [page.inkPageKey ?? page.id] : [];

  // Capture next/previous sibling while pageIds still contain the deleted page.
  const sectionBefore = (saved.sections ?? []).find(s => s.pageIds.includes(pageId));
  const idxBefore = sectionBefore ? sectionBefore.pageIds.indexOf(pageId) : -1;
  const preferredFallbackId =
    idxBefore >= 0 && sectionBefore
      ? sectionBefore.pageIds[idxBefore + 1] ?? sectionBefore.pageIds[idxBefore - 1]
      : undefined;

  const pages = (saved.pages ?? []).filter(p => p.id !== pageId);
  const sections = (saved.sections ?? []).map(s => ({
    ...s,
    pageIds: s.pageIds.filter(id => id !== pageId),
  }));

  const withoutPage = {
    ...saved,
    pages,
    sections,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
  } as T;
  const nextActive = resolveActiveAfterDelete(withoutPage, pageId, preferredFallbackId);
  return {
    content: { ...withoutPage, ...nextActive } as T,
    deletedInkKeys,
  };
}

/** Reorder pages within a section (section.pageIds is authoritative). */
export function reorderNotebookPagesInSection<T extends NotebookContentWithPages>(
  content: T,
  sectionId: string,
  orderedPageIds: string[],
): T {
  const migrated = migrateLegacyNotebook(content);
  const section = (migrated.sections ?? []).find(s => s.id === sectionId);
  if (!section) return migrated;
  const known = new Set(section.pageIds);
  if (
    orderedPageIds.length !== section.pageIds.length ||
    !orderedPageIds.every(id => known.has(id))
  ) {
    return migrated;
  }
  const sections = (migrated.sections ?? []).map(s =>
    s.id === sectionId ? { ...s, pageIds: [...orderedPageIds] } : s,
  );
  return { ...migrated, sections, schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1 } as T;
}
