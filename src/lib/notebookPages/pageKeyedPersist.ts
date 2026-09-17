/**
 * M7.5C2 / page isolation — pageKey-targeted TipTap → Notebook persist bridge.
 *
 * Invariant: a body may ONLY be written into the page whose pageKey produced it.
 * Never infer the write target from mutable activePageId when processing an emission.
 */

import type { NotebookContentWithPages } from './types';
import { NOTEBOOK_SCHEMA_VERSION_V1 } from './types';
import {
  findActivePage,
  migrateLegacyNotebook,
  resolvePageForBodyProjection,
} from './hydrate';
import {
  notebookPageBodyProjection,
  replaceNotebookBodyProjection,
  replaceNotebookPageBody,
  type NotebookBodyRepresentation,
} from './bodyCodec';

export type PageKeyedBodyEmission = {
  pageKey: string;
  body: string;
  codecVersion?: number;
};

export type NotebookLiveRepresentation = PageKeyedBodyEmission;

/**
 * LEGACY / buggy shell shape (pre pageKey contract).
 * Demonstrates the real-app corruption: live body from B + activePageId A → A overwritten.
 * Not used by product code — kept for regression proof only.
 */
export function applyActivePageTargetedUserEdit<T extends NotebookContentWithPages>(
  content: T,
  body: string,
  codecVersion: number | undefined,
  mutableActivePageId: string,
): T {
  const migrated = migrateLegacyNotebook(content);
  const withActive = {
    ...migrated,
    activePageId: mutableActivePageId,
    body,
    ...(codecVersion !== undefined ? { bodyCodecVersion: codecVersion } : {}),
  } as T;
  const rep: NotebookBodyRepresentation = {
    body,
    ...(codecVersion !== undefined ? { codecVersion } : {}),
  };
  // dual-write into whatever activePageId currently is — THE BUG
  const pages = (withActive.pages ?? []).map(p => {
    if (p.id !== mutableActivePageId || p.kind !== 'document') return p;
    return replaceNotebookPageBody(p, rep);
  });
  return {
    ...withActive,
    pages,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
  } as T;
}

/**
 * Apply a TipTap user-edit emission into the Notebook.
 * Writes ONLY into emission.pageKey. Active projection updates only when that page is active.
 */
export function applyPageKeyedUserEdit<T extends NotebookContentWithPages>(
  content: T,
  emission: PageKeyedBodyEmission,
): T {
  const migrated = migrateLegacyNotebook(content);
  const { pageKey, body, codecVersion } = emission;
  if (!pageKey) return migrated;

  const target = (migrated.pages ?? []).find(p => p.id === pageKey);
  if (!target || target.kind !== 'document') {
    // Fail closed: do not invent a page or write into active.
    return migrated;
  }

  const rep: NotebookBodyRepresentation = {
    body,
    ...(codecVersion !== undefined ? { codecVersion } : {}),
  };
  const pages = (migrated.pages ?? []).map(p =>
    p.id === pageKey && p.kind === 'document' ? replaceNotebookPageBody(p, rep) : p,
  );

  const next = {
    ...migrated,
    pages,
    schemaVersion: NOTEBOOK_SCHEMA_VERSION_V1,
  } as T;

  if (next.activePageId === pageKey) {
    return replaceNotebookBodyProjection(next, {
      body,
      ...(codecVersion !== undefined ? { bodyCodecVersion: codecVersion } : {}),
    });
  }

  // Keep active page's authoritative projection (do not clobber top-level body with B while on A).
  const active = findActivePage(next) ?? resolvePageForBodyProjection(next);
  if (active?.kind === 'document') {
    return replaceNotebookBodyProjection(next, notebookPageBodyProjection(active));
  }
  return next;
}

export type SwitchFlushResult =
  | { ok: true; body: string; codecVersion?: number; source: 'live' | 'authoritative' }
  | { ok: false; reason: 'PAGEKEY_MISMATCH'; body: string; codecVersion?: number };

/**
 * Body to flush for the page being left during navigation.
 * If live representation belongs to a different pageKey, skip the stale live body
 * and use the authoritative stored documentBody for the page being flushed.
 */
export function resolveSwitchFlushRepresentation(
  content: NotebookContentWithPages,
  pageBeingFlushed: string,
  live: NotebookLiveRepresentation | null | undefined,
): SwitchFlushResult {
  const migrated = migrateLegacyNotebook(content);
  const page = (migrated.pages ?? []).find(p => p.id === pageBeingFlushed);
  const authoritative: NotebookBodyRepresentation =
    page?.kind === 'document'
      ? {
          body: page.documentBody ?? '',
          ...(page.documentBodyCodecVersion !== undefined
            ? { codecVersion: page.documentBodyCodecVersion }
            : {}),
        }
      : { body: migrated.body ?? '', ...(migrated.bodyCodecVersion !== undefined ? { codecVersion: migrated.bodyCodecVersion } : {}) };

  if (!live) {
    return {
      ok: true,
      body: authoritative.body,
      ...(authoritative.codecVersion !== undefined ? { codecVersion: authoritative.codecVersion } : {}),
      source: 'authoritative',
    };
  }

  if (live.pageKey !== pageBeingFlushed) {
    // Fail safe: never cross-write B's live body into A.
    return {
      ok: false,
      reason: 'PAGEKEY_MISMATCH',
      body: authoritative.body,
      ...(authoritative.codecVersion !== undefined ? { codecVersion: authoritative.codecVersion } : {}),
    };
  }

  return {
    ok: true,
    body: live.body,
    ...(live.codecVersion !== undefined ? { codecVersion: live.codecVersion } : {}),
    source: 'live',
  };
}

/** Shell helper: switch page using a pageKey-safe flush for the page being left. */
export function switchNotebookPageWithSafeFlush<T extends NotebookContentWithPages>(
  content: T,
  toPageId: string,
  live: NotebookLiveRepresentation | null | undefined,
  switchFn: (
    content: T,
    pageId: string,
    currentBody: string,
    currentCodecVersion?: number,
  ) => T,
): T {
  const pageBeingFlushed = content.activePageId ?? '';
  const flush = resolveSwitchFlushRepresentation(content, pageBeingFlushed, live);
  return switchFn(content, toPageId, flush.body, flush.codecVersion);
}
