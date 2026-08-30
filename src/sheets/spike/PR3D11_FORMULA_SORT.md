# PR 3D1.1 — Formula-Safe Sort Investigation

**Verdict: B — formula-safe move APIs exist; no supported formula-safe Sort. Defer Sort.**

Do not implement PR 3D1. Do not start PR 3D2 from this work. Evidence: `tmp/sheet-pr3d11-formula-sort-probe.json`.

## Root cause (Univer 0.25.1)

Official sort:

`SortRangeCommand` (`sheet.command.sort-range`, `@univerjs/sheets-sort`)
→ `ReorderRangeCommand` (`sheet.command.reorder-range`, `@univerjs/sheets`)
→ `ReorderRangeMutation` (`sheet.mutation.reorder-range`)

`ReorderRangeMutation` deep-clones raw cell data (including `f`) into new row slots. Formula **text is not rewritten**.

`@univerjs/sheets-formula` `UpdateFormulaController` rewrites refs only for commands returned by `getReferenceMoveParams()`:

- MoveRange / MoveRows / MoveCols
- Insert/Remove row/col and delete-range variants
- Sheet rename / defined names / table name ops

**Not** `ReorderRangeCommand` / `SortRangeCommand`.

`ReorderRangeMutation` is registered only with `ActiveDirtyManager` (recalculate dirty ranges) — recalc, not reference rewrite.

This is an upstream gap in the sort→reorder path, not a Focus missing-plugin bug. `preset-sheets-core` already registers formula plugins.

## Isolated harness results

| Path | Formula-safe? |
|------|----------------|
| `FRange.sort` / `SortRangeCommand` | **No** — C stays `=B4*10` (shows 50) after Qty asc |
| `FWorksheet.moveRows` | **Yes** — `=B4*10` → `=B2*10` (shows 10); one Undo restores |
| `MoveRangeCommand` | **Yes** for relative + `$F$1*A20` → `$F$1*A25` |
| Mixed `=$F20` after MoveRange | Row part did **not** become `$F25` (matrix caveat) |

## Sort-as-MoveRows?

Possible in theory (formula rewrite exists) but unsuitable:

- N independent move commands → N undo steps (fails one-Undo sort)
- Permutation via block moves is fragile with cross-row refs / outside refs
- Would be custom orchestration, not a supported Sort API

## Missing plugins?

None relevant under Apache-2.0 OSS. No Pro package closes this. Adding `sheets-sort` alone does not enable formula rewrite on reorder.

## Filter / V1

- PR 3D2 Filter can proceed independently (hide/show rows; does not reorder).
- CSV / hardening / release can proceed without Sort.
- Prefer shipping without Sort over dangerous values-only sort.

## Recommendation

**B.** Defer Sort from Focus Sheets V1. Do not implement custom formula rewrite / multi-move sort orchestration.
