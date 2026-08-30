# PR 3C — Focus Sheet Toolbar Notes

## Mixed selection

Toolbar pressed states use **active-cell (anchor) style only**.
Reliable whole-range mixed-style detection is deferred — not required for PR 3C GO.

## Undo / redo

Toolbar Undo/Redo uses Univer in-memory history within one active presentation.
History may reset after UOV remount (PR 3B). Document content still persists.

## Calculate

No Calculate button is rendered. Future Calculate may add a toolbar slot later.
