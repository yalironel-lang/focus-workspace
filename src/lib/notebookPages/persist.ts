import { notebookPageBodyProjection, replaceNotebookBodyProjection } from './bodyCodec';
import { resolvePageForBodyProjection } from './hydrate';
import { sanitizeNotebookPagePresentation } from './pagePresentation';
import type { NotebookContentWithPages, NotebookPage, NotebookSection } from './types';

/** Stable fingerprint of persisted notebook manifest (excludes navigation + derived body). */
export function notebookManifestFingerprint(content: NotebookContentWithPages): string {
  const pages = (content.pages ?? []).map(pageFingerprint);
  const sections = (content.sections ?? []).map(sectionFingerprint);
  pages.sort((a, b) => a.id.localeCompare(b.id));
  sections.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    schemaVersion: content.schemaVersion ?? null,
    sections,
    pages,
    writingMode: content.writingMode ?? null,
  });
}

function sectionFingerprint(s: NotebookSection): { id: string; title: string; pageIds: string[] } {
  return { id: s.id, title: s.title, pageIds: [...s.pageIds] };
}

function pageFingerprint(p: NotebookPage): {
  id: string;
  sectionId: string;
  kind: string;
  title: string | null;
  documentBody: string | null;
  documentBodyCodecVersion?: number;
  inkPageKey: string | null;
  linkedPdfObjectId: string | null;
  presentation: ReturnType<typeof sanitizeNotebookPagePresentation> | null;
} {
  const presentation = sanitizeNotebookPagePresentation(p.presentation) ?? null;
  return {
    id: p.id,
    sectionId: p.sectionId,
    kind: p.kind,
    title: p.title ?? null,
    documentBody: p.documentBody ?? null,
    ...(p.documentBodyCodecVersion !== undefined ? { documentBodyCodecVersion: p.documentBodyCodecVersion } : {}),
    inkPageKey: p.inkPageKey ?? null,
    linkedPdfObjectId: p.linkedPdfObjectId ?? null,
    presentation,
  };
}

export function notebookManifestChanged(
  before: NotebookContentWithPages,
  after: NotebookContentWithPages,
): boolean {
  return notebookManifestFingerprint(before) !== notebookManifestFingerprint(after);
}

/** Cloud payload: manifest authoritative; body is compat projection of active document page. */
export function prepareNotebookForCloudPersist<T extends NotebookContentWithPages>(
  content: T,
  activePageId?: string | null,
): T {
  const pageId = activePageId ?? content.activePageId ?? null;
  const activePage =
    (pageId ? (content.pages ?? []).find(p => p.id === pageId) ?? null : null) ??
    resolvePageForBodyProjection(content);
  const projection = activePage ? notebookPageBodyProjection(activePage, content) : { body: content.body, bodyCodecVersion: content.bodyCodecVersion };
  const { activeSectionId: _s, activePageId: _p, ...rest } = content;
  return replaceNotebookBodyProjection(rest as T, projection);
}
