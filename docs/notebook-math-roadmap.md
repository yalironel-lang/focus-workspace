# Notebook-First Math — Execution Roadmap

**Locked decision:** No separate Math Zone destination. The **Notebook** is the mathematical home inside Focus.

**Out of scope for this roadmap:** Problem Lab (frozen), Course Trap / Impulse Round (stop), readiness systems, new standalone products.

**Status:** Awaiting approval — **no implementation started.**

---

## 1. Current notebook capabilities

**Primary surface:** [`ProjectNotebookBlock.tsx`](../src/components/project-space/ProjectNotebookBlock.tsx) (~5,400 lines) — canvas notebook object on Free Space.

| Capability | Details |
|------------|---------|
| **Block model** | Line-based body → parsed blocks: title, section, bullet, ordered, task, quote, callout, **step** (`=>`), **math** (`$$`), paragraph, divider, image-ref |
| **Edit / preview** | Toggle `editorMode`: edit (contenteditable lines) vs preview (KaTeX read) |
| **Surfaces** | `notebookSurface`: `spatial` (dark glass) vs `paper` (warm document) |
| **Paper styles** | `ruled`, `grid`, `blank` |
| **Modes** | `notebookMode`: `normal` \| `math` \| `math-workspace` \| `scratch` |
| **Math mode toggle** | Switches to equation-friendly defaults + calculus seed body |
| **Slash commands** | `/eq`, `/derivative`, `/integral`, `/limit`, `/sum`, `/matrix`, `/cases`, `/vector`, `/graph`, `/step` |
| **Tab expansions** | STEM shortcuts via [`mathStemShortcuts.ts`](../src/lib/mathStemShortcuts.ts) |
| **Templates** | Math template popover (fraction, integral, etc.) via [`mathInputAssistant.ts`](../src/lib/mathInputAssistant.ts) |
| **Selection toolbar** | Rich text marks, duplicate, morph block kind |
| **Context sidebar** | Linked PDFs, mistakes, notes, tools on canvas |
| **Export** | Markdown / plain text via [`notebookExport`](../src/lib/notebookExport.ts) |
| **Free-space integration** | Fullscreen spatial writing, ambient lighting hook, scroll isolation from canvas |
| **Focus canvas** | `panViewportToBlock`, search index, notebook pose persistence |

**Entry points:** Add notebook on canvas, starter packs ([`buildWorkspaceStarterPack.ts`](../src/workspaceStarter/buildWorkspaceStarterPack.ts)), section work-surface modules (legacy).

---

## 2. Current math-related capabilities

| Area | Location | What it does |
|------|----------|--------------|
| **Equation blocks** | [`EquationBlockEditor.tsx`](../src/components/notebook/EquationBlockEditor.tsx) | Simple ↔ LaTeX, KaTeX preview, plain-math conversion |
| **Step blocks** | [`StepBlockRenderer.tsx`](../src/components/notebook/StepBlockRenderer.tsx) | Derivation steps (`=>` lines), visual step chrome |
| **Math paragraphs** | [`MathEditableParagraph.tsx`](../src/components/notebook/MathEditableParagraph.tsx) | Auto-detect math lines, inline/display KaTeX |
| **Math toolbar** | [`MathInputToolbar.tsx`](../src/components/notebook/MathInputToolbar.tsx) | Insert snippets into focused line |
| **Symbol bar** | [`MathSymbolBar.tsx`](../src/components/notebook/MathSymbolBar.tsx) | Quick symbol insert |
| **Study insight** | [`MathStudyInsight.tsx`](../src/components/notebook/MathStudyInsight.tsx) | Heuristic topic tags from body text |
| **Rich text** | [`MathRichText.tsx`](../src/components/notebook/MathRichText.tsx) | Marked math lines in preview |
| **Topic heuristics** | [`mathTopicHeuristics.ts`](../src/lib/mathTopicHeuristics.ts) | Tags / recall hints from content |

---

## 3. Existing graph functionality

**Not inside the notebook.** Separate canvas object:

- [`FreeSpaceGraph.tsx`](../src/components/project-space/FreeSpaceGraph.tsx) — `type: 'graph'` on workspace
- Expression plotting via [`safeMathExpr.ts`](../src/lib/safeMathExpr.ts)
- Presets (x, x², sin, e^x), pan/zoom, axis bounds
- Slash `/graph` in notebook inserts **text** (`y=x^2`), does **not** spawn or embed graph object

**Gap:** No linked representation between notebook math lines and live graph objects.

---

## 4. Existing equation functionality

- `$$ … $$` lines → equation block editor (display math)
- `=>` lines → step blocks
- Plain math in paragraphs → `plainMathToLatex` + KaTeX
- Math mode notebook: simple-first equation editing, grid paper default
- **math-workspace** mode: forces simple mode, hides LaTeX toggle, tighter layout (820px column)

---

## 5. Existing “math workspace” functionality (split across two systems)

### A. Canvas `notebookMode: 'math-workspace'` (keep path)

- Lives in **ProjectNotebookBlock** on Free Space
- ∑ badge, grid paper, step/equation emphasis, reduced chrome
- Used by `handleCreateMathZone` cluster (problem + solution + scratch notebooks)
- Seeds: [`mathNotebookSeed.ts`](../src/lib/mathNotebookSeed.ts)

### B. Section-level **Math Zone** destination (remove path)

- [`MathZone.tsx`](../src/components/math-zone/MathZone.tsx) (~2,000 lines) — separate full-screen view
- TipTap editor, localStorage notebooks (`fw_math_nb_*`), pages, **REFS** / **SCRATCH** drawers
- Wired in [`SectionPage.tsx`](../src/pages/SectionPage.tsx) as `sectionViewMode === 'math-zone'`
- Shell toggle: **∑ Studio** in [`FloatingWorkspaceShell.tsx`](../src/components/workspace-shell/FloatingWorkspaceShell.tsx)
- Router: [`mathSurfaceRouter.ts`](../src/lib/mathSurfaceRouter.ts), [`mathZoneActivity.ts`](../src/lib/mathZoneActivity.ts)
- Shared libs: [`mathZoneInlineFormat.tsx`](../src/lib/mathZoneInlineFormat.tsx), [`TiptapFormatBubbleMenu.tsx`](../src/components/math-zone/TiptapFormatBubbleMenu.tsx)

**Problem:** Two editors, two storage models, one name (“Math Zone”) — violates Notebook-first decision.

---

## 6. Existing notebook limitations

| Limitation | Impact |
|------------|--------|
| **Monolith component** | Hard to add Stuck mode, risky changes |
| **No Stuck flow** | Product decision (diagnosis → insight → sentence) not in codebase |
| **Graph disconnected** | `/graph` is text only; Desmos wins |
| **Math Zone parallel** | Users confused by ∑ Studio vs canvas notebook |
| **math-workspace underdiscovered** | Buried in mode toggle / create cluster |
| **MathStudyInsight weak** | Tags only; not blockage diagnosis |
| **No PDF→notebook stuck entry** | PDF open doesn’t offer “unblock in notebook” |
| **Course Trap still wired** | [`CourseTrapPrototypeOverlay`](../src/components/course-trap/CourseTrapPrototypeOverlay.tsx) on PDF — conflicts with “stop experiments” |
| **Impulse Round V0** | Recent overlay — product said stop learning experiments |
| **Preview/edit split** | Good for notes; extra toggle for rapid math work |
| **No thinking-under-step layer** | Product-designed in Proof Desk doc, not in blocks |
| **localStorage MathZone** | Orphan data if destination removed without migration plan (Phase 1: deprecate UI only) |

---

## 7. What can be reused

| Asset | Reuse for |
|-------|-----------|
| **ProjectNotebookBlock** block parser + step/math kinds | Math-native notebook, future Stuck → insert blocks |
| **EquationBlockEditor + KaTeX pipeline** | All equation UI |
| **StepBlockRenderer** | Derivation posture inside notebook |
| **mathInputAssistant + mathStemShortcuts** | Slash, templates, plain math |
| **MathEditableParagraph** | Mixed prose/math lines |
| **notebookMode: math / math-workspace / scratch** | Postures inside one notebook (rename UX, not new product) |
| **NotebookContextSidebar** | PDF + mistake links beside math work |
| **FreeSpaceGraph** | Phase 3: link graph object to notebook selection |
| **mathNotebookSeed** | Default bodies for math notebooks |
| **handleCreateMathZone layout** | Starter template for “problem + solution + scratch” cluster on canvas |
| **TipTap formatting ideas** | Optional later for long-form read mode — not Phase 1 |
| **Workspace shell, PDF cards, canvas** | Context for notebook-first flows |

---

## 8. What should be removed (or deprecated)

| Item | Action |
|------|--------|
| **Section view `math-zone`** | Remove from shell toggle, SectionPage surface, onboarding copy |
| **`MathZone.tsx` destination** | Deprecate UI entry; keep file until migration complete (Phase 1 hide, Phase 2 delete) |
| **`math-zone` in `sectionViewMode`** | Remove mode; router defaults to free-space |
| **∑ Studio label in VIEW_MODES** | Remove |
| **Notebook controls routed to MathZone** | `notebookControlsOpen` in SectionPage tied to math-zone — retarget or remove |
| **Course Trap / Impulse overlay** | Disable per product freeze (feature flag off or remove trigger) |
| **Parallel localStorage math notebooks** | Do not invest; optional one-time export hint in Phase 2 |
| **Marketing “Math studio” as destination** | Copy pass |

**Do not remove yet:** `math-workspace` **notebook mode** on canvas — rename to **“Derivation”** or **“Math focus”** posture in Phase 1 copy only.

---

## 9. What should become Notebook-first

| Behavior | Notebook-first shape |
|----------|----------------------|
| Open ∑ / do math | Open or focus a **notebook object** on canvas (math or math-workspace mode) |
| Derivation layout | `handleCreateMathZone` → **“Math setup”** template (3 linked notebooks or sections in one) |
| Stuck on homework | **Stuck mode** overlay on active notebook (future product UX — Phase 2) |
| Equation-heavy writing | Default **math mode** on new notebooks in math courses |
| Graphing | Phase 3: **embed or link** graph object from notebook, not separate destination |
| Return from PDF | PDF card action: **“Unblock in notebook”** → new/focus notebook Stuck flow |
| Study insight | Evolve tags → **blockage hints** only when Stuck exists (Phase 2+) |

---

# Phased execution

## PHASE 1 — Highest impact, ship quickly (≈2–4 weeks)

**Goal:** One mathematical home, zero second destination, clearer entry.

| # | Work | Rationale |
|---|------|-----------|
| 1.1 | **Hide Math Zone destination** — remove shell mode, hide `MathZone` render in SectionPage, remove onboarding tile for ∑ studio | Instant alignment with decision |
| 1.2 | **Rename & clarify notebook modes** in UI: Normal / **Math** / **Derivation** (was math-workspace) / Scratch | Users find math without new product |
| 1.3 | **Promote “Math notebook” create** — canvas add menu + starter: single math notebook with seed, not three-zone unless user picks “Problem setup” | Reduces cluster confusion |
| 1.4 | **Freeze learning experiments** — disable Course Trap auto-surface on PDF; keep palette export if needed for metrics postmortem | Stop contradicting Notebook-first |
| 1.5 | **Default math affordances visible** — math mode shows symbol bar + slash hint on empty notebook; equation mode obvious | Faster than Desmos for **writing** math |
| 1.6 | **Fix discoverability** — ∑ badge on `math-workspace` notebooks on canvas; tooltip “Derivation notebook” | Reuse existing mode |
| 1.7 | **Document for team** — this roadmap + “no math-zone PRs” | Prevent regression |

**Phase 1 does not build:** Stuck flow, embedded graphs, TipTap merge.

**Success metrics:** No user can navigate to ∑ Studio; math notebook creates ↑; support tickets about “where is math” ↓.

---

## PHASE 2 — Math-native notebook experience (≈4–8 weeks)

**Goal:** Notebook is where stuck + derivation lives (product: Stuck Sprint inside notebook).

| # | Work | Rationale |
|---|------|-----------|
| 2.1 | **Stuck mode (MVP)** — overlay on `ProjectNotebookBlock`: paste problem → diagnosis copy → one insight panel → one sentence → dismiss back to same notebook | Locked product flow; no new destination |
| 2.2 | **Extract notebook shell** — split parser, block list, math chrome from 5k-line file into modules (enables 2.1 safely) | Engineering enabler |
| 2.3 | **Thinking under step (light)** — optional collapsed “thinking” sub-line under step blocks (inline B from prior UX docs) | Derivation without Problem Lab |
| 2.4 | **PDF → Stuck entry** — PDF card: “Unblock in notebook” creates/focuses notebook, opens Stuck with problem text | Pull from PDF context |
| 2.5 | **Retire MathZone.tsx** — delete dead code; optional import localStorage legacy once | Clean codebase |
| 2.6 | **Deprecate mathSurfaceRouter math-zone branch** | Single thread: canvas notebook |
| 2.7 | **Insight content v1** — curated blockage copy + static visuals per topic template (calc/LA); no AI weak areas | Honest, shippable |

**Phase 2 does not build:** Full Proof Desk (Problem Lab), readiness, four-pane studio.

**Success metrics:** Stuck completion rate; return within 7 days; user sentence submitted; time-to-dismiss &lt; 15 min.

---

## PHASE 3 — Advanced mathematical workspace tools (≈8+ weeks)

**Goal:** Depth for semester-long use without new product surface.

| # | Work | Rationale |
|---|------|-----------|
| 3.1 | **Notebook ↔ graph link** — select expression → open/update linked `graph` object; or inline mini-plot | Beats “Desmos in another tab” inside Focus |
| 3.2 | **Representation peek** — from Stuck or math block: optional second view (table, short symbolic) behind “Still stuck” | Representation bridge as engine, not UI |
| 3.3 | **Problem setup template** — one notebook with sections: Problem / Derivation / Scratch as headings or block groups (simpler than 3 objects) | Evolves handleCreateMathZone |
| 3.4 | **Revisit list** — course-scoped “recent stuck” on notebook open | Repeat use |
| 3.5 | **Export for submission** — clean PDF/Markdown of step sequence | Exam hand-in |
| 3.6 | **Optional embed** — graph/calculator peek without leaving notebook fullscreen | Spatial tools integrated |

**Phase 3 only if Phase 2 Stuck proves pull** (interviews: ≥6/10 would use weekly).

---

## Dependency graph (conceptual)

```
Phase 1: Hide destination + mode UX + freeze traps
    ↓
Phase 2: Module split → Stuck overlay → PDF entry → delete MathZone
    ↓
Phase 3: Graph link + revisit + advanced templates
```

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Users miss old ∑ Studio | Phase 1 in-app note: “Math moved to notebooks on your canvas” |
| Stuck quality &lt; ChatGPT | Phase 2 gated on curated templates; kill if diagnosis wrong &gt;30% |
| 5k-line notebook regressions | Phase 2.2 refactor before large features |
| Scope creep to Problem Lab | Explicit frozen; Stuck does not output full solution |
| Graph work duplicates Desmos | Phase 3 only as **linked** plot from existing expression |

---

## Approval checklist

Before implementation:

- [ ] Confirm Phase 1 scope (hide destination, no Stuck yet)
- [ ] Confirm Course Trap / Impulse disabled in Phase 1
- [ ] Confirm `math-workspace` rename only (not removal)
- [ ] Confirm Phase 2 Stuck MVP is first net-new math feature
- [ ] Confirm Problem Lab remains frozen through Phase 2

---

## File reference (audit index)

| Path | Role |
|------|------|
| `src/components/project-space/ProjectNotebookBlock.tsx` | **Primary notebook — invest here** |
| `src/components/notebook/*` | Math editors & renderers |
| `src/components/math-zone/MathZone.tsx` | **Deprecate (destination)** |
| `src/pages/SectionPage.tsx` | View mode wiring, create cluster, traps |
| `src/components/workspace-shell/FloatingWorkspaceShell.tsx` | VIEW_MODES includes math-zone |
| `src/components/project-space/FreeSpaceGraph.tsx` | Canvas graph (Phase 3 link) |
| `src/lib/mathStemShortcuts.ts`, `mathInputAssistant.ts`, `notebookMath.ts` | Math input |
| `src/lib/mathSurfaceRouter.ts`, `sectionViewMode.ts` | Remove math-zone routes |
