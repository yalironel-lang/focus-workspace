# Product layers — document, spatial memory, solving

This workspace is organized around **three layers**, not one generic "card" type.

## 1. Document layer — Notebook

**Object:** `notebook`

**Feels like:** Word, Craft, Apple Notes — a page you read and write for hours.

**Implementation notes:**

- `notebookSurface: 'spatial' | 'paper'` — dark spatial desk vs warm document page
- `paperStyle: 'blank' | 'ruled' | 'grid'` — line texture on either surface
- Editor trust (caret, block ids, focus mode) is non-negotiable before new features

**Not:** primary storage for screenshots, PDFs, or multi-step derivations.

## 2. Spatial memory layer — Free Space

**Objects:** `image`, `pdf`, `link`, `studyfile`, `companion`, …

**Feels like:** throwing references onto a desk — they land, stay, move, persist.

**Implementation notes:**

- Canvas is the operating layer (`FreeformCanvas`, positions, connections)
- Images: IndexedDB blobs (`freeSpaceImageIdb`), drop + paste, minimal chrome (`FreeSpaceImageCard`)
- PDFs: same pattern (`freeSpacePdfIdb`)

**Not:** the main long-form writing surface.

## 3. Solving layer — Math Sheet (future)

**Object:** `math-sheet` (spec only — see `docs/MATH_SHEET_PRODUCT_SPEC.md`)

**Feels like:** a dedicated work pad for mathematics — steps, scratch, linked tools.

**Not:** notebook paragraph modes or floating widget math.

## Hierarchy vs "cards"

| Wrong mental model | Correct mental model |
|--------------------|----------------------|
| Everything is a card variant | Each type has a **role** on the canvas |
| Notebook does everything | Notebook = document; image = memory artifact; PDF = source |
| Math in the same editor as prose | Math Sheet = separate object and editor |

## Material tiers (visual only)

`freeSpaceMaterials.ts` — `primary` (notebook, pdf), `secondary` (note, mistake), `utility` (image, link, tools).

Tiers affect shadow/border weight, not capabilities.

## Implementation order

1. Editor trust (Sprint 1)
2. Paper Mode (`notebookSurface: 'paper'`)
3. Canvas image objects
4. Math Sheet (spec → build)

No ambient/visual redesign detours between these steps.
