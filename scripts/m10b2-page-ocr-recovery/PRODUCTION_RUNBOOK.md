# M1.1E — Production OCR recovery worker runbook

**Do not deploy until E2 is explicitly authorized.**

## Purpose

Continuously drain `ai_knowledge_page_recovery_jobs` using the trusted ledger:

claim → trusted `storage_path` download → page render → Tesseract → commit

## Recommended host (V1)

Small supervised Node VM/container (1 vCPU, 1–2 GB RAM).

Not Edge / Vercel / GitHub Actions as the primary engine.

## Runtime requirements

- Node.js **20+** (22 recommended)
- OS packages: `tesseract-ocr` (+ `eng` tessdata)
- Native: `@napi-rs/canvas` (platform binary via npm)
- Writable temp dir (`os.tmpdir()`)
- Outbound HTTPS to Supabase API + Storage

## Start command

From `scripts/m10b2-page-ocr-recovery` (after `npm install`):

```bash
node --experimental-strip-types runRecoveryWorker.ts
```

Optional Docker (local image only; do not push secrets into images):

```bash
docker build -f Dockerfile.recovery-worker -t zikuk-recovery-worker .
docker run --rm --env-file ./recovery.prod.env zikuk-recovery-worker
```

## Environment contract

| Variable | Staging | Production |
|----------|---------|------------|
| `ZIKUK_RECOVERY_ENV` | `staging` | `production` |
| `ZIKUK_RECOVERY_PROJECT_REF` | `lmgrhmyurhjlwwdedojk` | `comxmviofnotfwzbupxg` |
| `SUPABASE_URL` | `https://lmgrhmyurhjlwwdedojk.supabase.co` | `https://comxmviofnotfwzbupxg.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role | production service role |
| `ZIKUK_RECOVERY_PRODUCTION_CONFIRM` | unset | `I_UNDERSTAND_THIS_TARGETS_ZIKUK_PRODUCTION` |
| `ZIKUK_RECOVERY_CONCURRENCY` | `1` (max `2`) | `1` initially |
| `ZIKUK_RECOVERY_IDLE_MS` | `5000` | `5000` |
| `ZIKUK_RECOVERY_LEASE_SECONDS` | `120` | `120` |
| `ZIKUK_RECOVERY_MAX_ATTEMPTS` | `3` | `3` |
| `ZIKUK_RECOVERY_ENABLED` | `true` | `true` |
| `ZIKUK_RECOVERY_TESSERACT_BIN` | `tesseract` | `tesseract` |

Fail-closed: missing confirm, URL/ref mismatch, or wrong env/ref → process exits before claiming.

## Restart policy

- `Restart=on-failure` / container `restart: unless-stopped`
- Crash mid-job: lease expires → job reclaimable (no corrupt partial commit without claim token)

## Health / observability

- Startup JSON: `page_ocr_worker_lifecycle` / `config_ok`
- Idle: `idle_sleep`
- Per job: `page_ocr_worker` phases (`claim`, `resolve`, `ocr`, `commit`) — metadata only
- Never logs OCR text, PDF bytes, signed URLs, or service keys

Operator checks:

1. Process alive + recent `idle_sleep` or `commit` lines
2. SQL: count of `queued` / `claimed` / terminal jobs on `ai_knowledge_page_recovery_jobs`
3. Stuck `claimed` past lease → expect reclaim after expiry

## Stop / kill switch

1. `SIGTERM` / `SIGINT` — stops new claims; in-flight cycle finishes; leases recover leftovers
2. Set `ZIKUK_RECOVERY_ENABLED=false` and restart (refuses claim/OCR)
3. Stop the process/container

## Verify queue drain

```sql
select status, count(*) from public.ai_knowledge_page_recovery_jobs group by 1;
```

Expect `queued` trending to zero while worker is healthy.

## Rollback

1. Stop worker
2. Leave DB/RPCs unchanged (worker is consumer-only)
3. Jobs remain queued/leased until expiry then requeue

## Staging acceptance

```bash
node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingWorkerAcceptance.ts
```

Must never set Production confirm or Production URL.
