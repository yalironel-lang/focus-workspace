/**
 * M7.7 — Authoritative Notebook asset GC root resolution.
 *
 * Invariant: GC must never run against live pages alone while recoverable
 * notebook_page tombstone refs are unresolved. Fail-safe = keep the asset.
 */

import type { NotebookPage } from './notebookPages/types';
import {
  collectNotebookReferencedHandwritingKeys,
  collectNotebookReferencedImageKeys,
} from './notebookAssetRefs';
import { collectAssetKeysFromNotebookPageTombstones } from './knowledge/notebookPageRecovery';
import { listTombstones } from './knowledge/tombstoneStore';
import type { KnowledgeTombstone } from './knowledge/knowledgeTypes';

export type NotebookGcRefsResolution =
  | {
      ok: true;
      imageKeys: string[];
      handwritingKeys: string[];
    }
  | {
      ok: false;
      reason: 'missing_identity' | 'unresolved';
    };

export type ResolveNotebookGcReferencedKeysInput = {
  sectionId: string | null | undefined;
  objectId: string | null | undefined;
  pages?: readonly NotebookPage[] | null;
  liveBody?: string | null;
  liveBlockImageKeys?: readonly string[];
  liveBlockHandwritingKeys?: readonly string[];
  includeAllPageInkKeys?: boolean;
  /** Test seam — defaults to tombstoneStore.listTombstones. */
  listTombstonesFn?: (sectionId?: string) => Promise<KnowledgeTombstone[]>;
};

/**
 * Await recoverable tombstone refs, then union with live page refs.
 * Returns `{ ok: false }` when identity is missing or listing fails —
 * callers MUST refuse GC (keep assets) in that case.
 */
export async function resolveNotebookGcReferencedKeys(
  input: ResolveNotebookGcReferencedKeysInput,
): Promise<NotebookGcRefsResolution> {
  const sectionId = input.sectionId?.trim() || '';
  const objectId = input.objectId?.trim() || '';
  if (!sectionId || !objectId) {
    return { ok: false, reason: 'missing_identity' };
  }

  let rows: KnowledgeTombstone[];
  try {
    const list = input.listTombstonesFn ?? listTombstones;
    rows = await list(sectionId);
  } catch {
    return { ok: false, reason: 'unresolved' };
  }

  const extras = collectAssetKeysFromNotebookPageTombstones(rows, objectId);
  return {
    ok: true,
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
