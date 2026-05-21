# Notebook & Math Sheet — architecture direction

**Status:** Direction only. Full product spec: `docs/MATH_SHEET_PRODUCT_SPEC.md`. Layer model: `docs/PRODUCT_LAYERS.md`.

## Product split

| Surface | Role |
|---------|------|
| **Notebook** (`type: 'notebook'`) | Prose, study notes, definitions, light inline math, tasks, callouts |
| **Math Sheet** (future `type: 'math-sheet'`) | Problem setup, step-by-step work, aligned equations, links to calculator/graph |
| **Calculator / Graph** (existing) | Numeric evaluation and plotting; referenced from Math Sheet |

## Current state (notebook)

- `content.body`: newline-delimited markdown-lite lines
- `notebookMode: 'math'`: math toolbar + `MathEditableParagraph` + `$$` blocks in the **same** editor
- KaTeX via `notebookMath.ts` / `MathRichText`

## Why split math out later

1. Solving workflows need **step blocks**, not paragraph morphing.
2. Dual preview/edit surfaces in math paragraphs increase caret and focus risk.
3. Calculator and graph already exist as separate Free Space objects.
4. Notebook should stay trustworthy for **long-form writing** first.

## Migration path (future)

1. Add `ProjectObjectType: 'math-sheet'` with `body` or structured JSON for steps.
2. Seed from notebook via “Send to Math Sheet” (copy problem line).
3. Deprecate `notebookMode: 'math'` gradually; keep read-only KaTeX in notebook for inline formulas only.
4. Link objects via `sourceObjectId` (same pattern as mistakes/PDF lineage).

## Notebook editor engine (future evaluation)

If custom `contentEditable` blocks remain costly after Sprint 1 fixes, evaluate **Lexical** or **Tiptap** for the notebook only; Math Sheet may use a dedicated equation-centric model.
