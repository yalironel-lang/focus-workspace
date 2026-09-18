/**
 * M7.5C2 — Safe Notebook page soft-delete + restore helpers (no product UI).
 */

import type { NotebookContentWithPages, NotebookPage } from '../notebookPages/types';
import { migrateLegacyNotebook } from '../notebookPages/hydrate';
import { deleteNotebookPage, saveNotebookPageBody } from '../notebookPages/operations';
import { inkPageKeyForNotebookPage } from '../notebookPages/inkPageKey';
import { notebookPagePresentationsEqual } from '../notebookPages/pagePresentation';
import { referencedNotebookImageKeys } from '../notebookImageRefs';
import { referencedHandwritingKeys } from '../handwritingTypes';
import {
  collectNotebookReferencedHandwritingKeys,
  collectNotebookReferencedImageKeys,
} from '../notebookAssetRefs';
import type { KnowledgeTombstone, NotebookPageTombstone } from './knowledgeTypes';
import { writeNotebookPageTombstone } from './tombstoneStore';

export type SoftDeleteNotebookPageCode =
  | 'LAST_PAGE'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'TOMBSTONE_FAILED';

export type SoftDeleteNotebookPageResult =
  | {
      ok: true;
      content: NotebookContentWithPages;
      tombstone: NotebookPageTombstone;
    }
  | {
      ok: false;
      code: SoftDeleteNotebookPageCode;
      reason: string;
      content: NotebookContentWithPages;
    };

/**
 * Equivalence for idempotent page restore.
 * Compares persisted NotebookPage semantics: id, sectionId, kind, title,
 * documentBody + codec (document), inkPageKey + linkedPdfObjectId (write),
 * and presentation (paper/layout overrides).
 * Does not invent timestamps — NotebookPage has none.
 */
export function isEquivalentNotebookPage(a: NotebookPage, b: NotebookPage): boolean {
  if (a.id !== b.id || a.sectionId !== b.sectionId || a.kind !== b.kind) return false;
  const titleA = (a.title ?? '').trim();
  const titleB = (b.title ?? '').trim();
  if (titleA !== titleB) return false;
  if (!notebookPagePresentationsEqual(a.presentation, b.presentation)) return false;
  if (a.kind === 'document' && b.kind === 'document') {
    if ((a.documentBody ?? '') !== (b.documentBody ?? '')) return false;
    if (a.documentBodyCodecVersion !== b.documentBodyCodecVersion) return false;
    return true;
  }
  if (a.kind === 'write' && b.kind === 'write') {
    if (inkPageKeyForNotebookPage(a) !== inkPageKeyForNotebookPage(b)) return false;
    if ((a.linkedPdfObjectId ?? null) !== (b.linkedPdfObjectId ?? null)) return false;
    return true;
  }
  return false;
}

/** Snapshot a page for tombstone storage without re-encoding documentBody. */
export function snapshotNotebookPageForTombstone(page: NotebookPage): NotebookPage {
  // Structured clone via JSON keeps plain data lossless and strips non-enumerables.
  return JSON.parse(JSON.stringify(page)) as NotebookPage;
}

export function collectAssetKeysFromNotebookPageSnapshot(page: NotebookPage): {
  imageKeys: string[];
  handwritingKeys: string[];
} {
  if (page.kind === 'document') {
    const body = page.documentBody ?? '';
    return {
      imageKeys: referencedNotebookImageKeys(body),
      handwritingKeys: referencedHandwritingKeys(body),
    };
  }
  const ink = inkPageKeyForNotebookPage(page);
  return {
    imageKeys: [],
    handwritingKeys: ink ? [ink] : [],
  };
}

/** Union image/HW keys from recoverable notebook_page tombstones for one Notebook. */
export function collectAssetKeysFromNotebookPageTombstones(
  tombstones: readonly KnowledgeTombstone[],
  objectId: string,
): { imageKeys: string[]; handwritingKeys: string[] } {
  const imageKeys = new Set<string>();
  const handwritingKeys = new Set<string>();
  for (const t of tombstones) {
    if (t.kind !== 'notebook_page' || t.objectId !== objectId) continue;
    const keys = collectAssetKeysFromNotebookPageSnapshot(t.page);
    for (const k of keys.imageKeys) imageKeys.add(k);
    for (const k of keys.handwritingKeys) handwritingKeys.add(k);
  }
  return { imageKeys: [...imageKeys], handwritingKeys: [...handwritingKeys] };
}

/**
 * Safe soft-delete: tombstone FIRST (verified), then mutate Notebook content.
 * Does not write Free Space itself — caller persists `content` via existing SOT path.
 */
export async function softDeleteNotebookPage(input: {
  content: NotebookContentWithPages;
  pageId: string;
  currentBody: string;
  currentCodecVersion?: number;
  /** Free Space workspace section (tombstone index). */
  sectionId: string;
  boardId: string;
  objectId: string;
  objectTitle: string;
}): Promise<SoftDeleteNotebookPageResult> {
  const migrated = migrateLegacyNotebook(input.content);
  if (!input.sectionId || !input.objectId || !input.pageId) {
    return {
      ok: false,
      code: 'INVALID',
      reason: 'Missing notebook or page identity for safe delete.',
      content: migrated,
    };
  }

  const saved = saveNotebookPageBody(
    migrated,
    input.currentBody,
    input.currentCodecVersion,
  );
  const pages = saved.pages ?? [];
  if (pages.length <= 1) {
    return {
      ok: false,
      code: 'LAST_PAGE',
      reason: 'A notebook must contain at least one page.',
      content: saved,
    };
  }

  const page = pages.find(p => p.id === input.pageId);
  if (!page) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      reason: 'That page is no longer in this notebook.',
      content: saved,
    };
  }

  const section = (saved.sections ?? []).find(s => s.id === page.sectionId);
  const indexInSection = section ? section.pageIds.indexOf(page.id) : 0;
  const pageSnapshot = snapshotNotebookPageForTombstone(page);

  const written = await writeNotebookPageTombstone({
    sectionId: input.sectionId,
    boardId: input.boardId || 'main',
    objectId: input.objectId,
    objectTitle: input.objectTitle || 'Notebook',
    page: pageSnapshot,
    indexInSection: indexInSection >= 0 ? indexInSection : 0,
    sectionIdOfPage: page.sectionId,
  });
  if (!written.ok) {
    return {
      ok: false,
      code: 'TOMBSTONE_FAILED',
      reason: written.reason,
      content: saved,
    };
  }

  // Tombstone is durable — now remove from live Notebook.
  const { content: next } = deleteNotebookPage(
    saved,
    input.pageId,
    saved.body ?? '',
    saved.bodyCodecVersion,
  );

  return { ok: true, content: next, tombstone: written.tombstone };
}

/** Convenience: live notebook refs ∪ recoverable page-tombstone refs. */
export function collectNotebookLiveAndRecoverableAssetKeys(input: {
  pages?: readonly NotebookPage[] | null;
  liveBody?: string | null;
  liveBlockImageKeys?: readonly string[];
  liveBlockHandwritingKeys?: readonly string[];
  includeAllPageInkKeys?: boolean;
  pageTombstones?: readonly KnowledgeTombstone[];
  objectId?: string;
}): { imageKeys: string[]; handwritingKeys: string[] } {
  const extras =
    input.pageTombstones && input.objectId
      ? collectAssetKeysFromNotebookPageTombstones(input.pageTombstones, input.objectId)
      : { imageKeys: [] as string[], handwritingKeys: [] as string[] };
  return {
    imageKeys: collectNotebookReferencedImageKeys({
      pages: input.pages,
      liveBody: input.liveBody,
      liveBlockImageKeys: input.liveBlockImageKeys,
      extraImageKeys: extras.imageKeys,
    }),
    handwritingKeys: collectNotebookReferencedHandwritingKeys({
      pages: input.pages,
      liveBody: input.liveBody,
      liveBlockHandwritingKeys: input.liveBlockHandwritingKeys,
      includeAllPageInkKeys: input.includeAllPageInkKeys,
      extraHandwritingKeys: extras.handwritingKeys,
    }),
  };
}
