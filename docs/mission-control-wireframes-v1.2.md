# Mission Control V1.2 — Wireframe Package (Orientation Layer)

**Status:** Ready for 5-second comprehension validation  
**Reference:** [`mission-control-design-spec.md`](mission-control-design-spec.md) v1.1 + V1.2 addendum  
**Base:** [`mission-control-wireframes-v1.1.md`](mission-control-wireframes-v1.1.md) — architecture, cabinets, routing unchanged

**V1.2 changes only:** Orientation Block + Nearby Strip on MC surfaces. Warm return unchanged.

**Visual wireframes:** [`docs/wireframes/mission-control-v1.2.html`](wireframes/mission-control-v1.2.html)

---

## Global legend (additions)

```
ORIENT     Orientation Block — 3 labeled lines (This course / You / Here)
NEARBY     Nearby Strip — max 3 text links, below desk, above storage band
```

### Dominance target (MC cold return, revised)

Monument title ~26% · desk frame ~20% · CTA ~12% · Orientation Block ~10% · context/meta ~8% · Nearby Strip ~6% · L0 ~6% · periphery ~8% · cabinets ~5% · nav ~5%

---

# 1. Desktop — Cold Return (canonical)

## LAYOUT

```
┌─ LEFT RAIL 248px ──────────────┐┌─ MAIN 720px ─────────────────────────────────────────────┐
│ Quick links · Dates            ││  Shell: [ Workspace ]  [ ● Mission Control ]  [ Studio ]   │
│                                ││  📐 Macroeconomics                              ✦        │
│                                ││  L0  Exam in 9 days · You studied last night    wt 6%   │
│                                ││  ORIENTATION  wt 10%                                      │
│                                ││    This course: Final Exam 2023 · Slides · Problem sets · Moodle
│                                ││    You: Question 7 last night · 2 notebooks in progress   │
│                                ││    Here: Pick up exactly where you stopped                │
│                                ││  ┌─ DESK ZONE ────────────────────────────────────────┐  │
│                                ││  │▎ wt 46% (zone)                                       │  │
│                                ││  │▎  CONTINUE                              wt label    │  │
│                                ││  │▎  Solow Model · Question 7            wt 26%     │  │
│                                ││  │▎  Final Exam 2023 · Page 4 · Block 12              │  │
│                                ││  │▎  Last active yesterday at 11:42pm                 │  │
│                                ││  │▎  [ Resume study session ]              wt 12%     │  │
│                                ││  │▎  Open workspace →                                   │  │
│                                ││  └─────────────────────────────────────────────────────┘  │
│                                ││  NEARBY  wt 6%                                            │
│                                ││    Final Exam 2023 + Work notebook                        │
│                                ││    Slides — Ch. 4                                         │
│                                ││    Lagrange multiplier note                               │
│                                ││  STORAGE BAND  wt 5%                                      │
│                                ││  ▸ Setup (0)     ▸ Active (3)     ▸ Library                 │
│                                ││  ─ ─ ─ below fold ─ ─ ─                                   │
│                                ││  L3  tasks · capture · shelf                              │
└────────────────────────────────┘└───────────────────────────────────────────────────────────┘
```

## ABOVE THE FOLD

| Visible | Collapsed | Hidden |
|---------|-----------|--------|
| Orientation Block (3 lines) | All cabinets | L3 |
| Nearby Strip (≤3 links) | | Library sections |
| L0 whisper | | Setup expanded content |
| Desk zone + monument + CTA | | Progress %, banners |
| Rail links + dates | | |

## ORIENTATION BLOCK

| Line | Copy |
|------|------|
| This course | Final Exam 2023 · Slides · Problem sets · Moodle |
| You | Question 7 last night · 2 notebooks in progress |
| Here | Pick up exactly where you stopped |

## NEARBY STRIP

| Item | Opens |
|------|-------|
| Final Exam 2023 + Work notebook | Workspace |
| Slides — Ch. 4 | Workspace |
| Lagrange multiplier note | Workspace |

Not a second CTA. Subset of Active cabinet cluster data.

## MONUMENT (unchanged from V1.1)

| Field | Value |
|-------|-------|
| Label | CONTINUE |
| Title | Solow Model · Question 7 |
| Primary CTA | Resume study session |

---

# 2. Desktop — Warm Return

**Unchanged from V1.1.** Landing on Workspace + delegate strip. See [`mission-control-wireframes-v1.1.md`](mission-control-wireframes-v1.1.md) §2.

---

# 3. Desktop — New Course

Add Orientation Block; **no Nearby Strip** (n=0).

```
L0  Welcome · Let's build your study space
ORIENTATION
  This course: Not set up yet
  You: First visit
  Here: Add an exam PDF and connect Moodle to begin
┌─ DESK ZONE ─ … (START monument unchanged)
STORAGE: ▾ Setup (2) · ▸ Library · Active hidden
```

---

# 4. Desktop — Empty Course

```
ORIENTATION
  This course: 2 PDFs · no exam date yet
  You: No active session
  Here: Add material or open something you've uploaded
NEARBY (2 items)
  Intro slides.pdf
  Notes draft.pdf
```

Monument + Setup unchanged from V1.1.

---

# 5. Desktop — Exam Week

Same layout as Cold Return. L0: `Exam in 3 days · Pick up where you left off`. Orientation + Nearby copy identical to cold. Periphery exam date emphasis only.

---

# 6–10. Mobile screens

Same V1.2 additions as desktop counterparts. Order preserved:

1. Course title  
2. L0  
3. Orientation Block  
4. Desk zone  
5. Nearby Strip (when data exists)  
6. Periphery row (mobile)  
7. Storage band  

Warm return (§7): unchanged from V1.1.

---

# 5-SECOND COMPREHENSION TEST

Open **Desktop Cold Return** in [`mission-control-v1.2.html`](wireframes/mission-control-v1.2.html). Without tapping cabinets, a reviewer should answer:

| Question | Answer source |
|----------|---------------|
| What does this course contain? | Orientation line 1 |
| What was I doing? | Orientation line 2 + monument |
| Why does this screen exist? | Orientation line 3 |
| What should I do next? | Monument primary CTA (one button) |

**Pass:** All four answered in ≤5 seconds without opening Setup / Active / Library.  
**Fail:** User opens a cabinet to understand course contents or recent activity.

---

# PRODUCT BOUNDARY VERIFICATION

| Identity | V1.2 impact |
|----------|-------------|
| **Workspace** | Unchanged. Canvas remains primary work surface. Nearby links **into** Workspace only. Warm bypass unchanged. |
| **Studio** | Unchanged. Peer tab only; no Studio content on MC. |
| **Free Space / Canvas** | Unchanged. MC still outside the work surface — no previews, thumbnails, or embedded canvas. |
| **Global paradigm** | No app-wide dashboard. Orientation Block is MC-local copy; does not propagate to Workspace chrome or shell. |
| **Not an LMS** | No syllabus grid, grades, completion %, or module units. Inventory = **names in prose**, not course-management UI. |

## Impact on the rest of the product

Orientation Block + Nearby Strip **improve MC legibility at the threshold** without creating pressure to redesign Workspace, Studio, or Free Space:

- **No new navigation species** — same three tabs, same three cabinets, same routing.
- **No new data models** — orientation copy aggregates existing course/session signals; Nearby is a visible subset of Active cluster data.
- **Active cabinet retained** — strip reduces need to open Active on arrival; full grouped list still available on tap.
- **Risk to monitor:** if Nearby grows beyond 3 items or gains secondary CTAs, dashboard creep returns. Keep strip text-only.

Mission Control remains **a room inside the Focus house**, not a new house everything revolves around.

---

# PACKAGE CHECKLIST

| # | Screen | V1.2 delta | Status |
|---|--------|------------|--------|
| 1 | Cold return | Orientation + Nearby | Ready |
| 2 | Warm return | None | Unchanged |
| 3 | New course | Orientation only | Ready |
| 4 | Empty course | Orientation + Nearby (2) | Ready |
| 5 | Exam week | Orientation + Nearby | Ready |
| 6–10 | Mobile variants | Same deltas | Ready |

Cabinets (Appendix A), routing, and interaction flows: **unchanged from V1.1**.

---

*End of wireframe package v1.2*
