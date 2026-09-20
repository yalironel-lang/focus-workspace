/**
 * M0.5B knowledge ingest pipeline (pure orchestration + injectable I/O).
 *
 * Flow:
 *   validate request
 *   → authorize section + Free Space PDF
 *   → derive storage path
 *   → download PDF bytes (size guard)
 *   → SHA-256
 *   → begin_ingest
 *   → (idempotent ready? return reused)
 *   → extract pages → chunk → finalize ready
 *   → on failure: finalize failed (preserves prior READY)
 */

import {
  KNOWLEDGE_MAX_CHUNKS,
  KNOWLEDGE_MAX_PDF_BYTES,
  KNOWLEDGE_MIN_DOCUMENT_CHARS,
  USER_CONTENT_BUCKET,
} from './bounds.ts';
import { chunkPageTexts, type KnowledgeChunk } from './chunkPages.ts';
import {
  extractPdfTextFromBytes,
  type PdfJsModule,
} from './extractPdfText.ts';
import { sha256Hex } from './hash.ts';
import { meaningfulCharCount } from './normalizeText.ts';
import { buildFreeSpacePdfStoragePath } from './path.ts';
import type {
  KnowledgeIngestErrorCode,
  KnowledgeIngestRequest,
  KnowledgeIngestResponse,
} from './types.ts';

export type BeginIngestResult = {
  ok: boolean;
  code?: string;
  source_id?: string;
  source_version?: number;
  status?: string;
  idempotent?: boolean;
};

export type FinalizeIngestResult = {
  ok: boolean;
  code?: string;
  source_id?: string;
  source_version?: number;
  status?: string;
  chunk_count?: number;
  preserved_corpus?: boolean;
};

export type KnowledgeIngestDeps = {
  loadOwnedPdfObject: (input: {
    userId: string;
    sectionId: string;
    sourceObjectId: string;
  }) => Promise<
    | { ok: true; objectType: string }
    | { ok: false; code: 'not_found' | 'auth_mismatch' | 'not_pdf' }
  >;
  downloadPdfBytes: (input: {
    bucket: string;
    storagePath: string;
  }) => Promise<
    | { ok: true; bytes: Uint8Array }
    | { ok: false; code: 'not_found' | 'too_large' | 'internal_error' }
  >;
  beginIngest: (input: {
    userId: string;
    sectionId: string;
    sourceObjectId: string;
    contentHash: string;
  }) => Promise<BeginIngestResult>;
  finalizeIngest: (input: {
    sourceId: string;
    sourceVersion: number;
    status: 'ready' | 'failed';
    errorCode?: string;
    chunks?: KnowledgeChunk[];
    /** Server-derived extraction page count only (never client authority). */
    pageCount?: number;
  }) => Promise<FinalizeIngestResult>;
  pdfjs: PdfJsModule;
  nowMs?: () => number;
};

function fail(
  code: KnowledgeIngestErrorCode,
  message: string,
): KnowledgeIngestResponse {
  return { version: 1, ok: false, error: { code, message } };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseKnowledgeIngestRequest(
  body: unknown,
): { ok: true; request: KnowledgeIngestRequest } | { ok: false; code: 'invalid_request' } {
  if (!body || typeof body !== 'object') return { ok: false, code: 'invalid_request' };
  const o = body as Record<string, unknown>;
  if (o.version !== 1) return { ok: false, code: 'invalid_request' };
  if (typeof o.sectionId !== 'string' || !isUuid(o.sectionId)) {
    return { ok: false, code: 'invalid_request' };
  }
  if (typeof o.sourceObjectId !== 'string' || o.sourceObjectId.trim().length === 0) {
    return { ok: false, code: 'invalid_request' };
  }
  if (o.sourceObjectId !== o.sourceObjectId.trim()) {
    return { ok: false, code: 'invalid_request' };
  }
  // Reject client attempts to supply authoritative fields.
  if (
    'userId' in o ||
    'user_id' in o ||
    'storagePath' in o ||
    'contentHash' in o ||
    'chunks' in o ||
    'sourceVersion' in o
  ) {
    return { ok: false, code: 'invalid_request' };
  }
  return {
    ok: true,
    request: {
      version: 1,
      sectionId: o.sectionId,
      sourceObjectId: o.sourceObjectId.trim(),
    },
  };
}

function mapFinalizeFailureCode(
  code: KnowledgeIngestErrorCode,
): 'extract_failed' | 'too_large' | 'too_many_pages' | 'internal_error' {
  switch (code) {
    case 'too_large':
      return 'too_large';
    case 'too_many_pages':
      return 'too_many_pages';
    case 'no_extractable_text':
    case 'extract_failed':
      return 'extract_failed';
    default:
      return 'internal_error';
  }
}

async function finalizeFailedPreserve(
  deps: KnowledgeIngestDeps,
  sourceId: string,
  sourceVersion: number,
  code: KnowledgeIngestErrorCode,
): Promise<void> {
  try {
    await deps.finalizeIngest({
      sourceId,
      sourceVersion,
      status: 'failed',
      errorCode: mapFinalizeFailureCode(code),
    });
  } catch {
    // Best-effort — prior READY remains if finalize fails closed.
  }
}

export async function runKnowledgeIngest(input: {
  authUserId: string | null;
  body: unknown;
  deps: KnowledgeIngestDeps;
}): Promise<KnowledgeIngestResponse> {
  if (!input.authUserId) {
    return fail('unauthenticated', 'Sign in required.');
  }
  const userId = input.authUserId;

  const parsed = parseKnowledgeIngestRequest(input.body);
  if (!parsed.ok) {
    return fail('invalid_request', 'Invalid ingest request.');
  }
  const { sectionId, sourceObjectId } = parsed.request;

  const owned = await input.deps.loadOwnedPdfObject({
    userId,
    sectionId,
    sourceObjectId,
  });
  if (!owned.ok) {
    if (owned.code === 'not_pdf') return fail('not_pdf', 'Only PDF Free Space objects can be indexed.');
    if (owned.code === 'auth_mismatch') {
      return fail('auth_mismatch', 'You do not own this course object.');
    }
    return fail('not_found', 'Course object not found.');
  }

  const storagePath = buildFreeSpacePdfStoragePath({
    userId,
    sectionId,
    sourceObjectId,
  });

  const downloaded = await input.deps.downloadPdfBytes({
    bucket: USER_CONTENT_BUCKET,
    storagePath,
  });
  if (!downloaded.ok) {
    if (downloaded.code === 'too_large') {
      return fail('too_large', 'PDF exceeds the M0.5B ingestion size limit.');
    }
    if (downloaded.code === 'not_found') {
      return fail('not_found', 'PDF bytes are not available in storage yet.');
    }
    return fail('internal_error', 'Could not download PDF.');
  }

  if (downloaded.bytes.byteLength > KNOWLEDGE_MAX_PDF_BYTES) {
    return fail('too_large', 'PDF exceeds the M0.5B ingestion size limit.');
  }

  // Copy bytes — WebCrypto digest may detach the underlying ArrayBuffer.
  const pdfBytes = downloaded.bytes.slice();
  const contentHash = await sha256Hex(pdfBytes);

  const begin = await input.deps.beginIngest({
    userId,
    sectionId,
    sourceObjectId,
    contentHash,
  });

  if (!begin.ok || !begin.source_id || begin.source_version == null) {
    const code = (begin.code ?? 'internal_error') as KnowledgeIngestErrorCode;
    if (code === 'auth_mismatch' || code === 'not_found' || code === 'not_pdf' || code === 'invalid_request') {
      return fail(code, 'Ingest could not start.');
    }
    return fail('internal_error', 'Ingest could not start.');
  }

  const sourceId = begin.source_id;
  const sourceVersion = begin.source_version;

  // Same hash already READY — no re-extract.
  if (begin.idempotent === true && begin.status === 'ready') {
    return {
      version: 1,
      ok: true,
      result: {
        status: 'reused',
        sourceId,
        sourceVersion,
        pageCount: 0,
        chunkCount: 0,
        contentChanged: false,
        reused: true,
      },
    };
  }

  const extracted = await extractPdfTextFromBytes(pdfBytes, input.deps.pdfjs);
  if (!extracted.ok) {
    const code =
      extracted.code === 'too_many_pages'
        ? 'too_many_pages'
        : extracted.code === 'too_large'
          ? 'too_large'
          : extracted.code === 'no_extractable_text'
            ? 'no_extractable_text'
            : 'extract_failed';
    await finalizeFailedPreserve(input.deps, sourceId, sourceVersion, code);
    return fail(
      code,
      code === 'too_many_pages'
        ? 'PDF has too many pages for M0.5B ingestion.'
        : code === 'too_large'
          ? 'Extracted text exceeds the M0.5B limit.'
          : 'Could not extract text from this PDF.',
    );
  }

  // Partial / no-text policy:
  // - Empty pages are allowed (no chunks for those pages).
  // - Document accepted only if total meaningful chars >= KNOWLEDGE_MIN_DOCUMENT_CHARS
  //   and at least one page has text.
  const meaningfulTotal = extracted.pages.reduce(
    (sum, p) => sum + meaningfulCharCount(p.text),
    0,
  );
  if (extracted.pagesWithText < 1 || meaningfulTotal < KNOWLEDGE_MIN_DOCUMENT_CHARS) {
    await finalizeFailedPreserve(input.deps, sourceId, sourceVersion, 'no_extractable_text');
    return fail(
      'no_extractable_text',
      'This PDF has no extractable text layer (scanned/blank PDFs are not supported yet).',
    );
  }

  const chunks = chunkPageTexts(extracted.pages);
  if (chunks.length === 0) {
    await finalizeFailedPreserve(input.deps, sourceId, sourceVersion, 'no_extractable_text');
    return fail('no_extractable_text', 'No usable text chunks were produced.');
  }
  if (chunks.length > KNOWLEDGE_MAX_CHUNKS) {
    await finalizeFailedPreserve(input.deps, sourceId, sourceVersion, 'too_large');
    return fail('too_large', 'PDF produced too many chunks for M0.5B.');
  }

  const finalized = await input.deps.finalizeIngest({
    sourceId,
    sourceVersion,
    status: 'ready',
    chunks,
    pageCount: extracted.pageCount,
  });

  if (!finalized.ok || finalized.source_version == null) {
    return fail('internal_error', 'Could not finalize knowledge ingest.');
  }

  return {
    version: 1,
    ok: true,
    result: {
      status: 'ready',
      sourceId,
      sourceVersion: finalized.source_version,
      pageCount: extracted.pageCount,
      chunkCount: finalized.chunk_count ?? chunks.length,
      contentChanged: begin.idempotent !== true,
      reused: false,
    },
  };
}
