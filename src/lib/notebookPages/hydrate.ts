import { PAGE_INK_BLOCK_KEY } from '../handwritingTypes';
import { isNotebookV1PagesEnabled } from './featureFlag';
import {
  LEGACY_DEFAULT_PAGE_ID,
  LEGACY_DEFAULT_PAGE_TITLE,
  LEGACY_DEFAULT_SECTION_ID,
  LEGACY_DEFAULT_SECTION_TITLE,
  NOTEBOOK_SCHEMA_VERSION_V1,
  type NotebookContentWithPages,
  type NotebookPage,
  type NotebookPageKind,
  type NotebookPagesFields,
  type NotebookSection,
} from './types';

export type { NotebookContentWithPages, NotebookPage, NotebookSection, NotebookPagesFields };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function sanitizeNotebookSection(raw: unknown): NotebookSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.id) || !isNonEmptyString(r.title)) return null;
  const pageIdsRaw = Array.isArray(r.pageIds) ? r.pageIds : [];
  const pageIds = pageIdsRaw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return {
    id: r.id,
    title: r.title,
    pageIds,
    ...(r.isScratchSection === true ? { isScratchSection: true } : {}),
  };
}

export function sanitizeNotebookPage(raw: unknown): NotebookPage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.id) || !isNonEmptyString(r.sectionId)) return null;
  const kind: NotebookPageKind = r.kind === 'write' ? 'write' : 'document';
  const title = typeof r.title === 'string' && r.title ? r.title : undefined;
  const documentBody = typeof r.documentBody === 'string' ? r.documentBody : undefined;
  const inkPageKey = typeof r.inkPageKey === 'string' && r.inkPageKey ? r.inkPageKey : undefined;
  return {
    id: r.id,
    sectionId: r.sectionId,
    kind,
    ...(title !== undefined ? { title } : {}),
    ...(documentBody !== undefined ? { documentBody } : {}),
    ...(inkPageKey !== undefined ? { inkPageKey } : {}),
  };
}

export function sanitizeNotebookPagesFields(raw: Record<string, unknown>): NotebookPagesFields {
  const schemaVersion =
    typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion)
      ? Math.floor(raw.schemaVersion)
      : undefined;
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : [];
  const pagesRaw = Array.isArray(raw.pages) ? raw.pages : [];
  const sections = sectionsRaw
    .map(sanitizeNotebookSection)
    .filter((s): s is NotebookSection => s !== null);
  const pages = pagesRaw
    .map(sanitizeNotebookPage)
    .filter((p): p is NotebookPage => p !== null);
  const activeSectionId =
    typeof raw.activeSectionId === 'string' && raw.activeSectionId ? raw.activeSectionId : undefined;
  const activePageId =
    typeof raw.activePageId === 'string' && raw.activePageId ? raw.activePageId : undefined;
  return {
    ...(schemaVersion !== undefined ? { schemaVersion } : {}),
    ...(sections.length > 0 ? { sections } : {}),
    ...(pages.length > 0 ? { pages } : {}),
    ...(activeSectionId !== undefined ? { activeSectionId } : {}),
    ...(activePageId !== undefined ? { activePageId } : {}),
  };
}

function hasValidV1Pages(content: NotebookPagesFields): boolean {
  const sections = content.sections ?? [];
  const pages = content.pages ?? [];
  if (sections.length === 0 || pages.length === 0) return false;
  if (!content.activeSectionId || !content.activePageId) return false;
  const section = sections.find(s => s.id === content.activeSectionId);
  const page = pages.find(p => p.id === content.activePageId);
  if (!section || !page) return false;
  if (page.sectionId !== section.id) return false;
  return section.pageIds.includes(page.id);
}

function findActivePage(content: NotebookPagesFields): NotebookPage | null {
  if (!content.activePageId) return null;
  return (content.pages ?? []).find(p => p.id === content.activePageId) ?? null;
}

function withPageDocumentBody(
  content: NotebookContentWithPages,
  pageId: string,
  documentBody: string,
): NotebookContentWithPages {
  const pages = (content.pages ?? []).map(p =>
    p.id === pageId && p.kind === 'document' ? { ...p, documentBody } : p,
  );
  return { ...content, pages };
}

/** Map a page record to the legacy `body` string the UI reads in Phase 1. */
export function serializePageToBody(page: NotebookPage, legacyBody = ''): string {
  if (page.kind === 'document') return page.documentBody ?? legacyBody;
  return legacyBody;
}

function defaultPageKind(writingMode: NotebookContentWithPages['writingMode']): NotebookPageKind {
  return writingMode === 'ink' ? 'write' : 'document';
}

function buildLegacyDefaultPages(content: NotebookContentWithPages): NotebookContentWithPages {
  const body = content.body ?? '';
  const kind = defaultPageKind(content.writingMode);
  const page: NotebookPage =
    kind === 'write'
      ? {
          id: LEGACY_DEFAULT_PAGE_ID,
          sectionId: LEGACY_DEFAULT_SECTION_ID,
          kind: 'write',
          title: LEGACY_DEFAULT_PAGE_TITLE,
          inkPageKey: PAGE_INK_BLOCK_KEY,
        }
      : {
          id: LEGACY_DEFAULT_PAGE_ID,
          sectionId: LEGACY_DEFAULT_SECTION_ID,
          kind: 'document',
          title: LEGACY_DEFAULT_PAGE_TITLE,
          documentBody: body,
        };
  const section: NotebookSection = {
    id: LEGACY_DEFAULT_SECTION_ID,
    title: LEGACY_DEFAULT_SECTION_TITLE,
    pageIds: [LEGACY_DEFAULT_PAGE_ID],
  };
  return {
    ...content,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
    sections: [section],
    pages: [page],
    activeSectionId: LEGACY_DEFAULT_SECTION_ID,
    activePageId: LEGACY_DEFAULT_PAGE_ID,
  };
}

/** One-time legacy shape → Section "Notes" / Page 1. Idempotent when V1 pages already valid. */
export function migrateLegacyNotebook<T extends NotebookContentWithPages>(content: T): T {
  if (hasValidV1Pages(content)) {
    return syncBodyOntoActiveDocumentPage(content);
  }
  return syncBodyOntoActiveDocumentPage(buildLegacyDefaultPages(content) as T);
}

/** Phase 1: legacy `body` is UI source of truth; mirror onto active document page. */
function syncBodyOntoActiveDocumentPage<T extends NotebookContentWithPages>(content: T): T {
  const activePage = findActivePage(content);
  if (!activePage || activePage.kind !== 'document') return content;
  const body = content.body ?? '';
  if ((activePage.documentBody ?? '') === body) return content;
  return withPageDocumentBody(content, activePage.id, body) as T;
}

/** Dual-read: ensure pages exist and `body` reflects the active page (document pages only). */
export function hydrateNotebookPages<T extends NotebookContentWithPages>(content: T): T {
  if (!isNotebookV1PagesEnabled()) return content;
  const migrated = migrateLegacyNotebook(content);
  const activePage = findActivePage(migrated);
  if (!activePage) return migrated;
  const body = serializePageToBody(activePage, migrated.body ?? '');
  if (body === (migrated.body ?? '')) return migrated;
  return { ...migrated, body } as T;
}

/** Dual-write: persist `body` onto active document page while keeping legacy body field. */
export function dualWriteNotebookPages<T extends NotebookContentWithPages>(content: T): T {
  if (!isNotebookV1PagesEnabled()) return content;
  const migrated = migrateLegacyNotebook(content);
  return syncBodyOntoActiveDocumentPage({
    ...migrated,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
    body: content.body ?? '',
  }) as T;
}

/** Persist hook for notebook editors — applies dual-write when the flag is on. */
export function applyNotebookPersist<T extends NotebookContentWithPages>(content: T): T {
  return dualWriteNotebookPages(content);
}
