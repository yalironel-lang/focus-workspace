/**
 * M1.0B B3.3A — assemble canonical recovered corpus + unpublished index.
 *
 * Gate → validate pages → chunkPageTexts → finalize_ingest (text tip)
 * → index embeddings WITHOUT retrieval flip.
 *
 * PDF / free_space_pdf only. Does not touch Notebook paths.
 * Does NOT call finalize_index_success (B3.3B publication).
 */

import {
  assertProcessingAuthority,
  assertRecoveryTerminalGate,
  type RecoveryJobSnapshot,
} from './assertRecoveryTerminalGate.ts';
import { chunkPageTexts, prefixPdfChunkForRetrieval, type KnowledgeChunk } from './chunkPages.ts';
import {
  validateCanonicalPageSet,
  type CanonicalPageRow,
} from './validateCanonicalPageSet.ts';
import type { SourceIndexMeta } from './runKnowledgeIndex.ts';
import {
  runKnowledgeIndexUnpublishedForSource,
  type UnpublishedIndexDeps,
  type UnpublishedIndexResult,
} from './runKnowledgeIndexUnpublished.ts';

export type AssembleErrorCode =
  | 'invalid_request'
  | 'not_found'
  | 'auth_mismatch'
  | 'not_pdf'
  | 'missing_page_count'
  | 'missing_page'
  | 'duplicate_page'
  | 'cross_source'
  | 'cross_version'
  | 'recovery_not_terminal'
  | 'missing_required_job'
  | 'discarded_stale_authority'
  | 'stale_processing_version'
  | 'finalize_failed'
  | 'index_failed'
  | 'internal_error';

export type AssembleRecoveredCorpusRequest = {
  sourceId: string;
  /** Exact processing version to build (must equal current tip). */
  sourceVersion: number;
  sectionId: string;
  userId: string;
};

export type AssembleRecoveredCorpusResult =
  | {
      ok: true;
      sourceId: string;
      sourceVersion: number;
      retrievalSourceVersion: number | null;
      expectedPageCount: number;
      pageCount: number;
      chunkCount: number;
      embeddingCount: number;
      reusedChunks: boolean;
      index: UnpublishedIndexResult;
      published: false;
    }
  | {
      ok: false;
      code: AssembleErrorCode;
      message: string;
      retrievalSourceVersion?: number | null;
    };

export type AssembleRecoveredCorpusDeps = UnpublishedIndexDeps & {
  loadSourceById: (sourceId: string) => Promise<
    | {
        ok: true;
        source: SourceIndexMeta & {
          sourceKind: string;
          pageCount: number | null;
          fileName?: string | null;
        };
      }
    | { ok: false; code: 'not_found' | 'auth_mismatch' }
  >;
  loadPageTexts: (input: {
    sourceId: string;
    sourceVersion: number;
  }) => Promise<CanonicalPageRow[]>;
  loadRecoveryJobs: (input: {
    sourceId: string;
    sourceVersion: number;
  }) => Promise<RecoveryJobSnapshot[]>;
  countChunks: (input: {
    sourceId: string;
    sourceVersion: number;
  }) => Promise<number>;
  /** Delete unpublished version chunks (N+1 only) for deterministic rebuild. */
  deleteVersionChunks: (input: {
    sourceId: string;
    sourceVersion: number;
  }) => Promise<void>;
  finalizeIngest: (input: {
    sourceId: string;
    sourceVersion: number;
    status: 'ready';
    chunks: KnowledgeChunk[];
    pageCount: number;
  }) => Promise<{ ok: boolean; source_version?: number; chunk_count?: number; code?: string }>;
  recoveryEnabled?: boolean;
  /**
   * When true and chunks already exist for target version, skip finalize and
   * resume unpublished index only.
   */
  allowResumeExistingChunks?: boolean;
};

function fail(
  code: AssembleErrorCode,
  message: string,
  retrievalSourceVersion?: number | null,
): AssembleRecoveredCorpusResult {
  return { ok: false, code, message, retrievalSourceVersion };
}

export async function runAssembleRecoveredCorpus(input: {
  request: AssembleRecoveredCorpusRequest;
  deps: AssembleRecoveredCorpusDeps;
}): Promise<AssembleRecoveredCorpusResult> {
  const { request, deps } = input;
  const loaded = await deps.loadSourceById(request.sourceId);
  if (!loaded.ok) {
    return fail(
      loaded.code === 'auth_mismatch' ? 'auth_mismatch' : 'not_found',
      'Knowledge source not found.',
    );
  }
  const source = loaded.source;

  if (source.userId !== request.userId || source.sectionId !== request.sectionId) {
    return fail('auth_mismatch', 'Source ownership mismatch.');
  }
  if (source.sourceKind !== 'free_space_pdf') {
    return fail('not_pdf', 'B3.3A assembly applies only to free_space_pdf sources.');
  }

  const authority = assertProcessingAuthority({
    targetSourceVersion: request.sourceVersion,
    currentSourceVersion: source.sourceVersion,
  });
  if (!authority.ok) {
    return fail(
      authority.code,
      'Processing version is no longer authoritative.',
      source.retrievalSourceVersion,
    );
  }

  const pageRows = await deps.loadPageTexts({
    sourceId: request.sourceId,
    sourceVersion: request.sourceVersion,
  });
  const jobs = await deps.loadRecoveryJobs({
    sourceId: request.sourceId,
    sourceVersion: request.sourceVersion,
  });

  const gate = assertRecoveryTerminalGate({
    pages: pageRows.map((p) => ({
      pageNumber: p.pageNumber,
      detectorReasons: p.detectorReasons ?? [],
    })),
    jobs,
    recoveryEnabled: deps.recoveryEnabled,
  });
  if (!gate.ok) {
    return fail(
      gate.code,
      gate.code === 'recovery_not_terminal'
        ? 'Required recovery work is not terminal.'
        : gate.code === 'discarded_stale_authority'
          ? 'Recovery discarded_stale; processing authority must be re-evaluated.'
          : 'Recovery gate failed.',
      source.retrievalSourceVersion,
    );
  }

  // Re-check authority after gate I/O (N+2 may have been allocated concurrently).
  const reloaded = await deps.loadSourceById(request.sourceId);
  if (!reloaded.ok) {
    return fail('not_found', 'Knowledge source disappeared.', source.retrievalSourceVersion);
  }
  const authority2 = assertProcessingAuthority({
    targetSourceVersion: request.sourceVersion,
    currentSourceVersion: reloaded.source.sourceVersion,
  });
  if (!authority2.ok) {
    return fail(
      authority2.code,
      'Processing version lost authority before assembly.',
      reloaded.source.retrievalSourceVersion,
    );
  }

  // Prefer authoritative source.page_count; when deferred finalize has not yet
  // written it, infer P from the complete native ledger row set (1..max).
  const inferredPageCount =
    pageRows.length > 0
      ? Math.max(...pageRows.map((p) => p.pageNumber))
      : null;
  const expectedPageCount = reloaded.source.pageCount ?? inferredPageCount;

  const validated = validateCanonicalPageSet({
    sourceId: request.sourceId,
    sourceVersion: request.sourceVersion,
    expectedPageCount,
    rows: pageRows,
  });
  if (!validated.ok) {
    return fail(
      validated.code === 'missing_page_count'
        ? 'missing_page_count'
        : validated.code === 'missing_page'
          ? 'missing_page'
          : validated.code === 'duplicate_page'
            ? 'duplicate_page'
            : validated.code === 'cross_source'
              ? 'cross_source'
              : validated.code === 'cross_version'
                ? 'cross_version'
                : 'invalid_request',
      'Canonical page validation failed.',
      reloaded.source.retrievalSourceVersion,
    );
  }

  const existingChunkCount = await deps.countChunks({
    sourceId: request.sourceId,
    sourceVersion: request.sourceVersion,
  });

  let chunkCount = existingChunkCount;
  let reusedChunks = false;
  const allowResume = deps.allowResumeExistingChunks !== false;

  if (existingChunkCount > 0 && allowResume) {
    reusedChunks = true;
  } else {
    if (existingChunkCount > 0) {
      // Deterministic rebuild of unpublished tip only.
      await deps.deleteVersionChunks({
        sourceId: request.sourceId,
        sourceVersion: request.sourceVersion,
      });
    }

    const chunks = chunkPageTexts(
      validated.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: prefixPdfChunkForRetrieval({
          fileName: reloaded.source.fileName ?? null,
          pageNumber: p.pageNumber,
          text: p.text,
        }),
      })),
    );
    // Empty document (all blank pages) → zero chunks is allowed only if P>=1
    // and every page row exists. Index path requires >=1 chunk today.
    // Fail closed if zero chunks (matches existing index invariant).
    if (chunks.length < 1) {
      return fail(
        'invalid_request',
        'Canonical corpus produced no chunks.',
        reloaded.source.retrievalSourceVersion,
      );
    }

    const finalized = await deps.finalizeIngest({
      sourceId: request.sourceId,
      sourceVersion: request.sourceVersion,
      status: 'ready',
      chunks,
      pageCount: validated.expectedPageCount,
    });
    if (!finalized.ok) {
      return fail(
        'finalize_failed',
        'Could not finalize text corpus for processing version.',
        reloaded.source.retrievalSourceVersion,
      );
    }
    // Guard: finalize must not have bumped past target (double-bump / wrong tip).
    if (
      finalized.source_version != null &&
      finalized.source_version !== request.sourceVersion
    ) {
      return fail(
        'stale_processing_version',
        'Finalize advanced past the target processing version.',
        reloaded.source.retrievalSourceVersion,
      );
    }
    chunkCount = finalized.chunk_count ?? chunks.length;
  }

  // Refresh meta for index (status should be ready after finalize).
  const forIndex = await deps.loadSourceById(request.sourceId);
  if (!forIndex.ok) {
    return fail('not_found', 'Source missing after finalize.', source.retrievalSourceVersion);
  }
  if (forIndex.source.sourceVersion !== request.sourceVersion) {
    return fail(
      'stale_processing_version',
      'Tip moved after text finalize.',
      forIndex.source.retrievalSourceVersion,
    );
  }

  const indexed = await runKnowledgeIndexUnpublishedForSource({
    sectionId: request.sectionId,
    source: forIndex.source,
    deps,
    targetSourceVersion: request.sourceVersion,
  });
  if (!indexed.ok) {
    return fail(
      indexed.response.ok === false && indexed.response.error.code === 'stale_job'
        ? 'stale_processing_version'
        : 'index_failed',
      indexed.response.ok === false
        ? indexed.response.error.message
        : 'Unpublished index failed.',
      forIndex.source.retrievalSourceVersion,
    );
  }

  // Final proof: retrieval must still equal what we started with (no flip).
  const end = await deps.loadSourceById(request.sourceId);
  if (!end.ok) {
    return fail('not_found', 'Source missing after index.', source.retrievalSourceVersion);
  }
  if (
    end.source.retrievalSourceVersion !== forIndex.source.retrievalSourceVersion &&
    end.source.retrievalSourceVersion !== source.retrievalSourceVersion
  ) {
    // Allow equality with either snapshot; reject if tip retrieval advanced to target.
    if (end.source.retrievalSourceVersion === request.sourceVersion) {
      return fail(
        'internal_error',
        'Retrieval pointer was published unexpectedly during B3.3A.',
        end.source.retrievalSourceVersion,
      );
    }
  }
  if (end.source.retrievalSourceVersion === request.sourceVersion) {
    return fail(
      'internal_error',
      'Retrieval pointer equals processing tip after B3.3A (publication leak).',
      end.source.retrievalSourceVersion,
    );
  }

  return {
    ok: true,
    sourceId: request.sourceId,
    sourceVersion: request.sourceVersion,
    retrievalSourceVersion: end.source.retrievalSourceVersion,
    expectedPageCount: validated.expectedPageCount,
    pageCount: validated.pages.length,
    chunkCount,
    embeddingCount: indexed.result.embeddingCount,
    reusedChunks,
    index: indexed.result,
    published: false,
  };
}
