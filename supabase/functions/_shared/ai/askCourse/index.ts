export {
  MAX_ASK_COURSE_QUESTION_CHARS,
  ASK_COURSE_RPC_CANDIDATE_LIMIT,
  ASK_COURSE_FINAL_HARD_MAX,
  ASK_COURSE_MAX_CHUNKS_PER_SOURCE,
  ASK_COURSE_MAX_RETRIEVED_CHARS,
  ASK_COURSE_BETA_MIN_SIMILARITY,
  ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP,
  ASK_COURSE_MAX_RECENT_TURNS,
  ASK_COURSE_MAX_PRIOR_USER_TURNS,
  ASK_COURSE_MAX_PRIOR_ASSISTANT_TURNS,
  ASK_COURSE_MAX_PRIOR_USER_TURN_CHARS,
  ASK_COURSE_MAX_PRIOR_ASSISTANT_TURN_CHARS,
  ASK_COURSE_MAX_RECENT_TURNS_TOTAL_CHARS,
  ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS,
} from './bounds.ts';
export { authorizeAskCourseSection } from './authorizeSection.ts';
export { parseKnowledgeSearchRows } from './parseSearchHits.ts';
export {
  filterAskCourseHits,
  filterAskCourseHitsWithDiagnostics,
  sourcesFromPromptChunks,
} from './retrievalPolicy.ts';
export {
  formatAskCourseRetrievalLogLine,
  resolveAskCourseRetrievalReason,
  assertRetrievalDiagnosticPrivacy,
} from './retrievalDiagnostics.ts';
export type {
  AskCourseRetrievalDiagnostics,
  AskCourseRetrievalReason,
} from './retrievalDiagnostics.ts';
export { buildAskCourseMessages, assertSourcesIndependentOfModelText } from './promptAskCourse.ts';
export { buildAskCourseRetrievalQuery } from './buildAskCourseRetrievalQuery.ts';
export {
  normalizeAskCourseRecentTurns,
  sanitizeAskCourseAssistantTurnContent,
} from './normalizeRecentTurns.ts';
export { runAskCoursePipeline } from './runAskCourse.ts';
export type { AskCourseDeps, AskCourseSearchFn } from './runAskCourse.ts';
export type {
  KnowledgeSearchHit,
  CitedCourseSource,
  PromptCourseChunk,
  AskCourseSourceKind,
} from './retrievalTypes.ts';
export { askCourseSourceDiversityKey } from './retrievalTypes.ts';
export {
  resolveAskCourseHitMetadata,
  type LoadNotebookFsoForCitation,
} from './resolveCitationMetadata.ts';
