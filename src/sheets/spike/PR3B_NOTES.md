# PR 3B — Sheet Universal Object View

## Undo / redo (V1)

Univer’s in-memory undo/redo history **may reset** when presentation mode remounts the engine (floating ↔ split ↔ fullscreen).

This is acceptable for PR 3B.

Invariants:

- Document content must never roll back across a presentation transition
- An old engine’s history must never affect a newly mounted engine
- Undo/redo inside a single active presentation works normally via Univer

## Dirty handoff

Before `viewMode` / `splitSide` changes, `flushSheetForObject` synchronously exports the active workbook into canonical `ProjectSpaceObject` content via `updateObjectContent`. Unmount flush alone is not sufficient because React remounts UOV from props in the same render that applies the mode change.

## Escape

While a Sheet cell editor is active (`set-cell-edit-visible`), the first Escape is deferred so Univer can cancel editing. A subsequent Escape returns UOV to floating. Other UOV object types are unchanged.
