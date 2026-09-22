/**
 * M1.0B B3.2.1 — Source version lifecycle (approved Option A).
 *
 * Implemented in migration 018 (apply to STAGING only when ACTIVE):
 * - `source_version` = immutable processing/text tip, allocated at NEW PDF begin.
 * - `retrieval_source_version` = published retrieval pointer; may lag during recovery.
 *
 * PDF begin_ingest (018):
 * - First ingest → tip 1.
 * - NEW replacement hash with chunks at tip → reserve N+1 immediately; retrieval stays N.
 * - Same pending hash resume → NO bump.
 * - NEW hash after abandoned tip (older chunks, none at tip) → N+2; do not mutate N+1.
 *
 * Shared finalize_ingest (018):
 * - No chunks at tip → write at early-reserved p_source_version (no double bump).
 * - Chunks already at tip → legacy bump (Notebook + pre-018 PDF).
 * - Never flips retrieval_source_version (B3.3 publishes later).
 *
 * Notebook:
 * - `ai_knowledge_begin_notebook_page_ingest` UNCHANGED (no early bump).
 * - Finalize path preserves Notebook replacement via chunks-at-tip bump.
 *
 * Worker:
 * - Jobs carry immutable source_version; never invent version from OCR timing.
 */

export const SOURCE_VERSION_LIFECYCLE_NOTE =
  'processing_version_allocated_at_pdf_begin_ingest_option_a';

/** Documents that OCR structural floor is not academic usability. */
export const OCR_STRUCTURAL_ACCEPTANCE_NOTE =
  'recovered_meaningful_chars>=8 means structural sanity only; not academic usability';
