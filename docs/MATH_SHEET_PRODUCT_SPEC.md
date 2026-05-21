# Math Sheet — product & architecture spec

**Status:** Spec only — do not implement in the notebook editor sprint.

## Product role (third layer)

| Layer | Object | Purpose |
|-------|--------|---------|
| **Document** | `notebook` | Prose, definitions, review notes, light inline formulas |
| **Spatial memory** | `image`, `pdf`, `link`, … | Visual references, sources, screenshots on the canvas |
| **Solving** | `math-sheet` (new) | Multi-step mathematics, scratch, graphs, symbolic work |

The Math Sheet is **not** an extension of notebook `notebookMode: 'math'`. It is a dedicated Free Space study object with its own model and UI.

## User goals

- Set up a problem once, then work vertically through steps
- Keep intermediate algebra visible (not paragraph morphing)
- Jump to calculator / graph without leaving the solving context
- Use a **larger canvas** than a notebook card — closer to a desk pad
- Preserve work across sessions (local-first, like PDFs)

## Non-goals (v1)

- Full CAS / Wolfram parity
- Collaborative real-time solving
- Replacing the notebook for lecture notes
- Forcing LaTeX-only input (support visual + linear input paths over time)

## Object model (proposed)

```ts
type: 'math-sheet'

content: {
  type: 'math-sheet';
  title: string;
  problem: string;           // statement (plain + optional LaTeX)
  steps: MathStep[];         // ordered derivation blocks
  scratch?: string;          // freeform scratch zone
  linkedCalculatorId?: string;
  linkedGraphId?: string;
  settings?: {
    showGrid: boolean;
    stepNumbering: boolean;
  };
}

type MathStep = {
  id: string;
  label?: string;            // e.g. "Substitute", "Simplify"
  expression: string;        // primary math line (LaTeX or linear)
  note?: string;             // short prose beside the step
  collapsed?: boolean;
};
```

**Persistence:** structured JSON in `ProjectObjectContent` (not newline markdown). Optional blob store only for rendered exports / snapshots.

**Position:** standard Free Space `BlockPos` — typically wider/taller than notebook (`~640×520` default).

## UX principles

1. **Solving-first layout** — vertical step column, generous line height, aligned equals column
2. **Spatial solving** — pan/zoom inside sheet; optional split: steps | scratch | graph preview
3. **Explicit blocks** — add step, insert line, collapse step; no slash-menu paragraph transforms
4. **Tool adjacency** — "Open calculator", "Plot" create or focus linked objects (existing pattern)
5. **Calm chrome** — `primary` material tier like notebook/PDF; no sci-fi HUD

## Relationship to existing objects

| Existing | Math Sheet |
|----------|------------|
| `notebook` + `notebookMode: 'math'` | Read-only migration source; deprecate math mode over time |
| `calculator` | Linked tool; push result into active step |
| `graph` | Linked tool; expression sync from problem or step |
| `pdf` / `image` | Lineage via `sourceObjectId` — "work this problem from page 3" |

**Actions (future):**

- Notebook selection → "Send to Math Sheet" (problem text + optional image ref)
- Math Sheet → "Summarize in notebook" (export plain-language recap)

## Editor architecture (proposed)

Separate bundle from `ProjectNotebookBlock`:

- **Step list component** — immutable step ids (same stability rules as notebook blocks)
- **Equation line editor** — single surface per step (learn from `MathEditableParagraph` caret lessons)
- **KaTeX render** — reuse `notebookMath.ts` for display; input may evolve to MathLive / custom linear parser later
- **Scratch panel** — plain textarea or lightweight code-math hybrid (TBD)

Do **not** share `parseBodyToBlocks` / `EditableLine` paragraph morphing with the notebook.

## Rendering & performance

- Suspend heavy KaTeX when object off-screen (`FreeSpaceRenderPolicy` — same as notebook)
- Virtualize step list if > ~40 steps (unlikely in v1)

## Migration

1. Ship `math-sheet` type + empty shell card ("Add first step")
2. Import from notebook math seed / selection
3. Hide "Math mode" toggle in notebook UI once Math Sheet is stable (feature flag)

## Verification (when implemented)

- [ ] Create Math Sheet from Free Space add menu
- [ ] Add/reorder/delete steps without caret loss
- [ ] Link calculator + graph objects
- [ ] Reload preserves steps
- [ ] Notebook prose editing unchanged
- [ ] `npm run build` passes

## References

- Direction: `docs/NOTEBOOK_MATH_ARCHITECTURE.md`
- Layer model: `docs/PRODUCT_LAYERS.md`
