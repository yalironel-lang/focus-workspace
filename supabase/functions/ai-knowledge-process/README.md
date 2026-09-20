# ZIKUK AI — `ai-knowledge-process` (M0.7A)

Server-side orchestration: authorized request → knowledge ingest → knowledge index.

```text
JWT → auth.getUser()
  → runKnowledgeProcess
       → runKnowledgeIngest(...)   // direct shared call (not HTTP)
       → runKnowledgeIndex(...)    // direct shared call (not HTTP)
  → normalized process result
```

## Client body

```json
{ "version": 1, "sectionId": "<uuid>", "sourceObjectId": "<text id>" }
```

Server resolves user, storage path, hash, model, dimensions, and versions.
Clients must not send those.

## Auth

`verify_jwt = true` in `supabase/config.toml`.

## Not in M0.7A

- job / queue tables
- cron / background workers
- client PDF upload auto-wiring
- Ask / Explain quota debit
- retrieval-policy changes

## Deploy

**Do not deploy until explicitly approved.** Implementation phase is local-only.
