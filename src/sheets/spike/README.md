# Focus Sheets — PR2 spike harness

DEV-only. Consumes production `src/sheets/domain` and `src/sheets/engine`.

## Run

```bash
npm run dev
```

Open `/debug/sheet-spike`

## Production vs spike

- Production code must not import from this folder.
- Large serialize fixtures remain here (`spikeFixtures.ts`).
- Change-detection evidence: `CHANGE_DETECTION.md`

## Cleanup

1. Delete `src/sheets/spike/` when Free Space integration is proven
2. Remove DEV route from `src/App.tsx`
