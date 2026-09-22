# M1.0B B2 — Isolated page OCR recovery worker (prototype)

Local/private prototype only. **Not** wired to Edge, Storage, ingest, or Ask.

## Flow

```
PageOcrRecoveryRequest (sourceId, sourceVersion, pageNumber, …)
  → TrustedSourceResolver (fixture registry in B2; Storage/auth in future B3)
  → render ONLY requested page (pdf.js + @napi-rs/canvas @ 220 DPI)
  → local Tesseract CLI (argv only, no shell)
  → PageOcrRecoveryResult
  → destroy temp PNG dir
```

## Run unit tests (no OCR)

From repo root:

```bash
npx vitest run scripts/m10b2-page-ocr-recovery/tests
```

## Run MVT evidence (requires local Tesseract + local PDF)

```bash
cd scripts/m10b2-page-ocr-recovery && npm install
node --experimental-strip-types runMvtEvidence.ts
```

Writes `tmp/m10b2_validate/SANITIZED_B2_SUMMARY.json` (no raw page text).

## B3.2 trusted claim loop (local)

```
claimJob (ledger RPC / in-memory)
  → resolveTrustedJobPdf (source row → storagePath → bytes)
  → recoverPdfPage (render + Tesseract)
  → commitRecoveryResult (re-validates claim + versions)
```

Feature gate: `recoveryEnabled: false` skips claim/OCR.

Remote Supabase ledger adapter is stubbed until a **non-production**
database has migration 017 applied. Production must never be the first
environment for 017.
