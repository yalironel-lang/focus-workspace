# Supabase migrations — FOCUS Storage / Sync V1

Apply migrations **in numeric order** on the Supabase project used by the app (`VITE_SUPABASE_URL`).

## Required for Storage / Sync V1 (current branch)

| Migration | Purpose | Status |
|-----------|---------|--------|
| `001_initial.sql` | Base auth/users | Required |
| `002_schema.sql` | Core tables (sections, etc.) | Required |
| `003_proof_of_cloud.sql` | Cloud proof hooks | Required |
| `004_free_space_objects_v1.sql` | Free Space objects | Required |
| `005_free_space_objects_realtime.sql` | Realtime | Required |
| `006_free_space_boards_v1.sql` | Free Space boards | Required |
| `007_workspace_extensions.sql` | `sections.exam_date`, `deadlines`, `schedule_blocks`, `course_links` + RLS | **Applied (production, verified pre-flight)** |
| `008_user_content_storage.sql` | Private `user-content` Storage bucket + RLS | **Applied (production)** |
| `009_user_workspace_state.sql` | `user_workspace_state` table (Desk + Math Zone JSON) | **Applied (production, verified 2026-08-28)** |
| `010_ai_usage_control.sql` | AI entitlements, usage events, counters + RPCs (M0.4) | **Applied (production, Release 1)** |
| `011_ai_knowledge_foundation.sql` | AI knowledge sources + chunks + begin/finalize ingest RPCs (M0.5A) | **Applied (production, verified M0.5A closeout)** |
| `012_ai_knowledge_semantic_index.sql` | Vector extension + embeddings + version index state + search/index RPCs (M0.5C) | **Applied (production, verified M0.5C Phase 3/4)** |
| `013_ai_knowledge_notebook_pages.sql` | Notebook page source_kind + ownership/FK foundation (M0.8B) | **Local/create only — NOT applied to Production in M0.8B** |
| `014_ai_knowledge_notebook_page_ingest.sql` | Notebook page begin-ingest + blank invalidation RPCs (M0.8C) | **Local/create only — NOT applied to Production in M0.8C** |
| `015_ai_knowledge_notebook_page_remove.sql` | Notebook page knowledge remove on soft-delete (M0.8E) | **Local/create only — NOT applied to Production in M0.8E** |
| `016_ai_knowledge_mixed_course_search.sql` | Mixed PDF + Notebook course search (M0.8F) | **Local/create only — NOT applied to Production in M0.8F** |

## Migration 011 — AI knowledge foundation (M0.5A)

- **Objects:** `ai_knowledge_sources`, `ai_knowledge_chunks`
- **RPCs (service_role only):** `ai_knowledge_begin_ingest`, `ai_knowledge_finalize_ingest`
- **Source V1:** `free_space_pdf` only (`source_object_id` → `free_space_objects.id` text)
- **Lifecycle invariant:** a previously READY corpus (`content_hash` + chunks at `source_version`) is never deleted by `begin_ingest`. Replacement starts by setting `pending_content_hash` and status `stale`; old chunks are replaced only inside a successful `finalize_ingest(ready)` after full payload validation. A failed replacement restores `ready` and clears `pending_content_hash`.
- **No pgvector / embeddings** (deferred to M0.5C)
- **No extraction** (deferred to M0.5B)
- **RLS:** owners may SELECT own rows; clients cannot INSERT/UPDATE/DELETE corpus

## Migration 012 — AI knowledge semantic index (M0.5C)

- **Applied on production** after Phase 3 Postgres/pgvector verification and Phase 4 first real index.
- **Extension:** `vector` in schema `extensions` (width contract **1536**; no HNSW/IVFFlat)
- **Search RPC:** `ai_knowledge_search` uses `search_path = public, extensions` and positional `RETURN QUERY` (OUT-column conflict fix)
- **Objects:** `retrieval_source_version` on sources; `ai_knowledge_version_index`; `ai_knowledge_embeddings`
- **Index state model:** per `(source_id, source_version)` — avoids ambiguous source-level `index_status` when text v2 fails while retrieval stays on v1
- **RPCs (service_role only):** `ai_knowledge_begin_index`, `ai_knowledge_finalize_index_success`, `ai_knowledge_finalize_index_failure`, `ai_knowledge_upsert_embeddings`, `ai_knowledge_gc_non_retrieval_versions`, `ai_knowledge_search`
- **Finalize change:** retain prior text versions (no retrieval blackout); persist server-derived `page_count`
- **Upsert:** job-scoped embedding writes; stale jobs cannot persist vectors
- **GC:** separate from retrieval flip; deletes versions that are neither current text nor retrieval-active
- **Vectors:** never SELECT-granted to `authenticated`/`anon`

## Migration 013 — Notebook page knowledge foundation (M0.8B)

- **Additive:** `source_kind` adds `notebook_page`; column `notebook_object_id` (parent notebook FSO)
- **Identity:** PDF unique `(source_kind, source_object_id)`; notebook page unique `(source_kind, notebook_object_id, source_object_id)` (page IDs are not globally unique)
- **FK:** `source_object_id` no longer FKs to FSO (page IDs are not FSO rows). Parent cascade via `notebook_object_id` → `free_space_objects` ON DELETE CASCADE. PDF cascade via AFTER DELETE trigger on FSO.
- **Ownership trigger:** kind-aware; notebook_page proves parent type=`notebook`, section/user match, and live page membership in `object.content.pages`
- **Soft page delete:** not DB-cascaded (page removed from JSON; client tombstone). Explicit knowledge delete remains a later lifecycle (M0.8E+)
- **Search:** `ai_knowledge_search` fail-closed to `free_space_pdf` until M0.8F
- **RPCs:** `ai_knowledge_begin_ingest` remains PDF-only; no Notebook extraction/index in this migration
- **Do NOT apply to Production** until a later approved release gate

## Migration 016 — Mixed course search (M0.8F)

- **Replaces** `ai_knowledge_search` body to include `free_space_pdf` + `notebook_page` in one section-scoped ranking
- **Returns:** `source_kind`, `notebook_object_id` (nullable), never vectors
- **Scope:** `user_id` + `section_id` only (no canvas/object enumeration)
- **Lifecycle:** current `retrieval_source_version` + `indexed` version index only
- **Do NOT apply to Production** until a later approved release gate

## Migration 014 — Notebook page ingest RPCs (M0.8C)

- **RPCs (service_role only):** `ai_knowledge_begin_notebook_page_ingest`, `ai_knowledge_invalidate_notebook_page_corpus`
- **Reuses:** `ai_knowledge_finalize_ingest` for ready/failed text corpus writes
- **Hash authority:** server semantic extraction hash (not Storage bytes)
- **Blank invalidation:** clears `retrieval_source_version` so old Notebook text cannot remain searchable after a page becomes empty
- **No embeddings / no search widening** in this migration
- **Do NOT apply to Production** until a later approved release gate

## Migration 007 — workspace extensions

- **Objects:** `sections.exam_date`, `deadlines`, `schedule_blocks`, `course_links`
- **RLS:** enabled; policies `Users manage own deadlines|schedule blocks|course links` (`auth.uid() = user_id`)
- **FKs:** `deadlines.section_id`, `schedule_blocks.section_id` → `sections.id` ON DELETE SET NULL; `course_links.section_id` → ON DELETE CASCADE
- **Purpose:** version-control schema that existed in production before Storage / Sync V1; idempotent on re-run
- **Do NOT re-run on production** unless reconciling a fresh clone — objects already live

## Migration 009 — `user_workspace_state`

- **Scopes:** `desk` (account canvas, `workspace_id = user_id::text`), `math_zone` (section notebooks, `workspace_id = owned section UUID`)
- **Client LWW:** `updated_at_ms` (bigint milliseconds)
- **RLS:** full CRUD restricted to `auth.uid() = user_id`; INSERT/UPDATE also enforce `user_workspace_state_row_valid()`
- **App wiring:** `userWorkspaceStateCloud.ts`, `userWorkspaceStateEnqueue.ts`, flushed via `flushPendingFreeSpaceCreates.ts`

## Verification (after applying 009)

Run the SQL verification block from the migration comment / PR notes, or:

```bash
npm test -- src/lib/focusCache/userWorkspaceStateCloud.live.test.ts
```

Live tests require `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.  
Optional full authenticated round-trip: set `VITE_LIVE_TEST_EMAIL` and `VITE_LIVE_TEST_PASSWORD` in `.env`.
