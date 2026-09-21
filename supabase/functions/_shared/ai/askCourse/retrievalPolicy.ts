/**
 * Deterministic ask_course retrieval filtering (beta heuristics).
 * Diagnostics expose stage counts without changing filter behavior.
 *
 * M0.8F: PDF + Notebook chunks compete in one pool.
 * Per-source cap uses askCourseSourceDiversityKey (PDF object / Notebook PAGE).
 */

import {
  ASK_COURSE_BETA_MIN_SIMILARITY,
  ASK_COURSE_FINAL_HARD_MAX,
  ASK_COURSE_MAX_CHUNKS_PER_SOURCE,
  ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP,
  ASK_COURSE_MAX_RETRIEVED_CHARS,
} from './bounds.ts';
import {
  resolveAskCourseRetrievalReason,
  type AskCourseRetrievalDiagnostics,
} from './retrievalDiagnostics.ts';
import {
  askCourseSourceDiversityKey,
  type KnowledgeSearchHit,
  type PromptCourseChunk,
  type CitedCourseSource,
} from './retrievalTypes.ts';

function sortHits(hits: KnowledgeSearchHit[]): KnowledgeSearchHit[] {
  return [...hits].sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.chunkIndex - b.chunkIndex;
  });
}

function applyCharacterBudget(diversified: KnowledgeSearchHit[]): KnowledgeSearchHit[] {
  const budgeted: KnowledgeSearchHit[] = [];
  let chars = 0;
  for (const h of diversified) {
    const len = h.text.length;
    if (budgeted.length > 0 && chars + len > ASK_COURSE_MAX_RETRIEVED_CHARS) continue;
    if (budgeted.length === 0 && len > ASK_COURSE_MAX_RETRIEVED_CHARS) {
      budgeted.push({ ...h, text: h.text.slice(0, ASK_COURSE_MAX_RETRIEVED_CHARS) });
      break;
    }
    budgeted.push(h);
    chars += len;
  }
  return budgeted;
}

function toPromptChunks(hits: KnowledgeSearchHit[]): PromptCourseChunk[] {
  return hits.map((h, i) => ({
    citationIndex: i + 1,
    sourceKind: h.sourceKind,
    sourceObjectId: h.sourceObjectId,
    notebookObjectId: h.notebookObjectId,
    fileName: h.fileName,
    pageNumber: h.pageNumber,
    text: h.text,
    ...(h.sourceKind === 'notebook_page'
      ? {
          notebookTitle: h.notebookTitle ?? null,
          pageTitle: h.pageTitle ?? null,
        }
      : {}),
  }));
}

/**
 * Apply server-owned policy with stage diagnostics.
 * Filter semantics match the original interleaved budget+hard-max loop
 * (char budget first over diversified order, then hard max slice).
 */
export function filterAskCourseHitsWithDiagnostics(hits: KnowledgeSearchHit[]): {
  chunks: PromptCourseChunk[];
  diagnostics: AskCourseRetrievalDiagnostics;
} {
  const sorted = sortHits(hits);
  const candidateCount = sorted.length;
  const candidateSimilarities = sorted.map((h) => h.similarity);
  const candidateLocations = sorted.map((h) => ({
    pageNumber: h.pageNumber,
    chunkIndex: h.chunkIndex,
  }));
  const uniqueSourceCount = new Set(sorted.map((h) => askCourseSourceDiversityKey(h))).size;
  const topSimilarity = candidateCount > 0 ? sorted[0]!.similarity : null;

  if (sorted.length === 0) {
    const diagnostics: AskCourseRetrievalDiagnostics = {
      candidateCount: 0,
      candidateSimilarities: [],
      candidateLocations: [],
      uniqueSourceCount: 0,
      afterSimilarityFloorCount: 0,
      afterRelativeGapCount: 0,
      afterPerSourceLimitCount: 0,
      afterCharacterBudgetCount: 0,
      finalEvidenceCount: 0,
      finalEvidenceChars: 0,
      topSimilarity: null,
      lowestFinalSimilarity: null,
      reason: 'no_candidates',
    };
    return { chunks: [], diagnostics };
  }

  const afterFloor = sorted.filter((h) => h.similarity >= ASK_COURSE_BETA_MIN_SIMILARITY);
  const afterGap = afterFloor.filter(
    (h) => topSimilarity! - h.similarity <= ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP,
  );

  const perSource = new Map<string, number>();
  const diversified: KnowledgeSearchHit[] = [];
  for (const h of afterGap) {
    const key = askCourseSourceDiversityKey(h);
    const n = perSource.get(key) ?? 0;
    if (n >= ASK_COURSE_MAX_CHUNKS_PER_SOURCE) continue;
    perSource.set(key, n + 1);
    diversified.push(h);
  }

  const afterBudget = applyCharacterBudget(diversified);
  const finalHits = afterBudget.slice(0, ASK_COURSE_FINAL_HARD_MAX);
  const chunks = toPromptChunks(finalHits);
  const finalEvidenceChars = finalHits.reduce((sum, h) => sum + h.text.length, 0);
  const lowestFinalSimilarity =
    finalHits.length > 0 ? finalHits[finalHits.length - 1]!.similarity : null;

  const stageCounts = {
    candidateCount,
    afterSimilarityFloorCount: afterFloor.length,
    afterRelativeGapCount: afterGap.length,
    afterPerSourceLimitCount: diversified.length,
    afterCharacterBudgetCount: afterBudget.length,
    finalEvidenceCount: finalHits.length,
  };

  const diagnostics: AskCourseRetrievalDiagnostics = {
    candidateCount,
    candidateSimilarities,
    candidateLocations,
    uniqueSourceCount,
    afterSimilarityFloorCount: afterFloor.length,
    afterRelativeGapCount: afterGap.length,
    afterPerSourceLimitCount: diversified.length,
    afterCharacterBudgetCount: afterBudget.length,
    finalEvidenceCount: finalHits.length,
    finalEvidenceChars,
    topSimilarity,
    lowestFinalSimilarity,
    reason: resolveAskCourseRetrievalReason(stageCounts),
  };

  return { chunks, diagnostics };
}

/**
 * Apply server-owned policy. Returns empty array → knowledge_not_found.
 * Behaviorally identical to filterAskCourseHitsWithDiagnostics(...).chunks
 */
export function filterAskCourseHits(hits: KnowledgeSearchHit[]): PromptCourseChunk[] {
  return filterAskCourseHitsWithDiagnostics(hits).chunks;
}

export function sourcesFromPromptChunks(chunks: PromptCourseChunk[]): CitedCourseSource[] {
  return chunks.map((c) => {
    if (c.sourceKind === 'notebook_page') {
      return {
        index: c.citationIndex,
        sourceKind: 'notebook_page' as const,
        notebookObjectId: c.notebookObjectId!,
        pageId: c.sourceObjectId,
        notebookTitle: c.notebookTitle ?? null,
        pageTitle: c.pageTitle ?? null,
      };
    }
    return {
      index: c.citationIndex,
      sourceKind: 'free_space_pdf' as const,
      sourceObjectId: c.sourceObjectId,
      fileName: c.fileName,
      pageNumber: c.pageNumber,
    };
  });
}
