# Focus Sheets — PR1 Univer spike

DEV-only feasibility harness. **Not** Free Space / persistence / product UI.

## Run

```bash
npm run dev
```

Sign in, open: `/debug/sheet-spike`

## Cleanup

1. Delete `src/sheets/spike/`
2. Remove the DEV route block from `src/App.tsx`
3. `npm uninstall @univerjs/core @univerjs/preset-sheets-core rxjs` (if unused elsewhere)

## Plan deviation (required for license)

Do **not** install `@univerjs/presets` — it depends on advanced/collaboration presets that pull `@univerjs-pro/*`.

Spike uses:

- `@univerjs/preset-sheets-core@0.25.1`
- `@univerjs/core@0.25.1` (for `Univer` / `FUniver` / locales)
- `rxjs@7.8.2`
- local `createUniverOss.ts` shim (mirrors OSS `createUniver`)
