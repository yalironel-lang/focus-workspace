/**
 * M1.0B B3.2 — Source version lifecycle notes (documentation-as-code).
 *
 * CURRENT PRODUCTION BEHAVIOR (migrations 011/012):
 * - `ai_knowledge_sources.source_version` = tip of extracted text corpus.
 * - `retrieval_source_version` = version eligible for search (may lag).
 * - `begin_ingest` sets pending_content_hash + status pending/stale but does
 *   NOT allocate a new source_version.
 * - `finalize_ingest(ready)` allocates N+1 (when replacing) and writes chunks
 *   for that version in the same transaction; does NOT flip retrieval.
 *
 * B3 RECOVERY REQUIREMENT:
 * Recovery jobs/page_texts must bind to ONE immutable processing version
 * BEFORE OCR, while active retrieval may remain on N.
 *
 * GAP (blocker for full N-active / N+1-processing proof against real schema):
 * There is no reserved processing version while status=processing and before
 * finalize. Binding jobs to current tip N would risk conflating live retrieval
 * evidence with in-flight recovery. Binding to N+1 requires allocating N+1
 * before finalize — not present today.
 *
 * MINIMUM CORRECTION CANDIDATES (NOT implemented in B3.2 — needs approval):
 * A) Early-allocate processing version (bump source_version to N+1 at recovery
 *    begin; keep retrieval_source_version=N; status stays non-ready until B3.3).
 * B) Add explicit `processing_source_version` column used by page_texts/jobs
 *    until B3.3 assembly finalize promotes it.
 *
 * B3.2 worker code assumes jobs already carry an immutable source_version and
 * never invents one from OCR timing.
 */

export const SOURCE_VERSION_LIFECYCLE_NOTE =
  'processing_version_must_be_allocated_before_recovery_jobs';

/** Documents that OCR structural floor is not academic usability. */
export const OCR_STRUCTURAL_ACCEPTANCE_NOTE =
  'recovered_meaningful_chars>=8 means structural sanity only; not academic usability';
