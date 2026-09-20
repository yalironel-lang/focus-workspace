# ZIKUK AI — `ai-knowledge-index` (M0.5C Phase 2)

Indexes READY knowledge chunks via a server-owned OpenAI-compatible embeddings adapter.

## Auth

`verify_jwt = true`. Client body:

```json
{ "version": 1, "sectionId": "<uuid>", "sourceObjectId": "<id>" }
```

Server resolves user, source version, model, and dimensions. Client cannot supply vectors/model/jobId.

## Secrets

Reuses:

- `AI_PROVIDER_API_KEY`
- `AI_PROVIDER_BASE_URL`

Optional:

- `AI_EMBEDDING_MODEL` (default `text-embedding-3-small`)
- `AI_EMBEDDING_DIMENSIONS` (must be `1536` if set)

## Not in Phase 2 deploy

Do **not** deploy until migration 012 is applied and explicitly approved.
No Explain / Ask Course wiring.
