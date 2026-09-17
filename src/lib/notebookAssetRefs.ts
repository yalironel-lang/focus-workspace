/**
 * M7.5C1 — Multi-page Notebook asset reference discovery for live orphan GC.
 *
 * Canonical LIVE source: every surviving page's documentBody (+ write-page ink keys).
 * Active content.body alone is never sufficient.
 *
 * Optional `extra*` slots are reserved for M7.5C2 recoverable page tombstones —
 * pass keys from collectAssetKeysFromNotebookPageTombstones without rewriting this collector.
 */

import type { NotebookPage } from './notebookPages/types';
import { referencedNotebookImageKeys } from './notebookImageRefs';
import { referencedHandwritingKeys, PAGE_INK_BLOCK_KEY } from './handwritingTypes';
import { collectNotebookPageInkKeys } from './notebookPages/inkPageKey';

function addKeys(into: Set<string>, keys: readonly string[] | undefined): void {
  if (!keys) return;
  for (const k of keys) {
    if (k) into.add(k);
  }
}

function documentBodiesFromPages(pages: readonly NotebookPage[] | null | undefined): string[] {
  if (!pages?.length) return [];
  const bodies: string[] = [];
  for (const page of pages) {
    if (page.kind !== 'document') continue;
    if (typeof page.documentBody === 'string' && page.documentBody.length > 0) {
      bodies.push(page.documentBody);
    }
  }
  return bodies;
}

/**
 * Image keys referenced by ANY surviving document page, plus optional live/active
 * unflushed representation and future tombstone extras.
 */
export function collectNotebookReferencedImageKeys(input: {
  pages?: readonly NotebookPage[] | null;
  /** Active projection or TipTap live body — never the sole authority. */
  liveBody?: string | null;
  /** CE / live block image-ref keys for the active editor surface. */
  liveBlockImageKeys?: readonly string[];
  /** Reserved for M7.5C2 recoverable page tombstone refs. */
  extraImageKeys?: readonly string[];
}): string[] {
  const keys = new Set<string>();
  for (const body of documentBodiesFromPages(input.pages)) {
    addKeys(keys, referencedNotebookImageKeys(body));
  }
  if (typeof input.liveBody === 'string' && input.liveBody.length > 0) {
    addKeys(keys, referencedNotebookImageKeys(input.liveBody));
  }
  addKeys(keys, input.liveBlockImageKeys);
  addKeys(keys, input.extraImageKeys);
  return [...keys];
}

/**
 * Handwriting keys: inline ::hw:: across all document pages + write-page ink keys
 * + optional live/active unflushed refs + future tombstone extras.
 */
export function collectNotebookReferencedHandwritingKeys(input: {
  pages?: readonly NotebookPage[] | null;
  liveBody?: string | null;
  liveBlockHandwritingKeys?: readonly string[];
  /**
   * Binder / multi-page: collect ink keys from all write pages.
   * Legacy single-surface: only the shared PAGE_INK_BLOCK_KEY.
   */
  includeAllPageInkKeys?: boolean;
  /** Reserved for M7.5C2 recoverable page tombstone refs. */
  extraHandwritingKeys?: readonly string[];
}): string[] {
  const keys = new Set<string>();
  for (const body of documentBodiesFromPages(input.pages)) {
    addKeys(keys, referencedHandwritingKeys(body));
  }
  if (typeof input.liveBody === 'string' && input.liveBody.length > 0) {
    addKeys(keys, referencedHandwritingKeys(input.liveBody));
  }
  addKeys(keys, input.liveBlockHandwritingKeys);
  if (input.includeAllPageInkKeys) {
    addKeys(keys, collectNotebookPageInkKeys(input.pages as NotebookPage[] | undefined));
  } else {
    keys.add(PAGE_INK_BLOCK_KEY);
  }
  addKeys(keys, input.extraHandwritingKeys);
  return [...keys];
}
