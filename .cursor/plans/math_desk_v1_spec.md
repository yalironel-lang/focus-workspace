# Math Desk V1 — Product Specification (Sign-Off)

> **Math Desk exists to help a student solve a mathematical problem faster and with less friction than paper.**

## Product adjustments (final)

1. **Formula Memory:** Open by default only when empty; collapsed by default once cards exist (user toggle persisted in `deskLayout`).
2. **Graph:** Minimal working graph in V1 — expression → plot (local `safeMathExpr`; no placeholder stub).
3. No AI, no server processing, no Σ Studio changes in V1.

## Architecture

- **Layer 1:** Problem anchor (`subtitle`) — always visible.
- **Layer 2:** Derivation surface (`body` + `ProjectNotebookBlock` desk) — dominant, non-collapsible.
- **Layer 3:** Edge handles — Formula (left), Graph + Compute (right), Scratch (bottom).
- **Layer 4:** On-demand panels — expand from handles; paper reflows.

## Default states

| Zone | Default |
|------|---------|
| Derivation | Open (full) |
| Problem | Open (compact) |
| Formula | Open if no cards; collapsed if cards exist |
| Compute, Graph, Scratch | Collapsed |

## Persistence (notebook content)

| Field | Purpose |
|-------|---------|
| `body` | Derivation work |
| `subtitle` | Problem anchor |
| `deskFormulas[]` | Manual formula memory |
| `deskScratch` | Scratch text |
| `deskLayout.collapsed` | Zone collapse overrides |
| `deskGraphExpression` | Graph expression |
| `deskComputeHistory` | Last compute entries (optional) |

## Scope

### MUST HAVE V1

Desk shell, derivation surface, problem anchor, formula CRUD, collapsible zones, compute bar (expression, no keypad), minimal graph, remove demo formulas and always-on widget stamps.

### V2 identity (shipped direction)

**Check** on the active derivation line — **numbers only** (Model A inline suffix; Model B whisper on equation mismatch only). `⌘↵` / focused-line **Check** button. No Try-a-Value, no variable prompts, no side panel.

### LATER

Plot-from-work, inline eval, full graph object embed, AI, Σ Studio, insert formula into paper.

### REMOVE

Keypad calculator, permanent formula column, DEFAULT_FORMULAS, non-functional graph placeholder, always-visible graph/calc stamps.
