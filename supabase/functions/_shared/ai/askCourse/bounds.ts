/**
 * M0.5D — ask_course server-owned bounds and beta retrieval heuristics.
 * Tune via these constants only — do not scatter magic numbers.
 */

/** Conservative max question length (chars). Same order as Explain selection. */
export const MAX_ASK_COURSE_QUESTION_CHARS = 2000 as const;

/** Candidates requested from ai_knowledge_search. */
export const ASK_COURSE_RPC_CANDIDATE_LIMIT = 5 as const;

/** Hard max hits that may enter the generation prompt. */
export const ASK_COURSE_FINAL_HARD_MAX = 5 as const;

/** Max chunks retained from any single sourceObjectId. */
export const ASK_COURSE_MAX_CHUNKS_PER_SOURCE = 2 as const;

/** Max sum of chunk text lengths included in COURSE MATERIAL. */
export const ASK_COURSE_MAX_RETRIEVED_CHARS = 4500 as const;

/**
 * BETA HEURISTIC minimum cosine similarity (1 - distance).
 * Not a correctness truth — tune after real E2E score inspection.
 */
export const ASK_COURSE_BETA_MIN_SIMILARITY = 0.4 as const;

/**
 * BETA HEURISTIC: drop hits more than this below the top similarity.
 * Not a correctness truth.
 */
export const ASK_COURSE_MAX_RELATIVE_GAP_FROM_TOP = 0.25 as const;

/** M0.9C1 — ask_course v2 recentTurns (conversational context, not authority). */
export const ASK_COURSE_MAX_RECENT_TURNS = 3 as const;
export const ASK_COURSE_MAX_PRIOR_USER_TURNS = 2 as const;
export const ASK_COURSE_MAX_PRIOR_ASSISTANT_TURNS = 1 as const;
export const ASK_COURSE_MAX_PRIOR_USER_TURN_CHARS = 500 as const;
export const ASK_COURSE_MAX_PRIOR_ASSISTANT_TURN_CHARS = 1200 as const;
export const ASK_COURSE_MAX_RECENT_TURNS_TOTAL_CHARS = 2500 as const;
/** Cap prior-user contribution inside the contextual retrieval embedding string. */
export const ASK_COURSE_MAX_RETRIEVAL_PRIOR_USER_CHARS = 800 as const;
