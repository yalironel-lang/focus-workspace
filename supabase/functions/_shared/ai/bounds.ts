/**
 * Server bounds — must stay aligned with src/lib/ai/context/bounds.ts (M0.1).
 * Duplicated here so the Edge Function never imports client src/.
 */

export const MAX_SELECTION_CHARS = 2000;
export const MAX_BLOCK_CHARS = 500;
export const MAX_TABLE_PREVIEW_CHARS = 400;
export const MAX_SURROUNDING_BLOCKS = 3;

/** Absolute JSON body size for the Edge Function entry (bytes). */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/** Server-controlled provider output cap — client cannot override. */
export const SERVER_MAX_OUTPUT_TOKENS = 1200;
