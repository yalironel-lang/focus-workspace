# Focus Sheets PR1 — Univer spike evidence

Generated: 2026-08-29 (automated harness + install audit)

## Dependencies (installed)

| Package | Version | License |
|---------|---------|---------|
| `@univerjs/core` | 0.25.1 | Apache-2.0 |
| `@univerjs/preset-sheets-core` | 0.25.1 | Apache-2.0 |
| `rxjs` | 7.8.2 | Apache-2.0 |

Transitive `@univerjs/*` packages aligned at **0.25.1** (Apache-2.0), plus `@univerjs/icons@1.4.0` (MIT). `@univerjs/telemetry` has undefined `license` field (OSS interface package).

### `@univerjs-pro/*`

**Not present** in `package-lock.json` after remediation.

**Plan deviation:** `@univerjs/presets@0.25.1` was attempted first; it **hard-depends** on advanced/collaboration presets that pull `@univerjs-pro/*`. Uninstalled. Spike uses `createUniverOss.ts` + `@univerjs/core` + `@univerjs/preset-sheets-core` only.

Also added **devDependency** `playwright@1.52.0` for `runSpikeEvidence.mjs` (not required at runtime).

## Serialization sizes (`workbook.save()` JSON UTF-8)

| Fixture | Bytes | Remount mount ms (warm) | Export ms |
|---------|------:|------------------------:|----------:|
| empty | 889 | 38 | 0 |
| 100 cells | 2,359 | 36 | 0 |
| 1,000 cells | 16,664 | 45 | 0 |
| 10,000 cells | 169,671 | 39 | 4 |

Cold first mount (Univer load): **~751–1389 ms**.

**Snapshot notes:** `cellData` is **sparse** (empty cells omitted). Formula cells keep `f`; computed `v` may be absent in JSON and is **recalculated on load**. Facade `getValue()` returns live results (C1=30, etc.).

## Bundle / lazy load

- `npm run build` (production): **no** `@univerjs` / `SheetEngineSpike` strings in `dist/assets/*.js`.
- DEV route: `import.meta.env.DEV` + `React.lazy`.
- Univer CSS/JS load only when spike mounts (observed Vite dep requests under `/debug/sheet-spike`).

## Formulas (automated)

- `=A1+B1` → 30
- `=B2*C2` → 12
- `=SUM(A3:A7)` → 15
- `=1/0` → `#DIV/0!`
- invalid `=NOTAFORMULA(` → `#VALUE!`
- set A1=100 → C1 updates to **120** (dependency recalc)

## Acceptance matrix (evidence-backed)

| Capability | Verdict | Notes |
|------------|---------|-------|
| React 19 compatibility | **PASS** | Mount OK |
| Editable grid | **MANUAL_REQUIRED** | Smoke click+type attempted; cell commit not API-verified |
| Range selection | **MANUAL_REQUIRED** | Needs visual confirm |
| Keyboard navigation | **PASS** | Enter/Arrows/Tab smoke in harness; no Focus steal observed |
| Copy/paste | **MANUAL_REQUIRED** | Intra-sheet |
| Multi-cell paste | **MANUAL_REQUIRED** | Intra-sheet |
| Formula evaluation | **PASS** | Facade probe |
| Dependency recalculation | **PASS** | Facade setValue + probe |
| Undo/redo | **MANUAL_REQUIRED** | Meta+Z smoke only |
| Resize | **PASS** | Univer ResizeObserver; harness resize + resizeHint; no errors |
| Mount/unmount restore | **PASS** | export→dispose→mount |
| Serializable state | **PASS** | sizes above |
| Reasonable 1k-cell performance | **PASS** | warm mount ~45ms; payload ~17KB |
| Keyboard isolation feasibility | **PASS** | `data-fw-cmd-ignore=1`; Meta+K did not open palette |
| License acceptable | **PASS** | OSS path; no Pro required for core+formulas |
| Transformed-parent scale | **CONDITIONAL** | Toggle exercised; pointer hit-testing not measured → Free Space risk |
| 10k-cell performance | **CONDITIONAL** | Fast warm remount; cold not separately stressed |
| CSS isolation | **CONDITIONAL** | CSS scoped to spike import; full Focus bleed not audited on `/section/:id` |
| Lazy-loading effectiveness | **PASS** | Prod build excludes spike/Univer |

## Manual steps still required (clipboard)

1. Select multi-cell range in `/debug/sheet-spike` → Cmd/Ctrl+C.
2. Paste into **Google Sheets or Excel** — confirm tabular grid.
3. Copy 3×3 from Sheets/Excel → paste into spike — confirm shape.
4. Optional: DevTools paste listener — log `clipboardData.types`, `text/plain`, `text/html`.

## Console

`ERR_CONNECTION_REFUSED` twice during harness (likely local Supabase/auth endpoint absent) — **not** Univer-specific.

## Engine recommendation

**ENGINE CONDITIONAL GO**

Core OSS Univer Sheets works under React 19 with formulas, recalc, serialize/restore, resize, lazy DEV isolation, and acceptable 1k/10k payload sizes for Focus `content` JSON. Remaining blockers for full GO: manual clipboard interop + a few interaction criteria; Free Space CSS-zoom still deferred.
