# Focus Linear Math (FLM) — authoring dialect

**Status:** Canonical product model for math lines in Focus Workspace.

**Related:** [NOTEBOOK_MATH_ARCHITECTURE.md](./NOTEBOOK_MATH_ARCHITECTURE.md), [MATH_SHEET_PRODUCT_SPEC.md](./MATH_SHEET_PRODUCT_SPEC.md)

## Principle: linear source, LaTeX view

| Layer | Format |
|-------|--------|
| **Storage** | Plain UTF-8 string per block (`block.text`) |
| **Authoring** | Focus Linear Math dialect (this document) |
| **Display** | KaTeX via `plainMathToLatex()` in [`mathInputAssistant.ts`](../src/lib/mathInputAssistant.ts) |
| **Never stored** | KaTeX HTML, MathML, rendered images |

Students **type simply**; Focus **displays professionally**. Toolbar, slash, and Tab insert **macros** into the same dialect—not a second notation.

## Intended first-time path (Math Desk)

1. Open a math notebook / Math Desk.
2. Click a line and type naturally: `y=x^2`, `sqrt(x)`, `pi`, `int 0 to 1 x^2 dx`.
3. Optionally use the math strip for structures (fraction, root, integral, etc.).
4. On blur, the line renders with KaTeX.
5. Use **Check line** (⌘↵) to verify numeric steps—not LaTeX export.

## Canonical tokens

### Exponents and subscripts

- Use ASCII: `x^2`, `a_n`, `x^{n+1}` (braces optional for single char).
- Avoid Unicode superscripts in stored text (`x²` → normalized to `x^2` on commit).

### Roots

- `sqrt(x)` or `sqrt(expression)` — not `√x` in storage.

### Greek and constants (words, not Unicode)

| Write | Not in storage |
|-------|----------------|
| `pi` | `π` |
| `alpha`, `beta`, `theta` | `α`, `β`, `θ` |
| `infinity` or `infty` | `∞` |

### Operators and relations

| Write | Meaning |
|-------|---------|
| `->` | arrow |
| `<=` `>=` `!=` | inequalities |
| `*` or implicit juxtaposition (graph/check parsers) | multiply |

### Calculus patterns

| Pattern | Example |
|---------|---------|
| Derivative | `d/dx x^2` |
| Integral | `int 0 to 1 x^2 dx` |
| Limit | `lim x->0` |
| Sum | `sum i=1 to n i` |

### Step lines

- Prefix with `=>` for derivation steps (unchanged by normalization).

## Toolbar and templates

- Button labels may show Unicode glyphs (π, √) for readability.
- **Inserted bytes** are always dialect tokens (`pi`, `sqrt(x)`, `x^n`, etc.) via `buildSimple` / symbol `insert` fields in `mathInputAssistant.ts`.

## Opt-in LaTeX (not Math Desk default)

- `$...$` / `$$...$$` delimiters in notebook body.
- Equation blocks (`$$` lines) may use LaTeX in advanced mode.
- Strings matching `looksLikeLatex()` are passed through unchanged to KaTeX.

Math Desk emphasizes **paragraph/step lines** in FLM, not LaTeX authoring.

## Implementation map

| Function | Role |
|----------|------|
| `normalizeToLinearMath()` | Canonicalize Unicode/paste variants before save |
| `applyUnicodeMathAliases()` | Render-time aliases when legacy content has Unicode |
| `plainMathToLatex()` | FLM → LaTeX for KaTeX |
| `latexToSimple()` | LaTeX → FLM for equation editor simple mode |

## Future math-sheet

`steps[].expression` fields should use the **same FLM string** type when the math-sheet object ships. See [MATH_SHEET_PRODUCT_SPEC.md](./MATH_SHEET_PRODUCT_SPEC.md).

## Product copy (student-facing)

Type math the simple way—like `y=x^2` and `sqrt(x)`—and Focus formats it for you. Use the strip for harder pieces. Check line tests your step.
