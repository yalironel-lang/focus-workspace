/**
 * Metadata-only retrieval diagnostics for ask_course.
 * Never includes question, chunk text, answer, vectors, or identity UUIDs.
 */

export type AskCourseRetrievalReason =
  | 'evidence_ready'
  | 'no_candidates'
  | 'below_similarity_floor'
  | 'relative_gap_filtered'
  | 'source_diversity_filtered'
  | 'character_budget_filtered'
  | 'hard_limit_filtered'
  | 'no_final_evidence';

export type AskCourseCandidateLocation = {
  pageNumber: number;
  chunkIndex: number;
};

export type AskCourseRetrievalDiagnostics = {
  candidateCount: number;
  candidateSimilarities: number[];
  candidateLocations: AskCourseCandidateLocation[];
  uniqueSourceCount: number;

  afterSimilarityFloorCount: number;
  afterRelativeGapCount: number;
  afterPerSourceLimitCount: number;
  afterCharacterBudgetCount: number;
  finalEvidenceCount: number;
  finalEvidenceChars: number;

  topSimilarity: number | null;
  lowestFinalSimilarity: number | null;

  reason: AskCourseRetrievalReason;
};

export type AskCourseRetrievalLogLine = {
  event: 'ask_course_retrieval';
  outcome: 'evidence_ready' | 'knowledge_not_found';
  reason: AskCourseRetrievalReason;
  candidateCount: number;
  similarities: number[];
  candidateLocations: AskCourseCandidateLocation[];
  uniqueSourceCount: number;
  afterFloor: number;
  afterGap: number;
  afterSourceLimit: number;
  afterBudget: number;
  finalCount: number;
  finalChars: number;
  topSimilarity: number | null;
  lowestFinalSimilarity: number | null;
};

const FORBIDDEN_DIAGNOSTIC_KEYS = [
  'question',
  'text',
  'chunk',
  'answer',
  'embedding',
  'vector',
  'userId',
  'user_id',
  'sectionId',
  'section_id',
  'sourceId',
  'source_id',
  'storagePath',
  'storage_path',
  'contentHash',
  'content_hash',
  'jwt',
  'apiKey',
  'messages',
] as const;

export function resolveAskCourseRetrievalReason(d: {
  candidateCount: number;
  afterSimilarityFloorCount: number;
  afterRelativeGapCount: number;
  afterPerSourceLimitCount: number;
  afterCharacterBudgetCount: number;
  finalEvidenceCount: number;
}): AskCourseRetrievalReason {
  if (d.finalEvidenceCount > 0) return 'evidence_ready';
  if (d.candidateCount === 0) return 'no_candidates';
  if (d.afterSimilarityFloorCount === 0) return 'below_similarity_floor';
  if (d.afterRelativeGapCount === 0) return 'relative_gap_filtered';
  if (d.afterPerSourceLimitCount === 0) return 'source_diversity_filtered';
  if (d.afterCharacterBudgetCount === 0) return 'character_budget_filtered';
  if (d.afterCharacterBudgetCount > 0 && d.finalEvidenceCount === 0) return 'hard_limit_filtered';
  return 'no_final_evidence';
}

export function formatAskCourseRetrievalLogLine(
  d: AskCourseRetrievalDiagnostics,
): string {
  const line: AskCourseRetrievalLogLine = {
    event: 'ask_course_retrieval',
    outcome: d.finalEvidenceCount > 0 ? 'evidence_ready' : 'knowledge_not_found',
    reason: d.reason,
    candidateCount: d.candidateCount,
    similarities: d.candidateSimilarities,
    candidateLocations: d.candidateLocations,
    uniqueSourceCount: d.uniqueSourceCount,
    afterFloor: d.afterSimilarityFloorCount,
    afterGap: d.afterRelativeGapCount,
    afterSourceLimit: d.afterPerSourceLimitCount,
    afterBudget: d.afterCharacterBudgetCount,
    finalCount: d.finalEvidenceCount,
    finalChars: d.finalEvidenceChars,
    topSimilarity: d.topSimilarity,
    lowestFinalSimilarity: d.lowestFinalSimilarity,
  };
  return JSON.stringify(line);
}

/** Test helper: ensure serialized diagnostic JSON has no forbidden content keys. */
export function assertRetrievalDiagnosticPrivacy(payloadJson: string): void {
  const obj = JSON.parse(payloadJson) as Record<string, unknown>;
  for (const key of FORBIDDEN_DIAGNOSTIC_KEYS) {
    if (key in obj) {
      throw new Error(`forbidden diagnostic key present: ${key}`);
    }
  }
  const blob = payloadJson.toLowerCase();
  // Structural: event name only; no free-text fields beyond known keys
  const allowed = new Set([
    'event',
    'outcome',
    'reason',
    'candidatecount',
    'similarities',
    'candidatelocations',
    'uniquesourcecount',
    'afterfloor',
    'aftergap',
    'aftersourcelimit',
    'afterbudget',
    'finalcount',
    'finalchars',
    'topsimilarity',
    'lowestfinalsimilarity',
    'pagenumber',
    'chunkindex',
  ]);
  function walk(v: unknown, path: string): void {
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        v.forEach((x, i) => walk(x, `${path}[${i}]`));
        return;
      }
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (!allowed.has(k.toLowerCase())) {
          throw new Error(`unexpected diagnostic key: ${k}`);
        }
        walk(val, `${path}.${k}`);
      }
    }
  }
  walk(obj, 'root');
  void blob;
}
