import { PAGE_INK_BLOCK_KEY } from '../handwritingTypes';
import { inkPageKeyForNotebookPage } from './inkPageKey';
import { isNotebookV1PagesEnabled } from './featureFlag';
import { nbSyncDiagLog, nbSyncDiagSummarizeContent } from './nbSyncDiag';
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
  const linkedPdfObjectId =
    typeof r.linkedPdfObjectId === 'string' && r.linkedPdfObjectId ? r.linkedPdfObjectId : undefined;
  return {
    id: r.id,
    sectionId: r.sectionId,
    kind,
    ...(title !== undefined ? { title } : {}),
    ...(documentBody !== undefined ? { documentBody } : {}),
    ...(inkPageKey !== undefined ? { inkPageKey } : {}),
    ...(linkedPdfObjectId !== undefined ? { linkedPdfObjectId } : {}),
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
  if (content.schemaVersion !== NOTEBOOK_SCHEMA_VERSION_V1) return false;
  for (const section of sections) {
    for (const pageId of section.pageIds) {
      const page = pages.find(p => p.id === pageId);
      if (!page || page.sectionId !== section.id) return false;
    }
  }
  return true;
}

export function findActivePage(content: NotebookPagesFields): NotebookPage | null {
  if (!content.activePageId) return null;
  return (content.pages ?? []).find(p => p.id === content.activePageId) ?? null;
}

/** First page in first section — used when cloud omits device-local navigation fields. */
export function resolveDefaultNavigation(content: NotebookPagesFields): {
  activeSectionId: string;
  activePageId: string;
} | null {
  const sections = content.sections ?? [];
  if (sections.length === 0) return null;
  const section = sections[0]!;
  const pageId = section.pageIds[0];
  if (!pageId) return null;
  const page = (content.pages ?? []).find(p => p.id === pageId);
  if (!page) return null;
  return { activeSectionId: section.id, activePageId: pageId };
}

export function resolvePageForBodyProjection(content: NotebookPagesFields): NotebookPage | null {
  const direct = findActivePage(content);
  if (direct) return direct;
  const nav = resolveDefaultNavigation(content);
  if (!nav) return null;
  return (content.pages ?? []).find(p => p.id === nav.activePageId) ?? null;
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

/** Map a page record to the legacy `body` string the UI reads. */
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

function ensureWritePageInkKeys<T extends NotebookContentWithPages>(content: T): T {
  const pages = content.pages ?? [];
  let changed = false;
  const nextPages = pages.map(p => {
    if (p.kind !== 'write') return p;
    const key = inkPageKeyForNotebookPage(p);
    if (p.inkPageKey === key) return p;
    changed = true;
    return { ...p, inkPageKey: key };
  });
  if (!changed) return content;
  return { ...content, pages: nextPages } as T;
}

/** Derive legacy `body` from active (or first) document page — never overwrites documentBody. */
export function deriveBodyFromActivePage<T extends NotebookContentWithPages>(content: T): T {
  const page = resolvePageForBodyProjection(content);
  if (!page) return content;
  const body = serializePageToBody(page, content.body ?? '');
  if (body === (content.body ?? '')) return content;
  return { ...content, body } as T;
}

/** One-time legacy shape → Section "Notes" / Page 1. Idempotent when V1 pages already valid. */
export function migrateLegacyNotebook<T extends NotebookContentWithPages>(content: T): T {
  if (hasValidV1Pages(content)) {
    return deriveBodyFromActivePage(ensureWritePageInkKeys(content));
  }
  const migrated = buildLegacyDefaultPages(content) as T;
  return deriveBodyFromActivePage(ensureWritePageInkKeys(migrated));
}

/** Dual-read: ensure pages exist; derive `body` from active document page. */
export function hydrateNotebookPages<T extends NotebookContentWithPages>(
  content: T,
  ctx?: { objectId?: string; sectionId?: string; boardId?: string },
): T {
  if (!isNotebookV1PagesEnabled()) return content;
  nbSyncDiagLog('I_hydrate_input', {
    objectId: ctx?.objectId,
    sectionId: ctx?.sectionId,
    boardId: ctx?.boardId,
  }, { content: nbSyncDiagSummarizeContent(content) });
  const out = migrateLegacyNotebook(content);
  nbSyncDiagLog('J_hydrate_output', {
    objectId: ctx?.objectId,
    sectionId: ctx?.sectionId,
    boardId: ctx?.boardId,
  }, { content: nbSyncDiagSummarizeContent(out) });
  return out;
}

/**
 * Write editor body onto active document page; documentBody is authoritative.
 * `body` is a derived projection for the active page editor.
 */
export function dualWriteNotebookPages<T extends NotebookContentWithPages>(content: T): T {
  if (!isNotebookV1PagesEnabled()) return content;
  const migrated = migrateLegacyNotebook(content);
  const editorPage = findActivePage(migrated) ?? resolvePageForBodyProjection(migrated);
  if (!editorPage || editorPage.kind !== 'document') {
    return { ...migrated, schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1 } as T;
  }
  const editorBody = content.body ?? '';
  if ((editorPage.documentBody ?? '') === editorBody) {
    return { ...migrated, schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1, body: editorBody } as T;
  }
  return {
    ...withPageDocumentBody(migrated, editorPage.id, editorBody),
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
    body: editorBody,
  } as T;
}

/** Persist hook for notebook editors — dual-write when V1 pages enabled. */
export function applyNotebookPersist<T extends NotebookContentWithPages>(content: T): T {
  return dualWriteNotebookPages(content);
}
