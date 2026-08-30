# Change-detection evidence (PR 2)

**Question:** Can Focus reliably know that persistent spreadsheet content changed?

**Mechanism:** subscribe to Univer `FWorkbook.onCommandExecuted` and emit `onDocumentChanged` only when `command.type === CommandType.MUTATION` (2). Univer documents MUTATION as snapshot-persisted change and OPERATION as non-snapshot (selection, scroll).

**Verdict:** **GO**

## GATE 1 — real clipboard paste

- Path used: `navigator.clipboard.writeText + ControlOrMeta+v`
- Limitation: none
- Multi-cell values: PASS `{"A20":{"value":"CP1","formula":""},"B20":{"value":"CP2","formula":""},"A21":{"value":"CP3","formula":""},"B21":{"value":"CP4","formula":""}}`
- onDocumentChanged: PASS (fires=1)
- Mutations: `[{"id":"sheet.mutation.set-range-values","type":2}]`
- Observed (incl. non-mutations): `[{"id":"sheet.operation.set-selections","type":1},{"id":"sheet.operation.set-activate-cell-edit","type":1},{"id":"sheet.operation.set-activate-cell-edit","type":1},{"id":"sheet.operation.set-selections","type":1},{"id":"sheet.operation.set-activate-cell-edit","type":1},{"id":"sheet.operation.set-selections","type":1},{"id":"sheet.operation.set-selections","type":1},{"id":"sheet.operation.set-activate-cell-edit","type":1},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.operation.set-selections","type":1},{"id":"sheet.operation.set-activate-cell-edit","type":1}]`

This gate does **not** use `setValues` / `pasteValues`.

## GATE 2 — non-cell persistent mutations

| Operation | Result | Command ids/types | onDocumentChanged |
|-----------|--------|-------------------|-------------------|
| cell formatting (bold) | PASS | `[{"id":"sheet.mutation.set-range-values","type":2}]` | true |
| row insert | PASS | `[{"id":"sheet.mutation.insert-row","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2}]` | true |
| row delete | PASS | `[{"id":"sheet.mutation.remove-rows","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2}]` | true |
| column insert | PASS | `[{"id":"sheet.mutation.insert-col","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2}]` | true |
| column delete | PASS | `[{"id":"sheet.mutation.remove-col","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2}]` | true |

## Prior cell-value gates

| Mutation | Result | Notes |
|----------|--------|-------|
| setCellValue | PASS | mutationEvents=1 |
| formula edit | PASS | mutationEvents=3 |
| adapter setValues (not clipboard) | PASS | mutationEvents=1 (not GATE 1) |
| clipboard paste | PASS | see GATE 1 |
| clear/delete | PASS | mutationEvents=1 |
| undo | PASS | mutationEvents=1 |
| redo | PASS | mutationEvents=1 |
| typing/edit | PASS | mutations 0 → 1 |
| selection-only | PASS | mutationEvents=0 (expect 0) |

Remount ID preserve: PASS {"before":{"workbookId":"fwb-07f82270-27cd-4580-8b64-672da1b4b0ce","worksheetId":"fws-3d80d120-6195-4585-b948-72f1aede8dbf"},"after":{"workbookId":"fwb-07f82270-27cd-4580-8b64-672da1b4b0ce","worksheetId":"fws-3d80d120-6195-4585-b948-72f1aede8dbf"}}

Formula remount: PASS {"formula":"=A1+B1","value":30}

Observed commands (in-page gate): `[{"id":"sheet.command.remove-row-by-range","type":0},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.insert-col","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.operation.set-selections","type":1},{"id":"sheet.operation.set-scroll","type":1},{"id":"sheet.command.insert-col-by-range","type":0},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.operation.set-activate-cell-edit","type":1},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.remove-col","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.command.remove-col-by-range","type":0},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2}]`

This is **not** continuous full-workbook export.
