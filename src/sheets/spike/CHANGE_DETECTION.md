# Change-detection evidence (PR 2)

**Question:** Can Focus reliably know that persistent spreadsheet content changed?

**Mechanism:** subscribe to Univer `FWorkbook.onCommandExecuted` and emit `onDocumentChanged` only when `command.type === CommandType.MUTATION` (2). Univer documents MUTATION as snapshot-persisted change and OPERATION as non-snapshot (selection, scroll).

**Verdict:** **GO**

| Mutation | Result | Notes |
|----------|--------|-------|
| setCellValue | PASS | mutationEvents=1 |
| formula edit | PASS | mutationEvents=3 |
| multi-cell paste (setValues) | PASS | mutationEvents=1 |
| clear/delete | PASS | mutationEvents=1 |
| undo | PASS | mutationEvents=1 |
| redo | PASS | mutationEvents=1 |
| typing/edit | PASS | mutations 0 → 1 |
| selection-only | PASS | mutationEvents=0 (expect 0) |

Remount ID preserve: PASS {"before":{"workbookId":"fwb-d6f3c803-e8de-405d-aed2-d8f22d7483fe","worksheetId":"fws-ffc6657a-16a8-4e82-9d92-8d87cb45236e"},"after":{"workbookId":"fwb-d6f3c803-e8de-405d-aed2-d8f22d7483fe","worksheetId":"fws-ffc6657a-16a8-4e82-9d92-8d87cb45236e"}}

Formula remount: PASS {"formula":"=A1+B1","value":30}

Observed commands (gate): `[{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.command.set-range-values","type":0},{"id":"sheet.operation.set-activate-cell-edit","type":1},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.command.set-range-values","type":0},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.command.set-range-values","type":0},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.command.clear-selection-content","type":0},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.mutation.set-range-values","type":2},{"id":"sheet.operation.set-selections","type":1},{"id":"sheet.operation.set-activate-cell-edit","type":1}]`

This is **not** continuous full-workbook export.
