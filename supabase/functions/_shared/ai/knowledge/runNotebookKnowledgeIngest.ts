/**
 * M0.8C — Notebook page knowledge ingest (extract + hash + chunk + version lifecycle).
 *
 * NO embeddings. NO TipTap. NO client body authority.
 *
 * Flow:
 *   auth → validate request → load FSO page → extract → hash
 *   → begin_notebook_page_ingest
 *   → reused? return
 *   → chunk → finalize_ingest(ready)
 *   → on blank with prior READY: invalidate retrieval (clear searchable old text)
 *   → on extract failure: finalize failed (preserves prior READY when present)
 */

import { KNOWLEDGE_MAX_CHUNKS, KNOWLEDGE_MIN_DOCUMENT_CHARS } from './bounds.ts';
import { chunkNotebookSegments } from './chunkNotebookSegments.ts';
import { extractNotebookPageSemantics } from './extractNotebookPage.ts';
import { sha256HexUtf8 } from './hash.ts';
import {
  loadNotebookPageFromFsoObject,
  type LoadNotebookPageFailureCode,
} from './loadNotebookPageSource.ts';
import type { KnowledgeChunk } from './chunkPages.ts';
import type {
  NotebookKnowledgeErrorCode,
  NotebookKnowledgeIngestRequest,
  NotebookKnowledgeIngestResponse,
} from './notebookTypes.ts';
import type { BeginIngestResult, FinalizeIngestResult } from './runKnowledgeIngest.ts';

export type NotebookBeginIngestResult = BeginIngestResult & {
  retrieval_source_version?: number | null;
};

export type InvalidateNotebookResult = {
  ok: boolean;
  code?: string;
  source_id?: string;
  cleared?: boolean;
};

export type NotebookKnowledgeIngestDeps = {
  loadOwnedNotebookFso: (input: {
    userId: string;
    sectionId: string;
    notebookObjectId: string;
  }) => Promise<
    | {
        ok: true;
        fso: {
          id: string;
          user_id: string;
          section_id: string;
          object: unknown;
        };
      }
    | { ok: false; code: 'not_found' | 'auth_mismatch' | 'not_notebook' }
  >;
  beginNotebookPageIngest: (input: {
    userId: string;
    sectionId: string;
    notebookObjectId: string;
    pageId: string;
    contentHash: string;
  }) => Promise<NotebookBeginIngestResult>;
  finalizeIngest: (input: {
    sourceId: string;
    sourceVersion: number;
    status: 'ready' | 'failed';
    errorCode?: string;
    chunks?: KnowledgeChunk[];
    pageCount?: number;
  }) => Promise<FinalizeIngestResult>;
  /**
   * Blank / no-text invalidation: clear retrieval_source_version so old
   * chunks/embeddings are no longer searchable. Required when a previously
   * indexed page becomes empty.
   */
  invalidateNotebookPageCorpus: (input: {
    userId: string;
    sectionId: string;
    notebookObjectId: string;
    pageId: string;
  }) => Promise<InvalidateNotebookResult>;
};

function fail(
  code: NotebookKnowledgeErrorCode,
  message: string,
): NotebookKnowledgeIngestResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseNotebookKnowledgeIngestRequest(
  body: unknown,
):
  | { ok: true; request: NotebookKnowledgeIngestRequest }
  | { ok: false; code: 'invalid_request' } {
  if (!body || typeof body !== 'object') return { ok: false, code: 'invalid_request' };
  const o = body as Record<string, unknown>;
  if (o.version !== 1) return { ok: false, code: 'invalid_request' };
  if (typeof o.sectionId !== 'string' || !isUuid(o.sectionId)) {
    return { ok: false, code: 'invalid_request' };
  }
  if (typeof o.notebookObjectId !== 'string' || o.notebookObjectId.trim().length === 0) {
    return { ok: false, code: 'invalid_request' };
  }
  if (typeof o.pageId !== 'string' || o.pageId.trim().length === 0) {
    return { ok: false, code: 'invalid_request' };
  }
  if (
    o.notebookObjectId !== o.notebookObjectId.trim() ||
    o.pageId !== o.pageId.trim()
  ) {
    return { ok: false, code: 'invalid_request' };
  }
  // Reject client-supplied authority fields.
  if (
    'userId' in o ||
    'user_id' in o ||
    'contentHash' in o ||
    'documentBody' in o ||
    'chunks' in o ||
    'sourceVersion' in o ||
    'retrieval_source_version' in o ||
    'normalizedText' in o
  ) {
    return { ok: false, code: 'invalid_request' };
  }
  return {
    ok: true,
    request: {
      version: 1,
      sectionId: o.sectionId,
      notebookObjectId: o.notebookObjectId.trim(),
      pageId: o.pageId.trim(),
    },
  };
}

function mapLoadFailure(
  code: LoadNotebookPageFailureCode,
): NotebookKnowledgeErrorCode {
  switch (code) {
    case 'auth_mismatch':
      return 'auth_mismatch';
    case 'not_notebook':
      return 'not_notebook';
    case 'notebook_page_not_found':
      return 'notebook_page_not_found';
    case 'invalid_request':
      return 'invalid_request';
    default:
      return 'not_found';
  }
}

async function finalizeFailedPreserve(
  deps: NotebookKnowledgeIngestDeps,
  sourceId: string,
  sourceVersion: number,
  errorCode: 'extract_failed' | 'too_large' | 'internal_error',
): Promise<void> {
  try {
    await deps.finalizeIngest({
      sourceId,
      sourceVersion,
      status: 'failed',
      errorCode,
    });
  } catch {
    // Best-effort — prior READY remains if finalize fails closed.
  }
}

export async function runNotebookKnowledgeIngest(input: {
  authUserId: string | null;
  body: unknown;
  deps: NotebookKnowledgeIngestDeps;
}): Promise<NotebookKnowledgeIngestResponse> {
  if (!input.authUserId) {
    return fail('unauthenticated', 'Sign in required.');
  }
  const userId = input.authUserId;

  const parsed = parseNotebookKnowledgeIngestRequest(input.body);
  if (!parsed.ok) {
    return fail('invalid_request', 'Invalid notebook knowledge request.');
  }
  const { sectionId, notebookObjectId, pageId } = parsed.request;

  const owned = await input.deps.loadOwnedNotebookFso({
    userId,
    sectionId,
    notebookObjectId,
  });
  if (!owned.ok) {
    if (owned.code === 'not_notebook') {
      return fail('not_notebook', 'Only Notebook Free Space objects can be processed.');
    }
    if (owned.code === 'auth_mismatch') {
      return fail('auth_mismatch', 'You do not own this course object.');
    }
    return fail('not_found', 'Notebook not found.');
  }

  const loaded = loadNotebookPageFromFsoObject({
    userId,
    sectionId,
    notebookObjectId,
    pageId,
    fso: owned.fso,
  });
  if (!loaded.ok) {
    return fail(mapLoadFailure(loaded.code), 'Notebook page is not available.');
  }

  const { page } = loaded;

  // Write / handwriting-only pages with no document body → no extractable text.
  const extracted = extractNotebookPageSemantics({
    documentBody: page.documentBody,
    codecVersion: page.codecVersion,
    pageTitle: page.pageTitle,
  });

  if (!extracted.ok) {
    // Parse/codec failures must NOT clear prior retrieval (preserve last good index).
    if (extracted.code === 'notebook_codec_unsupported') {
      return fail('notebook_codec_unsupported', 'Unsupported Notebook text codec.');
    }
    if (extracted.code === 'notebook_extract_failed') {
      return fail('notebook_extract_failed', 'Could not parse Notebook page content.');
    }
    // no_extractable_text (blank / image-only / handwriting-only / tiny):
    // invalidate so previously indexed text cannot remain searchable.
    const cleared = await input.deps.invalidateNotebookPageCorpus({
      userId,
      sectionId,
      notebookObjectId,
      pageId,
    });
    return {
      version: 1,
      ok: true,
      result: {
        status: 'cleared',
        sourceId: cleared.source_id ?? null,
        sourceVersion: null,
        chunkCount: 0,
        contentChanged: true,
        reused: false,
        retrievalCleared: cleared.cleared === true,
      },
    };
  }

  if (extracted.meaningfulChars < KNOWLEDGE_MIN_DOCUMENT_CHARS) {
    const cleared = await input.deps.invalidateNotebookPageCorpus({
      userId,
      sectionId,
      notebookObjectId,
      pageId,
    });
    return {
      version: 1,
      ok: true,
      result: {
        status: 'cleared',
        sourceId: cleared.source_id ?? null,
        sourceVersion: null,
        chunkCount: 0,
        contentChanged: true,
        reused: false,
        retrievalCleared: cleared.cleared === true,
      },
    };
  }

  const contentHash = await sha256HexUtf8(extracted.normalizedText);

  const begin = await input.deps.beginNotebookPageIngest({
    userId,
    sectionId,
    notebookObjectId,
    pageId,
    contentHash,
  });

  if (!begin.ok || !begin.source_id || begin.source_version == null) {
    const code = (begin.code ?? 'internal_error') as NotebookKnowledgeErrorCode;
    if (
      code === 'auth_mismatch' ||
      code === 'not_found' ||
      code === 'not_notebook' ||
      code === 'notebook_page_not_found' ||
      code === 'invalid_request'
    ) {
      return fail(code, 'Notebook ingest could not start.');
    }
    return fail('internal_error', 'Notebook ingest could not start.');
  }

  const sourceId = begin.source_id;
  const sourceVersion = begin.source_version;

  if (begin.idempotent === true && begin.status === 'ready') {
    return {
      version: 1,
      ok: true,
      result: {
        status: 'reused',
        sourceId,
        sourceVersion,
        chunkCount: 0,
        contentChanged: false,
        reused: true,
      },
    };
  }

  const chunks = chunkNotebookSegments(extracted.segments);
  if (chunks.length === 0) {
    await finalizeFailedPreserve(input.deps, sourceId, sourceVersion, 'extract_failed');
    // Also clear retrieval if somehow chunkless after begin.
    await input.deps.invalidateNotebookPageCorpus({
      userId,
      sectionId,
      notebookObjectId,
      pageId,
    });
    return fail('no_extractable_text', 'No usable Notebook text chunks were produced.');
  }
  if (chunks.length > KNOWLEDGE_MAX_CHUNKS) {
    await finalizeFailedPreserve(input.deps, sourceId, sourceVersion, 'too_large');
    return fail('too_large', 'Notebook page produced too many chunks.');
  }

  const finalized = await input.deps.finalizeIngest({
    sourceId,
    sourceVersion,
    status: 'ready',
    chunks,
    pageCount: 1,
  });

  if (!finalized.ok || finalized.source_version == null) {
    return fail('internal_error', 'Could not finalize Notebook knowledge ingest.');
  }

  return {
    version: 1,
    ok: true,
    result: {
      status: 'ready',
      sourceId,
      sourceVersion: finalized.source_version,
      chunkCount: finalized.chunk_count ?? chunks.length,
      contentChanged: begin.idempotent !== true,
      reused: false,
    },
  };
}
