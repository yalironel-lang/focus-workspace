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

## Migration 011 — AI knowledge foundation (M0.5A)

- **Objects:** `ai_knowledge_sources`, `ai_knowledge_chunks`
- **RPCs (service_role only):** `ai_knowledge_begin_ingest`, `ai_knowledge_finalize_ingest`
- **Source V1:** `free_space_pdf` only (`source_object_id` → `free_space_objects.id` text)
- **Lifecycle invariant:** a previously READY corpus (`content_hash` + chunks at `source_version`) is never deleted by `begin_ingest`. Replacement starts by setting `pending_content_hash` and status `stale`; old chunks are replaced only inside a successful `finalize_ingest(ready)` after full payload validation. A failed replacement restores `ready` and clears `pending_content_hash`.
- **No pgvector / embeddings** (deferred to M0.5C)
- **No extraction** (deferred to M0.5B)
- **RLS:** owners may SELECT own rows; clients cannot INSERT/UPDATE/DELETE corpus

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
