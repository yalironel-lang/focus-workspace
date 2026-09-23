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

## B3.2.1 staging ledger

`createSupabaseTrustedLedger(client, { projectRef })` talks to real claim /
commit RPCs and downloads PDF bytes only from the authoritative
`ai_knowledge_sources.storage_path`.

- **Allowed project ref:** `lmgrhmyurhjlwwdedojk` (`focus-workspace-staging`)
- **Refused:** Production `comxmviofnotfwzbupxg`
- **Storage bucket:** `user-content` (migration 008)
- Requires migrations **017** (+ **018** for early tip allocation) on that project
- Staging must be **ACTIVE** before any remote apply or live OCR proof

Live staging proof (metadata-only logs):

```bash
node --experimental-strip-types scripts/m10b2-page-ocr-recovery/runStagingRemoteProof.ts
```

OCR `>= 8` meaningful characters remains a **structural sanity floor only** —
not academic usability or student readiness.
