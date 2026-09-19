# ZIKUK AI — `ai-knowledge-ingest` (M0.5B)

Server-side Course Knowledge ingestion for private Free Space PDFs.

```text
JWT → auth.getUser()
  → load section + free_space_objects (service role, ownership checks)
  → derive storage path
  → download user-content PDF bytes
  → SHA-256
  → ai_knowledge_begin_ingest
  → pdf.js text extraction (page-aware)
  → deterministic chunking
  → ai_knowledge_finalize_ingest
```

## Not in M0.5B

- embeddings / pgvector / retrieval
- OCR
- provider / OpenAI calls
- PDF AI UI

## Deploy

`verify_jwt = true` in `supabase/config.toml`.

**Do not deploy until explicitly approved.** Implementation phase is local-only.

## Client body

```json
{ "version": 1, "sectionId": "<uuid>", "sourceObjectId": "<text id>" }
```

Server derives user, path, hash, chunks. Clients must not send those.
