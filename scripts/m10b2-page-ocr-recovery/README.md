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

## Dependencies

- Node 22+ (strip-types) / tested on Node 26
- `@napi-rs/canvas`, `pdfjs-dist` (this package)
- System `tesseract` + `eng` tessdata
