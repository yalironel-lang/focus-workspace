# PR 3D1 Safe Sort — NO-GO

**Verdict: NO-GO** (do not commit)

## Hard blocker: formula integrity

Univer `@univerjs/sheets-sort@0.25.1` sorts via `SortRangeCommand` → `ReorderRangeCommand`.

Observed after sorting data rows by Qty ascending (header preserved with `hasTitle:true` on expand):

| Row | Name | Qty | Total formula | Displayed Total | Expected |
|-----|------|-----|---------------|-----------------|----------|
| 2 | C | 1 | `=B4*10` | 50 | `=B2*10` → 10 |
| 3 | A | 2 | `=B2*10` | 10 | `=B3*10` → 20 |
| 4 | B | 5 | `=B3*10` | 20 | `=B4*10` → 50 |

**Name/Qty rows move together** (row integrity for values OK), but **formula text is moved as a literal string** without rewriting relative references to the new row. Displayed totals are therefore wrong for the row.

This matches moving:

- original `C4` (`=B4*10`) → row 2 still as `=B4*10`
- original `C2` (`=B2*10`) → row 3 still as `=B2*10`
- original `C3` (`=B3*10`) → row 4 still as `=B3*10`

Per PR 3D1 gate: *“Do not ship sort if formula integrity is uncertain.”* → **STOP**.

## What did work (not sufficient alone)

- Package: `@univerjs/sheets-sort@0.25.1` Apache-2.0 only (no sort-ui / filter / Pro)
- Data ▾ portaled menu (not clipped)
- Contiguous expand via `expandToContinuousRange`
- Explicit multi-column range sort + text sort
- Header untouched when `hasTitle:true` on expand path
- Undo/redo of row order
- Selection/menu → 0 commits
- Blank sheet refuse

## Persistence note

Harness `persist_refresh` failed (empty cells after reload) — secondary; may be multi-sheet / flush timing. Not investigated further after formula NO-GO.

## Recommendation

Do **not** commit PR 3D1 until Univer sort adjusts relative formulas on reorder, or Focus scopes sort to **value-only ranges** (no formulas in sorted range) with an explicit product warning — that narrower scope was **not** approved in the PR brief.

PR 3D2 Filter not started.
