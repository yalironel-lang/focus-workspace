/**
 * M1.0B B3.3C — finalize recovered PDF corpus after ingest/recovery.
 *
 * assemble (canonical + unpublished index) → atomic publish (019).
 * Does not invent workflow state. Reuses B3.3A/B3.3B contracts.
 */

import {
  runAssembleRecoveredCorpus,
  type AssembleRecoveredCorpusDeps,
  type AssembleErrorCode,
} from './runAssembleRecoveredCorpus.ts';
import {
  runPublishRecoveredCorpus,
  type PublishRecoveredCorpusDeps,
  type PublishRecoveredCorpusErrorCode,
} from './runPublishRecoveredCorpus.ts';

export type FinalizeRecoveredPdfErrorCode =
  | AssembleErrorCode
  | PublishRecoveredCorpusErrorCode
  | 'recovery_pending'
  | 'already_complete';

export type FinalizeRecoveredPdfResult =
  | {
      ok: true;
      outcome: 'published' | 'already_published';
      sourceId: string;
      sourceVersion: number;
      retrievalSourceVersion: number;
      previousRetrievalSourceVersion: number | null;
      chunkCount: number;
      pageCount: number;
    }
  | {
      ok: false;
      code: FinalizeRecoveredPdfErrorCode;
      message: string;
      retrievalSourceVersion?: number | null;
    };

export type FinalizeRecoveredPdfDeps = AssembleRecoveredCorpusDeps & {
  publishRecoveredCorpus: PublishRecoveredCorpusDeps['publishRecoveredCorpus'];
};

function fail(
  code: FinalizeRecoveredPdfErrorCode,
  message: string,
  retrievalSourceVersion?: number | null,
): FinalizeRecoveredPdfResult {
  return { ok: false, code, message, retrievalSourceVersion };
}

/**
 * Attempt assembly + publication for exact PDF processing tip.
 * Returns recovery_pending when required recovery is not terminal.
 */
export async function runFinalizeRecoveredPdfCorpus(input: {
  sourceId: string;
  sourceVersion: number;
  sectionId: string;
  userId: string;
  deps: FinalizeRecoveredPdfDeps;
}): Promise<FinalizeRecoveredPdfResult> {
  const { sourceId, sourceVersion, sectionId, userId, deps } = input;

  const loaded = await deps.loadSourceById(sourceId);
  if (!loaded.ok) {
    return fail(
      loaded.code === 'auth_mismatch' ? 'auth_mismatch' : 'not_found',
      'Knowledge source not found.',
    );
  }
  if (loaded.source.userId !== userId || loaded.source.sectionId !== sectionId) {
    return fail('auth_mismatch', 'Source ownership mismatch.');
  }
  if (loaded.source.sourceKind !== 'free_space_pdf') {
    return fail('not_pdf', 'Finalize applies only to free_space_pdf.');
  }

  // Already published to tip — idempotent success without rework.
  if (
    loaded.source.retrievalSourceVersion === sourceVersion &&
    loaded.source.sourceVersion === sourceVersion
  ) {
    const pub = await runPublishRecoveredCorpus({
      request: {
        sourceId,
        expectedSourceVersion: sourceVersion,
        sectionId,
        userId,
      },
      deps: {
        loadSourceById: deps.loadSourceById,
        publishRecoveredCorpus: deps.publishRecoveredCorpus,
      },
    });
    if (pub.ok) {
      return {
        ok: true,
        outcome: pub.alreadyPublished ? 'already_published' : 'published',
        sourceId,
        sourceVersion: pub.sourceVersion,
        retrievalSourceVersion: pub.retrievalSourceVersion,
        previousRetrievalSourceVersion: pub.previousRetrievalSourceVersion,
        chunkCount: pub.chunkCount,
        pageCount: pub.pageCount ?? loaded.source.pageCount ?? 0,
      };
    }
    // Fall through to assemble if publish rejected incomplete index state.
  }

  const assembled = await runAssembleRecoveredCorpus({
    request: { sourceId, sourceVersion, sectionId, userId },
    deps,
  });

  if (!assembled.ok) {
    if (
      assembled.code === 'recovery_not_terminal' ||
      assembled.code === 'missing_required_job'
    ) {
      return fail(
        'recovery_pending',
        'Required page recovery is not terminal yet.',
        assembled.retrievalSourceVersion,
      );
    }
    return fail(
      assembled.code,
      assembled.message,
      assembled.retrievalSourceVersion,
    );
  }

  const published = await runPublishRecoveredCorpus({
    request: {
      sourceId,
      expectedSourceVersion: assembled.sourceVersion,
      sectionId,
      userId,
    },
    deps: {
      loadSourceById: deps.loadSourceById,
      publishRecoveredCorpus: deps.publishRecoveredCorpus,
    },
  });

  if (!published.ok) {
    return fail(published.code, published.message, assembled.retrievalSourceVersion);
  }

  return {
    ok: true,
    outcome: published.alreadyPublished ? 'already_published' : 'published',
    sourceId,
    sourceVersion: published.sourceVersion,
    retrievalSourceVersion: published.retrievalSourceVersion,
    previousRetrievalSourceVersion: published.previousRetrievalSourceVersion,
    chunkCount: published.chunkCount,
    pageCount: published.pageCount ?? assembled.pageCount,
  };
}
