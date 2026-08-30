# PR 3C Color Fix

**Verdict: GO**

## Root causes
1. **Swatches clipped (primary UX blocker):** Color/Number popovers were `position:absolute` inside `[data-fw-sheet-toolbar]` (`overflow:hidden`, ~32px). Swatches were invisible/unusable. Bold/Italic worked as direct buttons.
2. **Undo while cell editor active:** With the grid cell editor open, `FWorkbook.undo()` / UndoCommand hit the editor stack (no-op for sheet styles). `endEditingAsync(true)` pushed a save that consumed the next Undo. Fix: `endEditingAsync(false)` then `FUniver.undo()`/`redo()`.

## Univer API (0.25.1) — confirmed
- Text: `FRange.setFontColor(css)` → `SetStyleCommand` `{ type: "cl", value: { rgb } }`
- Fill: `FRange.setBackgroundColor(css)` → `SetStyleCommand` `{ type: "bg", value: { rgb } }`
- Reset: pass `null` for rgb
- Public adapter keeps `setFontColor` / `setFillColor` CSS strings; engine translates via facade

## Fix
- Portal popovers to `document.body` (`position:fixed`); toolbar `overflow:visible`
- `onMouseDown` preventDefault on popover/swatches to protect selection
- Preserve `lastRangeA1` for format targeting when toolbar steals focus
- Undo/redo: exit editor without save, then async Univer undo/redo

## Results
- **popover_portaled_visible**: PASS — {"portalInBody":true,"yellowVisible":true,"yellowBelowToolbar":true,"clippedByToolbar":false}
- **text_and_fill_single**: PASS — {"style":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":"#dc2626","fillColor":"#fef08a","numberFormat":"general","numberPattern":""},"cell":{"v":"Hi","t":1,"s":"kIi7Qa"},"styles":{"EXYSQc":{"bg":{"rgb":"#fef08a"}},"kIi7Qa":{"bg":{"rgb":"#fef08a"},"cl":{"rgb":"#dc2626"}}}}
- **multi_cell_range**: PASS — {"ids":["5VbqjR","5VbqjR","5VbqjR","5VbqjR","5VbqjR","5VbqjR","5VbqjR","5VbqjR","5VbqjR"],"style":{"bg":{"rgb":"#bbf7d0"},"cl":{"rgb":"#16a34a"}},"allSame":true}
- **reset_colors**: PASS — {"style":{"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":null,"fillColor":"#fff","numberFormat":"general","numberPattern":""},"st":null}
- **undo_redo_color**: PASS — {"beforeUndo":{"fill":"#bfdbfe","bg":"#bfdbfe"},"undone":{"fill":"#fff","bg":null},"redone":{"fill":"#bfdbfe","bg":"#bfdbfe"}}
- **selection_no_commit**: PASS — before=7 after=7
- **bold_regression**: PASS — bold=true
- **uov_color_persist**: PASS — {"bold":false,"italic":false,"underline":false,"horizontalAlign":null,"fontColor":"#16a34a","fillColor":"#bbf7d0","numberFormat":"general","numberPattern":""}
- **no_pro**: PASS — no Pro
- **pr3d_not_started**: PASS — no sort/filter

PR 3D not started.
