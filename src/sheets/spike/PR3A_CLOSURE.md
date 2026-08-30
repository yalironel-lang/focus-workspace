# PR 3A closure

**Verdict:** **GO**

| Gate | Result | Notes |
|------|--------|-------|
| resizeWidth | PASS | {"before":{"x":40,"y":40,"w":720,"h":480},"after":{"x":40,"y":40,"w":600,"h":384}} |
| resizeHeight | PASS | {"before":{"x":40,"y":40,"w":720,"h":480},"after":{"x":40,"y":40,"w":600,"h":384}} |
| resizeInteractiveZ1 | PASS | {"a1":"A1","range":"A1"} |
| resizeInteractiveZ07 | PASS | A1 |
| resizeHostFit | PASS | {"host":{"w":570,"h":328},"canvas":{"cssW":570,"cssH":299}} |
| resizePersist | PASS | {"pos":{"x":40,"y":40,"w":600,"h":384},"ls":{"x":40,"y":40,"w":600,"h":384}} |
| dragZ1 | PASS | {"a1":"A1","range":"A1:C5"} |
| dragZ07 | PASS | {"a1":"A1","range":"A1:C5"} |
| dragZ13 | PASS | {"a1":"A1","range":"A1:C5"} |
| moveWorked | PASS | {"beforeMove":{"x":40,"y":40,"w":600,"h":384},"afterMove":{"x":144,"y":96,"w":600,"h":384},"ls":{"x":40,"y":40,"w":600,"h":384}} |
| dragAfterMove | PASS | {"a1":"A1","range":"A1:C5"} |
| clipboardWrite | PASS | writeOk=true |
| clipboardPaste | PASS | {"path":"navigator.clipboard.writeText + ControlOrMeta+v","pasteCells":{"A20":{"value":"CP1","formula":""},"B20":{"value":"CP2","formula":""},"A21":{"value":"CP |
| clipboardPersist | PASS | {"vals":["CP1","CP2","CP3","CP4"],"geom":{"ps-sheet-1788107673863-ilj6b":{"x":144,"y":96,"w":600,"h":384}}} |

## Resize diagnosis

**Root cause of earlier FAIL:** Playwright viewport too short — the Freeform resize handle sat below the viewport (`elementFromPoint` miss), not Sheet surface intercept or broken Freeform resize wiring. Product resize uses the existing FreeformBlock handle (`data-fw-resize-handle`). FreeformBlock `maxWidth: 720px` (pre-existing) clamps growth at default Sheet width, so the harness shrinks inward (`720×480 → 600×384`). Host/canvas refit via ResizeObserver; geometry persists; A1 hit-test PASS at zoom 1.0 and 0.7.

## Auth

Authenticated SectionPage was **not** automated (dashboard shows “Continue with Google”). Manual checklist in evidence JSON — each step left for human QA when credentials are available.

## Drag selection

`getActiveRangeA1` now reads `getActiveRange` (full range), not only `getActiveCell` (anchor).
