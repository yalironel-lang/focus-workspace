/**
 * Server bounds — must stay aligned with src/lib/ai/context/bounds.ts (M0.1).
 * Duplicated here so the Edge Function never imports client src/.
 */

export const MAX_SELECTION_CHARS = 2000;
export const MAX_BLOCK_CHARS = 500;
export const MAX_TABLE_PREVIEW_CHARS = 400;
export const MAX_SURROUNDING_BLOCKS = 3;

/** Absolute JSON body size for the Edge Function entry (bytes) — text capabilities. */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/**
 * Dedicated ask_course visual_selection body budget.
 * Does not raise MAX_REQUEST_BODY_BYTES for text-only traffic.
 * Keep aligned with src/lib/ai/visualCapture/visualSelectionContract.ts.
 */
export const MAX_ASK_COURSE_VISUAL_BODY_BYTES = 512 * 1024;

/** Server-controlled provider output cap — client cannot override. */
export const SERVER_MAX_OUTPUT_TOKENS = 1200;

/**
 * Dedicated server-controlled output token budget for ask_course (Tutor) — allows
 * adequate headroom for multi-step mathematical derivations and multiple-choice explanations.
 */
export const SERVER_ASK_COURSE_MAX_OUTPUT_TOKENS = 2048;

/**
 * Server-controlled provider output cap for reasoning models where hidden reasoning
 * tokens and visible output share the completion budget.
 */
export const SERVER_REASONING_MAX_OUTPUT_TOKENS = 8000;

/**
 * Dedicated server-controlled output token budget for Gemini 3.x Flash reasoning models
 * where internal thinking tokens require up to 8192 total tokens.
 */
export const SERVER_GEMINI_REASONING_MAX_OUTPUT_TOKENS = 8192;
