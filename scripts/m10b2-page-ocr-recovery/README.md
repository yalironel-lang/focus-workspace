# M1.0B / M1.1E — Page OCR recovery worker

Trusted claim → resolve → render → Tesseract → commit.

## Continuous worker (M1.1E)

```bash
cd scripts/m10b2-page-ocr-recovery && npm install
# Staging example (never Production without confirm):
export ZIKUK_RECOVERY_ENV=staging
export ZIKUK_RECOVERY_PROJECT_REF=lmgrhmyurhjlwwdedojk
export SUPABASE_URL=https://lmgrhmyurhjlwwdedojk.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...   # service role; never commit
node --experimental-strip-types runRecoveryWorker.ts
```

Production requires `ZIKUK_RECOVERY_ENV=production`, Production project ref,
and `ZIKUK_RECOVERY_PRODUCTION_CONFIRM=I_UNDERSTAND_THIS_TARGETS_ZIKUK_PRODUCTION`.

See [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md).

## Flow

```
claimJob → resolveTrustedJobPdf → recoverPdfPage → commitRecoveryResult
```

## Unit tests (no OCR)

```bash
npx vitest run scripts/m10b2-page-ocr-recovery/tests
```

## Staging continuous acceptance (real OCR)

```bash
node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingWorkerAcceptance.ts
```

Staging ref only: `lmgrhmyurhjlwwdedojk`. Never Production.

## Ledger guards

- Staging: `lmgrhmyurhjlwwdedojk`
- Production: `comxmviofnotfwzbupxg` only with `allowProduction` + production confirm
- Storage bucket: `user-content`
