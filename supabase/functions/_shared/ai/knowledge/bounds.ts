/**
 * M0.5B — Course knowledge ingestion bounds (server-authoritative).
 * Conservative vs Storage 25 MiB ceiling and Supabase Edge memory/time.
 */

/** Hard ceiling for PDF bytes downloaded into the Edge worker. */
export const KNOWLEDGE_MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MiB

/** Max PDF pages processed in M0.5B. */
export const KNOWLEDGE_MAX_PAGES = 50;

/** Max total extracted characters across all pages. */
export const KNOWLEDGE_MAX_EXTRACTED_CHARS = 200_000;

/** Max chunks written on finalize. */
export const KNOWLEDGE_MAX_CHUNKS = 400;

/** Soft target size before preferring a sentence/paragraph break. */
export const KNOWLEDGE_CHUNK_TARGET_CHARS = 900;

/** Hard max characters per chunk (never exceeded). */
export const KNOWLEDGE_CHUNK_MAX_CHARS = 1200;

/** Drop standalone chunks shorter than this (whitespace-trimmed). */
export const KNOWLEDGE_CHUNK_MIN_CHARS = 40;

/**
 * Minimum total meaningful extracted characters required to accept a document.
 * Below this → treat as no_extractable_text (scanned/blank).
 */
export const KNOWLEDGE_MIN_DOCUMENT_CHARS = 40;

/** JSON body size for the ingest Edge entry (sectionId + objectId only). */
export const KNOWLEDGE_MAX_REQUEST_BODY_BYTES = 4 * 1024;

export const USER_CONTENT_BUCKET = 'user-content' as const;
