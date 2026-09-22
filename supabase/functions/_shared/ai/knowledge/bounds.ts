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

/**
 * M0.5C V1 embedding width contract — single schema/server constant.
 * Must match migration 012 `extensions.vector(1536)` and RPC dimension checks.
 */
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 1536 as const;

/**
 * V1 embedding model id (server default). Overridable only via Edge secret
 * `AI_EMBEDDING_MODEL` — never by the client.
 */
export const KNOWLEDGE_EMBEDDING_MODEL_DEFAULT = 'text-embedding-3-small' as const;

/**
 * Conservative V1 batching (well below typical provider max).
 * 16 × 1200 chars ≈ 19.2k chars; char budget is a second guardrail.
 */
export const KNOWLEDGE_EMBED_MAX_CHUNKS_PER_BATCH = 16 as const;

/** Max sum of chunk text lengths in one provider request. */
export const KNOWLEDGE_EMBED_MAX_CHARS_PER_BATCH = 24_000 as const;

export const USER_CONTENT_BUCKET = 'user-content' as const;

// ---------------------------------------------------------------------------
// M1.0B B1 — PDF extraction contract + page suspicion detector (observational)
// ---------------------------------------------------------------------------

/**
 * Extraction contract version when page metrics (itemCount, etc.) are present.
 * Bump when metric definitions change in a way B2/logs must distinguish.
 */
export const KNOWLEDGE_PDF_EXTRACTION_VERSION = 'pdf-extract-v2-metrics' as const;

/** Page suspicion detector version — bump when rules/thresholds change. */
export const KNOWLEDGE_PAGE_SUSPICION_DETECTOR_VERSION = 'page-suspicion-v1' as const;

/**
 * Default gate for observational detection. When false, ingest skips detect+log
 * (prior runtime behavior). Edge may also set env `KNOWLEDGE_PAGE_SUSPICION_DETECT=0`.
 */
export const KNOWLEDGE_PAGE_SUSPICION_DETECT_ENABLED = true;

/**
 * SPARSE_TEXT: many text items but thin meaningful extract (MVT theorem page:
 * ~14 items / ~96 meaningful chars). Title pages with few items stay healthy.
 */
export const KNOWLEDGE_SUSPICION_THIN_MIN_ITEMS = 8;
export const KNOWLEDGE_SUSPICION_THIN_MAX_MEANINGFUL_CHARS = 120;

/**
 * LOW_TEXT_ITEM_COUNT: near-empty pages with almost no text items
 * (graphics / slide-number stubs). Does not fire on ordinary short titles.
 */
export const KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_ITEMS = 2;
export const KNOWLEDGE_SUSPICION_LOW_ITEM_MAX_MEANINGFUL_CHARS = 8;

/** SUSPICIOUS_UNICODE: Private Use Area / supplementary PUA code points. */
export const KNOWLEDGE_SUSPICION_MIN_PUA_CHARS = 2;
